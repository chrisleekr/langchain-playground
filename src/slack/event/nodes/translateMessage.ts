import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { getChatOllama, logger } from '@/libraries';
import { OverallStateAnnotation } from '../constants';

export const translateMessageNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { messageHistory, finalResponse, event } = state;
  const { text: message } = event;

  logger.info({ messageHistory, finalResponse, message }, 'translateMessageNode request');

  const model = getChatOllama(0, logger);

  const prompt = PromptTemplate.fromTemplate(`
    You are a helpful assistant that can translate the message to another language.

    Do not return any additional text. Just return the translated message in markdown format.
    - The timestamp of the message is not important.

    User's instruction:
    {message}

    Message to translate:
    {finalResponse}
  `);

  logger.info({ prompt, message }, 'translateMessageNode before invoke');

  const chain = RunnableSequence.from([prompt, model]);

  const result = await chain.invoke({
    message,
    finalResponse: finalResponse !== '' ? finalResponse : messageHistory.join('\n')
  });

  logger.info({ content: result.content }, 'translateMessageNode after invoke');

  state.translateMessageOutput = {
    translatedMessage: result.content.toString()
  };

  state.finalResponse = result.content.toString();

  logger.info({ state: { ...state, client: undefined } }, 'translateMessageNode final state');

  return state;
};
