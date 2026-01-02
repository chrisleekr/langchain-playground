import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StructuredOutputParser } from '@langchain/core/output_parsers';

import { removeThinkTag } from '@/libraries/langchain/utils';
import { getCurrentDateTimeWithTimezone, getNRQLDateFormatExample, getTimezoneOffset } from '@/api/agent/domains/shared/dateUtils';

import type { LLMToolOptions } from '@/api/agent/domains/shared/types';

/**
 * Schema for the LLM-generated query components.
 * The SELECT clause is constructed programmatically to ensure SELECT * is always used.
 */
const queryComponentsSchema = z.object({
  whereClause: z.string().describe('The WHERE clause conditions (without the WHERE keyword)'),
  since: z.string().describe('The SINCE timestamp in NRQL format'),
  until: z.string().describe('The UNTIL timestamp in NRQL format')
});

/**
 * LLM tool that generates a NRQL query to fetch logs based on investigation context.
 *
 * Uses a deterministic approach: the LLM generates only the dynamic parts (WHERE, SINCE, UNTIL)
 * and the SELECT clause is constructed programmatically to guarantee SELECT * is always used.
 * This ensures all log fields (including ecs_task_arn) are returned.
 *
 * Uses `removeThinkTag` to strip `<think>` tags from models using chain-of-thought
 * reasoning (e.g., Claude's extended thinking). This ensures the parser only
 * receives the structured JSON output, not the reasoning process.
 *
 * Includes current date/time with timezone to ensure correct date interpretation.
 */
export const createGenerateLogNRQLQueryTool = ({ logger, model }: LLMToolOptions) => {
  return tool(
    async ({ contextData }) => {
      const nodeLogger = logger.child({ tool: 'generate_log_nrql_query' });

      // Get current date/time context for the prompt
      const currentDateTime = getCurrentDateTimeWithTimezone();
      const dateFormatExample = getNRQLDateFormatExample();
      const tzOffset = getTimezoneOffset();

      // Remove quotes from example to prevent LLM from including quotes in output
      const dateFormatExampleNoQuotes = dateFormatExample.replace(/'/g, '');

      const prompt = PromptTemplate.fromTemplate(`
<system>
Generate the components for a New Relic Query Language (NRQL) query to retrieve log messages related to the alert.

IMPORTANT: Current date/time is ${currentDateTime}
If timestamps in the context don't include a date, assume they are from TODAY.
</system>

<contextual_information>
{context_data}
</contextual_information>

<instructions>
Generate ONLY the following query components (the SELECT clause will be added automatically):

1. whereClause: The WHERE conditions from the original alert query (do NOT include the "WHERE" keyword)
   Example: "service_name = 'my-service' AND level = 'error'"

2. since: The start timestamp for the time window (based on issue createdAt with buffer)
3. until: The end timestamp for the time window

CRITICAL: Use this date format for since/until:
  Format: YYYY-MM-DD HH:MM:SS${tzOffset}
  Example: ${dateFormatExampleNoQuotes}

DO NOT include quotes around the since/until values - quotes will be added automatically by the system.
</instructions>

{format_instructions}
`);
      const parser = StructuredOutputParser.fromZodSchema(queryComponentsSchema);
      const chain = RunnableSequence.from([prompt, model, removeThinkTag, parser]);
      const result = await chain.invoke({
        context_data: contextData,
        format_instructions: parser.getFormatInstructions()
      });

      // Construct the full query programmatically to guarantee SELECT * is used
      const nrqlQuery = `SELECT * FROM Log WHERE ${result.whereClause} SINCE '${result.since}' UNTIL '${result.until}' LIMIT MAX`;

      nodeLogger.info({ query: nrqlQuery }, 'Generated NRQL query');
      return nrqlQuery;
    },
    {
      name: 'generate_log_nrql_query',
      description: 'Generate a NRQL query to fetch logs based on investigation context (issues, incidents, alerts)',
      schema: z.object({
        contextData: z.string().describe('The contextYaml from get_investigation_context')
      })
    }
  );
};
