import { z } from 'zod';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { Logger, getChatGroq } from '@/libraries';
import { OverallStateAnnotation } from '../[id].post';

const unAnonymisePIISystemPrompt: string = `You are a professional string replacement agent. Given original string and replaced string, you are responsible to replace the replaced string to the original string.

The output should be JSON format and format as Output JSON properties. Do not say anything except Output format. Do not say "Here is the output". Output must be valid JSON.

Original string/replaced string:
{replacement_pairs}

Format instructions:
{format_instructions}

Email content:
{reply_email}
`;

export interface UnAnonymisePIIOutput {
  finalEmail: string;
}

export const unAnonymisePIINode =
  (nodeLogger: Logger) =>
  async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
    const logger = nodeLogger.child({ node: 'un-anonymise-pii' });

    const parser = StructuredOutputParser.fromZodSchema(
      z.object({
        finalEmail: z.string().describe('The final email after un-anonymising the PII')
      })
    );

    // TODO: Uncomment this when we have a fast model for Ollama
    // const model = getChatOllama(0, logger);
    const model = getChatGroq(0, logger);

    const chain = RunnableSequence.from([PromptTemplate.fromTemplate(unAnonymisePIISystemPrompt), model, parser]);

    const replacementPairs = Object.entries(state.anonymise_pii_output.replacements)
      .map(([original, replaced]) => `- Original string: ${original}/Replaced string: ${replaced}`)
      .join('\n');

    logger.info({ replacementPairs }, 'Replacement pairs');

    const result = await chain.invoke({
      replacement_pairs: replacementPairs,
      reply_email: state.write_draft_email_output,
      format_instructions: parser.getFormatInstructions()
    });
    logger.info({ result }, 'Un-anonymise PII result');

    state.un_anonymise_pii_output = result;
    logger.info({ state }, 'State');
    return state;
  };
