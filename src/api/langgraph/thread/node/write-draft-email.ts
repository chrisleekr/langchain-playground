import { z } from 'zod';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { Logger, getChatGroq } from '@/libraries';
import { OverallStateAnnotation } from '../[id].post';

const writeDraftEmailSystemPrompt: string = `You are a professional email writer agent who reply the customer's email. Given the email content, write a draft email to reply the customer. If the context is irrelevant, then do not use it. You never make up information that hasn't been provided by the contexts. Always sign off the emails with "Support Team". The output should be JSON format and format as Output JSON properties. Do not say anything except Output format. Do not say "Here is the output". Output must be valid JSON.

Contexts:
{contexts}

Format instructions:
{format_instructions}

Email Content:
{anonymised_email}
`;

export interface WriteDraftEmailOutput {
  draftEmail: string;
}

export const writeDraftEmailNode =
  (nodeLogger: Logger) =>
  async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
    const logger = nodeLogger.child({ node: 'write-draft-email' });

    const parser = StructuredOutputParser.fromZodSchema(
      z.object({
        draftEmail: z.string().describe('The draft email')
      })
    );

    const model = getChatGroq(0.5, logger);

    const chain = RunnableSequence.from([PromptTemplate.fromTemplate(writeDraftEmailSystemPrompt), model, parser]);

    const result = await chain.invoke({
      anonymised_email: state.anonymise_pii_output.anonymisedText,
      contexts: state.get_contexts_output.contexts.join('\n'),
      format_instructions: parser.getFormatInstructions()
    });
    logger.info({ result }, 'Draft email result');

    state.write_draft_email_output = result;

    if (state.number_of_draft_email_rewrites === null) {
      state.number_of_draft_email_rewrites = 0;
    }
    state.number_of_draft_email_rewrites += 1;
    logger.info({ state }, 'State');
    return state;
  };
