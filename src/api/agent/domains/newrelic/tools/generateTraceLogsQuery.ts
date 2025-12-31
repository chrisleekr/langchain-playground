import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StructuredOutputParser } from '@langchain/core/output_parsers';

import { removeThinkTag } from '@/libraries/langchain/utils';

import type { LLMToolOptions } from '@/api/agent/domains/shared/types';

/**
 * LLM tool that generates a NRQL query to fetch logs for specific trace IDs.
 *
 * Uses `removeThinkTag` to strip `<think>` tags from models using chain-of-thought
 * reasoning (e.g., Claude's extended thinking). This ensures the parser only
 * receives the structured JSON output, not the reasoning process.
 */
export const createGenerateTraceLogsQueryTool = ({ logger, model }: LLMToolOptions) => {
  return tool(
    async ({ traceIds, contextData }) => {
      const nodeLogger = logger.child({ tool: 'generate_trace_logs_query' });
      const prompt = PromptTemplate.fromTemplate(`
<system>
Generate a NRQL query to fetch logs for specific trace IDs.
</system>

<trace_ids>{trace_ids}</trace_ids>
<context>{context_data}</context>

<instructions>
Generate: SELECT * FROM Log WHERE trace.id IN ('<id1>', '<id2>') SINCE <start> UNTIL <end> LIMIT 50 ORDER BY timestamp ASC
</instructions>

{format_instructions}
`);
      const parser = StructuredOutputParser.fromZodSchema(z.object({ nrqlQuery: z.string() }));
      const chain = RunnableSequence.from([prompt, model, removeThinkTag, parser]);
      const result = await chain.invoke({
        trace_ids: traceIds.join(','),
        context_data: contextData,
        format_instructions: parser.getFormatInstructions()
      });
      nodeLogger.info({ query: result.nrqlQuery }, 'Generated trace logs query');
      return result.nrqlQuery;
    },
    {
      name: 'generate_trace_logs_query',
      description: 'Generate NRQL query to fetch logs for specific trace IDs. Use traceIds from fetch_and_process_logs.',
      schema: z.object({
        traceIds: z.array(z.string()).min(1, 'At least one trace ID is required').describe('The traceIds array from fetch_and_process_logs'),
        contextData: z.string().describe('The contextYaml from get_investigation_context')
      })
    }
  );
};
