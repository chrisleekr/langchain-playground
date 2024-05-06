import { z } from 'zod';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { Logger, getChatGroq } from '@/libraries';
import { AgentState } from '../[id].post';

const unAnonymisePIISystemPrompt: string = `You are a professional string replacement agent. Given original string and replaced string, you are responsible to replace the replaced string to the original string.

The output should be JSON format and format as Output JSON properties. Do not say anything except Output format. Do not say "Here is the output". Output must be valid JSON.

Original string/replaced string:
{replacement_pairs}

Format instructions:
{format_instructions}

Email content:
{reply_email}
`;

export const unAnonymisePIINode = (nodeLogger: Logger) => async (state: AgentState) => {
  const logger = nodeLogger.child({ node: 'un-anonymise-pii' });

  const parser = StructuredOutputParser.fromZodSchema(
    z.object({
      finalEmail: z.string().describe('The final email after un-anonymising the PII')
    })
  );

  const model = getChatGroq(0, logger);

  const chain = RunnableSequence.from([PromptTemplate.fromTemplate(unAnonymisePIISystemPrompt), model, parser]);

  const replacementPairs = Object.entries(state.anonymisePIIOutput.replacements)
    .map(([original, replaced]) => `- Original string: ${original}/Replaced string: ${replaced}`)
    .join('\n');

  logger.info({ replacementPairs }, 'Replacement pairs');

  const result = await chain.invoke({
    replacement_pairs: replacementPairs,
    reply_email: state.writeDraftEmailOutput.draftEmail,
    format_instructions: parser.getFormatInstructions()
  });
  logger.info({ result }, 'Un-anonymise PII result');

  state.unAnonymisePIIOutput = result;
  logger.info({ state }, 'State');
  return {
    ...state
  };
};
