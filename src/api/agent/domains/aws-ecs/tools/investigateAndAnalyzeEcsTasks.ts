/* eslint-disable import/no-named-as-default-member */
import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import type { Logger } from 'pino';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

import type { LLMToolOptions } from '@/api/agent/domains/shared/types';
import { getErrorMessage, withTimeout, DEFAULT_STEP_TIMEOUT_MS } from '@/api/agent/core';
import { createToolSuccess, createToolError } from '@/api/agent/domains/shared/toolResponse';
import { getConfiguredTimezone } from '@/api/agent/domains/shared/dateUtils';

import { gatherTaskStatus } from './investigateEcsTasks/gatherTaskStatus';
import { gatherServiceEvents, extractUniqueServices } from './investigateEcsTasks/gatherServiceEvents';
import { gatherMetrics } from './investigateEcsTasks/gatherMetrics';
import { gatherHistoricalEvents } from './investigateEcsTasks/gatherHistoricalEvents';
import type { TaskInvestigationResult } from './investigateEcsTasks/types';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Format a date using the configured timezone for human readability.
 */
const formatDate = (date: Date | undefined): string | undefined => {
  if (!date) return undefined;
  const tz = getConfiguredTimezone();
  return dayjs(date).tz(tz).format('YYYY-MM-DD HH:mm:ssZ');
};

/**
 * Schema for parsed task ARN input.
 */
const parsedTaskArnSchema = z.object({
  region: z.string().describe('AWS region'),
  accountId: z.string().describe('AWS account ID'),
  clusterName: z.string().describe('ECS cluster name'),
  taskId: z.string().describe('ECS task ID'),
  fullArn: z.string().describe('Full ECS task ARN')
});

/**
 * Schema for the combined investigate and analyze tool input.
 */
const investigateAndAnalyzeSchema = z.object({
  taskArns: z.array(parsedTaskArnSchema).min(1).max(100).describe('Array of parsed ECS task ARN data'),
  investigationContext: z.string().optional().describe('Additional context about the investigation (e.g., alert details)'),
  includeMetrics: z.boolean().optional().default(true).describe('Whether to gather Container Insights metrics'),
  includeServiceEvents: z.boolean().optional().default(true).describe('Whether to gather service events'),
  includeHistoricalEvents: z.boolean().optional().default(true).describe('Whether to query historical events for not-found tasks'),
  metricsWindowMinutes: z.number().min(1).max(60).optional().default(5).describe('Time window for metrics in minutes'),
  historicalLookbackHours: z.number().min(1).max(168).optional().default(24).describe('Hours to look back for historical events')
});

/**
 * Analysis prompt template for ECS health analysis.
 *
 * Best practices applied:
 * - XML tags for structured sections (Anthropic recommendation)
 * - Reference data for common codes
 * - Edge case handling guidelines
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags
 */
const analysisPromptTemplate = ChatPromptTemplate.fromMessages([
  [
    'system',
    `<role>
You are an AWS ECS expert analyzing task health and performance data.
</role>

<task>
Analyze the provided ECS investigation data and provide a structured analysis.
</task>

<reference_data>
<stop_codes>
| Code | Meaning |
|------|---------|
| EssentialContainerExited | A container marked as essential exited |
| TaskFailedToStart | Task couldn't start (image pull, resource constraints) |
| ServiceSchedulerInitiated | Service stopped the task (scaling, deployment) |
| UserInitiated | Manual stop via console/CLI |
| SpotInterruption | Fargate Spot capacity reclaimed |
</stop_codes>

<exit_codes>
| Code | Meaning |
|------|---------|
| 0 | Normal exit (success) |
| 1 | General error |
| 137 | Container killed (SIGKILL) - often OOM |
| 143 | Container terminated (SIGTERM) |
| 255 | Exit status out of range |
</exit_codes>

<resource_thresholds>
| Metric | Warning | Critical |
|--------|---------|----------|
| CPU | > 80% | > 95% |
| Memory | > 80% | > 95% |
</resource_thresholds>
</reference_data>

<output_format>
1. **Summary**: Overview of the current state of the investigated tasks
2. **Issues Identified**: List any problems found (stopped tasks, unhealthy containers, high resource usage)
3. **Root Cause Analysis**: For each issue, explain the likely cause using the reference data above
4. **Recommendations**: Actionable steps to resolve or prevent the issues
</output_format>

<guidelines>
- Be concise but thorough. Focus on actionable insights.
- If data is missing or unavailable, acknowledge it explicitly.
- If all tasks are healthy with no issues, state "No issues identified" and summarize the healthy state.
- DO NOT fabricate data - only report what is provided.
</guidelines>`
  ],
  [
    'human',
    `<investigation_summary>
{summary}
</investigation_summary>

<task_details>
{taskDetails}
</task_details>

<service_events>
{serviceEvents}
</service_events>

<additional_context>
{investigationContext}
</additional_context>

Provide your analysis:`
  ]
]);

