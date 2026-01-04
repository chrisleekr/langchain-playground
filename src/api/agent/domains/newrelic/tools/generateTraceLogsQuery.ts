import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StructuredOutputParser } from '@langchain/core/output_parsers';

import { removeThinkTag } from '@/libraries/langchain/utils';
import { getCurrentDateTimeWithTimezone, getNRQLDateFormatExample, getTimezoneOffset } from '@/api/agent/domains/shared/dateUtils';

import type { LLMToolOptions } from '@/api/agent/domains/shared/types';

/**
 * Tool name constant to avoid magic strings.
 */
const TOOL_NAME = 'generate_trace_logs_query' as const;

/**
 * Schema for the LLM-generated time range.
 * The WHERE clause is constructed programmatically from the provided trace IDs.
 */
const timeRangeSchema = z.object({
  since: z.string().describe('The SINCE timestamp in NRQL format'),
  until: z.string().describe('The UNTIL timestamp in NRQL format')
});

/**
 * LLM tool that generates a NRQL query to fetch logs for specific trace IDs.
 *
 * Uses a deterministic approach: the WHERE clause is constructed from the provided trace IDs,
 * and SELECT * is always used. The LLM only determines the time range.
 * This ensures all log fields (including ecs_task_arn) are returned.
 *
 * Uses `removeThinkTag` to strip `<think>` tags from models using chain-of-thought
 * reasoning (e.g., Claude's extended thinking). This ensures the parser only
 * receives the structured JSON output, not the reasoning process.
 *
 * Includes current date/time with timezone to ensure correct date interpretation.
 */
export const createGenerateTraceLogsQueryTool = ({ logger, model }: LLMToolOptions) => {
  return tool(
    async ({ traceIds, contextData }) => {
      const nodeLogger = logger.child({ tool: TOOL_NAME });

      // Get current date/time context for the prompt
      const currentDateTime = getCurrentDateTimeWithTimezone();
      const dateFormatExample = getNRQLDateFormatExample();
      const tzOffset = getTimezoneOffset();

      const prompt = PromptTemplate.fromTemplate(`
<system>
Determine the time range for fetching logs for specific trace IDs.

IMPORTANT: Current date/time is ${currentDateTime}
If timestamps in the context don't include a date, assume they are from TODAY.
</system>

<trace_ids>{trace_ids}</trace_ids>
<context>{context_data}</context>

<instructions>
Based on the context, determine the appropriate time window for the trace log query.
The query will be constructed as: SELECT * FROM Log WHERE trace.id IN (...) SINCE <since> UNTIL <until>

Provide only the time range:
1. since: Start timestamp (with some buffer before the incident)
2. until: End timestamp (with some buffer after the incident)

CRITICAL: Use this date format:
  Format: 'YYYY-MM-DD HH:MM:SS${tzOffset}'
  Example: '${dateFormatExample}'
</instructions>

{format_instructions}
`);
      const parser = StructuredOutputParser.fromZodSchema(timeRangeSchema);
      const chain = RunnableSequence.from([prompt, model, removeThinkTag, parser]);
      const result = await chain.invoke({
        trace_ids: traceIds.join(', '),
        context_data: contextData,
        format_instructions: parser.getFormatInstructions()
      });

      // Construct the WHERE clause from trace IDs
      const traceIdList = traceIds.map(id => `'${id}'`).join(', ');

      // Construct the full query programmatically to guarantee SELECT * is used
      const nrqlQuery = `SELECT * FROM Log WHERE trace.id IN (${traceIdList}) SINCE '${result.since}' UNTIL '${result.until}' LIMIT 50 ORDER BY timestamp ASC`;

      nodeLogger.info({ query: nrqlQuery }, 'Generated trace logs query');
      return nrqlQuery;
    },
    {
      name: TOOL_NAME,
      description: 'Generate NRQL query to fetch logs for specific trace IDs. Use traceIds from fetch_and_process_logs.',
      schema: z.object({
        traceIds: z.array(z.string()).min(1, 'At least one trace ID is required').describe('The traceIds array from fetch_and_process_logs'),
        contextData: z.string().describe('The contextYaml from get_investigation_context')
      })
    }
  );
};
