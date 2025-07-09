import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { logger, removeThinkTag } from '@/libraries';
import { OverallStateAnnotation } from '../constants';
import { getChatLLM } from '../utils';

export const translateMessageNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { messageHistory, finalResponse, originalMessage } = state;
  const { text: message } = originalMessage;

  logger.info({ messageHistory, finalResponse, message }, 'translateMessageNode request');

  const model = getChatLLM(0, logger);

  const prompt = PromptTemplate.fromTemplate(`
    You are a helpful assistant that can translate the message to another language.

    Do not return any additional text. Just return the translated message in markdown format.
    - The timestamp of the message is not important.

    User's instruction:
    {original_message}

    Message to translate:
    {final_response}
  `);

  logger.info({ prompt, message: originalMessage.text }, 'translateMessageNode before invoke');

  const chain = RunnableSequence.from([prompt, model, removeThinkTag]);

  const result = await chain.invoke({
    original_message: originalMessage.text,
    final_response: finalResponse !== '' ? finalResponse : messageHistory.join('\n')
  });

  logger.info({ content: result.content }, 'translateMessageNode after invoke');

  state.translateMessageOutput = {
    translatedMessage: result.content.toString()
  };

  state.finalResponse = result.content.toString();

  logger.info({ state: { ...state, client: undefined } }, 'translateMessageNode final state');

  return state;
};
