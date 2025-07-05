import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { getChatOllama, logger } from '@/libraries';
import { OverallStateAnnotation } from '../constants';

export const generalResponseNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { event } = state;
  const { text: message } = event;

  logger.info({ message }, 'generalResponseNode request');

  const model = getChatOllama(0, logger);

  const prompt = PromptTemplate.fromTemplate(`
    You are a helpful assistant that can generate a general response to the user.

    Do not return any additional text. Just return the response in markdown format.

    User message:
    {message}
  `);

  logger.info({ prompt, message }, 'generalResponseNode before invoke');

  const chain = RunnableSequence.from([prompt, model]);

  const result = await chain.invoke({
    message
  });

  logger.info({ content: result.content }, 'generalResponseNode after invoke');

  state.generalResponseOutput = {
    response: result.content.toString()
  };

  state.finalResponse = `${state.finalResponse ? '\n\n' : ''}${result.content.toString()}`;

  logger.info({ state: { ...state, client: undefined } }, 'generalResponseNode final state');

  return state;
};
