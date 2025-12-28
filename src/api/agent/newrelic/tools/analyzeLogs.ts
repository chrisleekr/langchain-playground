import { tool } from 'langchain';
import { z } from 'zod';
import YAML from 'yaml';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';

import { removeThinkTag } from '@/libraries/langchain/utils';

import type { LLMToolOptions } from './types';

/**
 * LLM tool that analyzes envoy and service logs together with context
 * to identify request flow, errors, and root cause.
 */
export const createAnalyzeLogsTool = ({ logger, model }: LLMToolOptions) => {
  return tool(
    async ({ contextData, envoyLogs, serviceLogs }) => {
      const nodeLogger = logger.child({ tool: 'analyze_logs' });
      const prompt = PromptTemplate.fromTemplate(`
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
      const chain = RunnableSequence.from([prompt, model, removeThinkTag]);
      const result = await chain.invoke({
        context_data: contextData,
        envoy_logs: YAML.stringify(envoyLogs),
        service_logs: YAML.stringify(serviceLogs)
      });
      nodeLogger.info({ envoyCount: envoyLogs.length, serviceCount: serviceLogs.length }, 'Logs analyzed');

      // RunnableSequence may return either a string (after removeThinkTag)
      // or an AIMessage object depending on the model provider's response format
      return typeof result === 'string' ? result : String(result.content);
    },
    {
      name: 'analyze_logs',
      description:
        'Analyze envoy and service logs together with context to identify request flow, errors, and root cause. Use data from get_investigation_context and fetch_and_process_logs.',
      schema: z.object({
        contextData: z.string().describe('The contextYaml from get_investigation_context'),
        envoyLogs: z.array(z.record(z.unknown())).optional().default([]).describe('The envoyLogs array from fetch_and_process_logs'),
        serviceLogs: z.array(z.record(z.unknown())).optional().default([]).describe('The serviceLogs array from fetch_and_process_logs')
      })
    }
  );
};
