import { z } from 'zod';
import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { Logger, getChatGroq } from '@/libraries';
import { AgentState } from '../[id].post';

const shouldRewriteDraftEmailSystemPrompt: string = `You are a professional who evaluate the draft email for the customer and decide the draft email needing to rewrite to be better. The output should be JSON format and format as Output JSON properties. Do not say anything except Output format. Do not say "Here is the output". Output must be valid JSON.

Customer email:
{customer_email}

Format instructions:
{format_instructions}

Email content:
{draft_email}
`;

export const shouldRewriteDraftEmailNode = (nodeLogger: Logger) => async (state: AgentState) => {
  const logger = nodeLogger.child({ node: 'should-rewrite-draft-email' });

  if (state.numberOfDraftEmailRewrites === 2) {
    logger.info('Reached maximum number of rewrites. Move to un-anonymise-pii-node.');
    return 'un-anonymise-pii-node';
  }

  const parser = StructuredOutputParser.fromZodSchema(
    z.object({
      action: z.enum(['rewrite', 'send']).describe('The action to take on the draft email')
    })
  );

  const model = getChatGroq(0, logger);

  const chain = RunnableSequence.from([PromptTemplate.fromTemplate(shouldRewriteDraftEmailSystemPrompt), model, parser]);

  const result = await chain.invoke({
    customer_email: state.input,
    format_instructions: parser.getFormatInstructions(),
    draft_email: state.writeDraftEmailOutput.draftEmail
  });
  logger.info({ result }, 'Should rewrite draft email result');

  return result.action === 'rewrite' ? 'write-draft-email-node' : 'un-anonymise-pii-node';
};
