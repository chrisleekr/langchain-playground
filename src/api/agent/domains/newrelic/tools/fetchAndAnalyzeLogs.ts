import config from 'config';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import YAML from 'yaml';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';

import { executeNRQLQuery, normalizeLogs, getTraceIds } from '@/libraries/newrelic';
import { extractTaskArnsFromLogs } from '@/libraries/aws/ecs';
import { removeThinkTag } from '@/libraries/langchain/utils';
import { withTimeout, getErrorMessage, DEFAULT_STEP_TIMEOUT_MS } from '@/api/agent/core';
import { createToolSuccess, createToolError } from '@/api/agent/domains/shared/toolResponse';

import type { LLMToolOptions } from '@/api/agent/domains/shared/types';

/**
 * Tool name constant to avoid magic strings.
 */
const TOOL_NAME = 'fetch_and_analyze_logs' as const;

/**
 * Analysis prompt template for log investigation.
 * Uses YAML format for logs as it's more token-efficient than JSON.
 */
const ANALYSIS_PROMPT = PromptTemplate.fromTemplate(`
<system>
You are a professional log analyst investigating an alert. Analyze both envoy and service logs to provide a comprehensive analysis.
</system>

### CONTEXT
<context_data>
{context_data}
</context_data>

### ENVOY LOGS (YAML)
<envoy_logs>
{envoy_logs}
</envoy_logs>

### SERVICE LOGS (YAML)
<service_logs>
{service_logs}
</service_logs>

### OUTPUT FORMAT

## Request Flow Timeline
Analyze envoy logs to identify the request flow:
- For each log: [<timestamp>] <direction> <service>
  ↳ Duration: <duration>ms, Response: <code>
- End with: **Request Flow Summary**: service-A → service-B → ...
- If no envoy logs: "No envoy logs found"

## Service Errors
Identify errors from service logs:
- For each error: [<timestamp>] <service>
  ↳ Message: "<message>"
  ↳ Error: "<error>" (if available)
- If no errors: "No service errors found"

## Root Cause Analysis
Based on the context and logs, provide:
- Likely root cause of the alert
- Affected services
- Recommended actions
`);

/**
 * Combined tool that fetches logs, processes them, and analyzes in one call.
 *
 * This replaces the separate fetch_and_process_logs + analyze_logs tools,
 * keeping raw log data internal to reduce token usage when passing to other agents.
 *
 * Returns only:
 * - analysis: LLM-generated analysis summary
 * - traceIds: For optional deep-dive queries
 * - ecsTaskArns: For cross-domain routing to AWS ECS agent
 * - summary: Log counts for context
 */
export const createFetchAndAnalyzeLogsTool = (options: LLMToolOptions) => {
  const { logger, model, stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS } = options;

  return tool(
    async ({ nrqlQuery, contextData }) => {
      const nodeLogger = logger.child({ tool: TOOL_NAME });
      nodeLogger.info({ query: nrqlQuery, stepTimeoutMs }, 'Fetching and analyzing logs');

      try {
        // Step 1: Execute NRQL query with timeout protection
        nodeLogger.debug({ nrqlQuery }, 'Executing NRQL query');
        const rawLogs = await withTimeout(() => executeNRQLQuery({ query: nrqlQuery }), stepTimeoutMs, 'executeNRQLQuery');
        nodeLogger.debug({ rawCount: rawLogs.length }, 'Raw logs fetched');

        // Defensive logging: warn if query returns no results to aid debugging
        if (rawLogs.length === 0) {
          nodeLogger.warn(
            {
              query: nrqlQuery,
              contextDataPreview: contextData.substring(0, 500)
            },
            'NRQL query returned 0 results - check query syntax and time window'
          );
        }

        // Step 2: Normalize and filter logs
        const normalizedLogs = normalizeLogs(rawLogs);
        const urlProperties = config.get<string[]>('newrelic.urlLogs.properties') || [];
        const envoyLogs = normalizedLogs.filter((log: Record<string, unknown>) => log.container_name === 'envoy');
        const serviceLogs = normalizedLogs.filter((log: Record<string, unknown>) => log.container_name !== 'envoy');
        const urlLogs = normalizedLogs.filter((log: Record<string, unknown>) =>
          // eslint-disable-next-line security/detect-object-injection -- Validated with Object.hasOwn
          urlProperties.some(prop => Object.hasOwn(log, prop) && log[prop])
        );

        // Step 3: Extract trace IDs and ECS task ARNs for cross-domain routing
        // Note: parsedEcsTaskArns contains ParsedTaskArn objects (not just ARN strings)
        // which can be passed directly to the aws_ecs_expert agent
        const traceIds = getTraceIds(normalizedLogs);
        const parsedEcsTaskArns = extractTaskArnsFromLogs(normalizedLogs);

        nodeLogger.info(
          {
            total: normalizedLogs.length,
            envoy: envoyLogs.length,
            service: serviceLogs.length,
            url: urlLogs.length,
            traces: traceIds.length,
            parsedEcsTaskArns: parsedEcsTaskArns.length
          },
          'Logs processed, starting analysis'
        );

        // Step 4: Analyze logs using LLM (raw logs stay internal, only analysis returned)
        const chain = RunnableSequence.from([ANALYSIS_PROMPT, model, removeThinkTag]);
        const analysisResult = await chain.invoke({
          context_data: contextData,
          envoy_logs: envoyLogs.length > 0 ? YAML.stringify(envoyLogs) : 'No envoy logs found',
          service_logs: serviceLogs.length > 0 ? YAML.stringify(serviceLogs) : 'No service logs found'
        });

        // Extract string content from analysis result
        const analysis = typeof analysisResult === 'string' ? analysisResult : String(analysisResult.content);

        nodeLogger.info({ envoyCount: envoyLogs.length, serviceCount: serviceLogs.length }, 'Logs analyzed');

        // Return only the analysis and metadata - raw logs stay internal
        // parsedEcsTaskArns contains ParsedTaskArn objects ready for aws_ecs_expert
        return createToolSuccess({
          analysis,
          traceIds,
          parsedEcsTaskArns,
          summary: {
            totalLogs: normalizedLogs.length,
            envoyCount: envoyLogs.length,
            serviceCount: serviceLogs.length,
            urlCount: urlLogs.length,
            traceIdCount: traceIds.length,
            parsedEcsTaskArnCount: parsedEcsTaskArns.length
          }
        });
      } catch (error) {
        const message = getErrorMessage(error);
        nodeLogger.error({ error: message, query: nrqlQuery }, 'Failed to fetch and analyze logs');
        return createToolError(TOOL_NAME, message);
      }
    },
    {
      name: TOOL_NAME,
      description:
        'Execute a NRQL query, fetch logs, and analyze them in one step. Returns analysis summary, trace IDs, and parsed ECS task ARNs (ready for aws_ecs_expert). Use contextYaml from get_investigation_context.',
      schema: z.object({
        nrqlQuery: z.string().describe('The NRQL query to execute (from generate_log_nrql_query or generate_trace_logs_query)'),
        contextData: z.string().describe('The contextYaml from get_investigation_context')
      })
    }
  );
};
