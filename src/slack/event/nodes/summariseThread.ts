import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { getChatOllama } from '@/libraries/langchain/llm';
import { logger } from '@/libraries';
import { OverallStateAnnotation } from '../constants';

export const summariseThreadNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { messageHistory } = state;

  const model = getChatOllama(0, logger);

  const prompt = PromptTemplate.fromTemplate(`
    You are a helpful assistant that summarizes Slack thread conversations.

    Your summary can include:
    - TL;DR: A very short summary at the beginning
    - Key points: Key topics and debates discussed with author if applicable
    - Data & Insights: Important information shared with author if applicable
    - Key Timeline: Important thread messages with format of '[<readable HH:MM AM/PM>] <@user>: <summarized message>' if applicable
    - Action items: Tasks or decisions that were made if applicable
    - Use appropriate emojis to make it engaging
    - Do not include sections if nothing to mention
    - Ignore messages that is not related to the summary

    Do not return any additional text. Just return the summary in markdown format.

    Thread messages:
    {messages}
  `);

  logger.info({ prompt }, 'summariseThreadNode before invoke');

  const chain = RunnableSequence.from([prompt, model]);

  const result = await chain.invoke({
    messages: messageHistory.join('\n')
  });

  logger.info({ content: result.content }, 'summariseThreadNode after invoke');

  state.summariseThreadOutput = {
    summary: result.content.toString()
  };

  state.finalResponse += `${state.finalResponse ? '\n\n' : ''}${result.content.toString()}`;

  logger.info({ state: { ...state, client: undefined } }, 'summariseThreadNode final state');

  return state;
};