/**
 * Creates a combined tool that investigates ECS tasks AND analyzes them in one call.
 *
 * Keeps raw AWS API data internal to reduce token usage when passing to other agents.
 *
 * Returns only:
 * - analysis: LLM-generated analysis summary
 * - summary: Investigation statistics
 */
export const createInvestigateAndAnalyzeEcsTasksTool = (options: LLMToolOptions) => {
  const { logger: parentLogger, model, stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS } = options;
  const logger: Logger = parentLogger.child({ tool: 'investigate_and_analyze_ecs_tasks' });

  return tool(
    async ({
      taskArns,
      investigationContext,
      includeMetrics,
      includeServiceEvents,
      includeHistoricalEvents,
      metricsWindowMinutes,
      historicalLookbackHours
    }) => {
      const startTime = Date.now();
      logger.info(
        {
          taskCount: taskArns.length,
          includeMetrics,
          includeServiceEvents,
          includeHistoricalEvents,
          metricsWindowMinutes,
          historicalLookbackHours
        },
        'Starting ECS task investigation and analysis'
      );

      try {
        const taskResults: TaskInvestigationResult[] = [];
        const allErrors: string[] = [];

        // Step 1: Gather task status for all ARNs
        const { result: taskStatusResult, error: taskStatusError } = await gatherTaskStatus(taskArns, logger, stepTimeoutMs);

        if (taskStatusError) {
          allErrors.push(`Task status: ${taskStatusError}`);
          logger.error({ error: taskStatusError }, 'Failed to gather task status - continuing with partial data');
        }

        // Create a map for quick lookup
        const foundTasks = new Map(taskStatusResult?.tasks.map(t => [t.parsed.taskId, t]) ?? []);
        const notFoundArns = taskStatusResult?.notFound ?? [];

        // Initialize results for all requested tasks
        for (const parsed of taskArns) {
          const taskInfo = foundTasks.get(parsed.taskId) ?? null;
          taskResults.push({
            parsed,
            taskInfo,
            found: taskInfo !== null,
            metrics: null,
            historicalEvents: [],
            errors: []
          });
        }

        // Step 2: Gather Container Insights metrics (parallel)
        if (includeMetrics) {
          const metricsMap = await gatherMetrics(taskArns, logger, stepTimeoutMs, metricsWindowMinutes);

          for (const result of taskResults) {
            const metricsResult = metricsMap.get(result.parsed.taskId);
            if (metricsResult) {
              result.metrics = metricsResult.metrics;
              if (metricsResult.error) {
                result.errors.push(`Metrics: ${metricsResult.error}`);
              }
            }
          }
        }

        // Step 3: Gather historical events for not-found tasks (parallel)
        if (includeHistoricalEvents && notFoundArns.length > 0) {
          const historicalMap = await gatherHistoricalEvents(notFoundArns, logger, stepTimeoutMs, historicalLookbackHours);

          for (const result of taskResults) {
            if (!result.found) {
              const historicalResult = historicalMap.get(result.parsed.taskId);
              if (historicalResult) {
                result.historicalEvents = historicalResult.events;
                if (historicalResult.error) {
                  result.errors.push(`Historical: ${historicalResult.error}`);
                }
              }
            }
          }
        }

        // Step 4: Gather service events for unique services
        let serviceResults: Awaited<ReturnType<typeof gatherServiceEvents>> = [];
        if (includeServiceEvents && taskStatusResult) {
          const tasksWithServices = taskStatusResult.tasks.map(t => ({
            serviceName: t.serviceName,
            region: t.parsed.region,
            clusterName: t.parsed.clusterName
          }));

          const uniqueServices = extractUniqueServices(tasksWithServices);
          if (uniqueServices.length > 0) {
            serviceResults = await gatherServiceEvents(uniqueServices, logger, stepTimeoutMs);
          }
        }

        // Calculate summary statistics
        const summary = {
          totalRequested: taskArns.length,
          tasksFound: taskResults.filter(r => r.found).length,
          tasksNotFound: taskResults.filter(r => !r.found).length,
          tasksWithMetrics: taskResults.filter(r => r.metrics !== null).length,
          tasksWithHistoricalEvents: taskResults.filter(r => r.historicalEvents.length > 0).length,
          servicesQueried: serviceResults.length,
          totalErrors: taskResults.reduce((sum, r) => sum + r.errors.length, 0) + allErrors.length
        };

        // Step 5: Format data for LLM analysis (internal - not returned to other agents)
        const formattedTasks = taskResults.map(t => ({
          taskId: t.parsed.taskId,
          taskArn: t.parsed.fullArn,
          region: t.parsed.region,
          clusterName: t.parsed.clusterName,
          found: t.found,
          status: t.taskInfo
            ? {
                lastStatus: t.taskInfo.lastStatus,
                desiredStatus: t.taskInfo.desiredStatus,
                healthStatus: t.taskInfo.healthStatus,
                stoppedReason: t.taskInfo.stoppedReason,
                stopCode: t.taskInfo.stopCode,
                serviceName: t.taskInfo.serviceName,
                launchType: t.taskInfo.launchType,
                cpu: t.taskInfo.cpu,
                memory: t.taskInfo.memory,
                createdAt: formatDate(t.taskInfo.createdAt),
                startedAt: formatDate(t.taskInfo.startedAt),
                stoppedAt: formatDate(t.taskInfo.stoppedAt),
                containers: t.taskInfo.containers.map(c => ({
                  name: c.name,
                  lastStatus: c.lastStatus,
                  exitCode: c.exitCode,
                  healthStatus: c.healthStatus,
                  reason: c.reason
                }))
              }
            : null,
          metrics: t.metrics
            ? {
                avgCpuUtilizationPercent: t.metrics.avgCpuUtilizationPercent,
                maxCpuUtilizationPercent: t.metrics.maxCpuUtilizationPercent,
                avgMemoryUtilizationPercent: t.metrics.avgMemoryUtilizationPercent,
                maxMemoryUtilizationPercent: t.metrics.maxMemoryUtilizationPercent,
                dataPointCount: t.metrics.timestamps.length
              }
            : null,
          historicalEvents:
            t.historicalEvents.length > 0
              ? t.historicalEvents.map(e => ({
                  timestamp: formatDate(e.timestamp),
                  lastStatus: e.lastStatus,
                  stoppedReason: e.stoppedReason,
                  stopCode: e.stopCode
                }))
              : null,
          errors: t.errors.length > 0 ? t.errors : null
        }));

        const formattedServices = serviceResults.map(s => ({
          serviceName: s.serviceName,
          region: s.region,
          clusterName: s.clusterName,
          eventCount: s.events.length,
          recentEvents: s.events.slice(0, 10).map(e => ({
            createdAt: formatDate(e.createdAt),
            message: e.message
          })),
          error: s.error ?? null
        }));

        // Step 6: Analyze with LLM (raw data stays internal)
        const chain = analysisPromptTemplate.pipe(model).pipe(new StringOutputParser());

        const analysis = await withTimeout(
          () =>
            chain.invoke({
              summary: JSON.stringify(summary, null, 2),
              taskDetails: JSON.stringify(formattedTasks, null, 2),
              serviceEvents: formattedServices.length > 0 ? JSON.stringify(formattedServices, null, 2) : 'No service events available',
              investigationContext: investigationContext ?? 'No additional context provided'
            }),
          stepTimeoutMs * 2, // Give more time for LLM analysis
          'analyzeEcsHealth'
        );

        const duration = Date.now() - startTime;
        logger.info({ duration, ...summary }, 'ECS task investigation and analysis complete');

        // Return only the analysis and summary - raw data stays internal
        return createToolSuccess({
          analysis,
          summary,
          investigatedAt: formatDate(new Date()),
          durationMs: duration
        });
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error({ error: errorMessage }, 'Failed to investigate and analyze ECS tasks');
        return createToolError('investigate_and_analyze_ecs_tasks', errorMessage, {
          doNotRetry: true,
          suggestedAction: 'Investigation failed. Check AWS credentials and permissions.'
        });
      }
    },
    {
      name: 'investigate_and_analyze_ecs_tasks',
      description:
        'Comprehensive ECS task investigation and analysis in one call. ' +
        'Gathers task status, metrics, service events, and historical data, then analyzes with AI. ' +
        'Returns only the analysis summary - raw AWS data stays internal to reduce token usage.',
      schema: investigateAndAnalyzeSchema
    }
  );
};
