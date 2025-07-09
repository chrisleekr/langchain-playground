import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { logger, removeThinkTag } from '@/libraries';
import { OverallStateAnnotation } from '../constants';
import { getChatLLM } from '../utils';

export const generalResponseNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { originalMessage } = state;
  const { text: message } = originalMessage;

  logger.info({ message }, 'generalResponseNode request');

  const model = getChatLLM(0, logger);

  const prompt = PromptTemplate.fromTemplate(`
    You are a helpful assistant that can generate a general response to the user. Do not return any additional text. Just return the response in markdown format.

    Guidelines:
    - Use appropriate emojis to enhance readability
    - Ignore off-topic messages, casual greetings, and bot notifications
    - Keep total summary under 300 words
    - Return summary in clean markdown format without code fencing

    Relevant information:
    {mcp_tools_response}

    Message history:
    {message_history}

    User message:
    {original_message}
  `);

  logger.info({ prompt, message }, 'generalResponseNode before invoke');

  const chain = RunnableSequence.from([prompt, model, removeThinkTag]);

  const result = await chain.invoke({
    original_message: originalMessage.text,
    message_history: state.messageHistory.join('\n'),
    mcp_tools_response: state.mcpToolsOutput?.response || ''
  });

  logger.info({ content: result.content }, 'generalResponseNode after invoke');

  state.generalResponseOutput = {
    response: result.content.toString()
  };

  state.finalResponse = `${state.finalResponse ? '\n\n' : ''}${result.content.toString()}`;

  logger.info({ state: { ...state, client: undefined } }, 'generalResponseNode final state');

  return state;
};
