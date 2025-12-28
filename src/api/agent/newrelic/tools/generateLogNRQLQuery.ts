import { tool } from 'langchain';
import { z } from 'zod';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StructuredOutputParser } from '@langchain/core/output_parsers';

import { removeThinkTag } from '@/libraries/langchain/utils';

import type { LLMToolOptions } from './types';

/**
 * LLM tool that generates a NRQL query to fetch logs based on investigation context.
 */
export const createGenerateLogNRQLQueryTool = ({ logger, model }: LLMToolOptions) => {
  return tool(
    async ({ contextData }) => {
      const nodeLogger = logger.child({ tool: 'generate_log_nrql_query' });
      const prompt = PromptTemplate.fromTemplate(`
<system>
Generate a New Relic Query Language (NRQL) query to retrieve log messages related to the alert.
</system>

<contextual_information>
{context_data}
</contextual_information>

<instructions>
1. Use SELECT * FROM Log to retrieve full log entries
2. Include WHERE clause conditions from the original alert query
3. Set time window based on issue createdAt with aggregationWindow buffer
4. Add LIMIT MAX to get maximum logs
</instructions>

{format_instructions}
`);
      const parser = StructuredOutputParser.fromZodSchema(z.object({ nrqlQuery: z.string() }));
      const chain = RunnableSequence.from([prompt, model, removeThinkTag, parser]);
      const result = await chain.invoke({
        context_data: contextData,
        format_instructions: parser.getFormatInstructions()
      });
      nodeLogger.info({ query: result.nrqlQuery }, 'Generated NRQL query');
      return result.nrqlQuery;
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
