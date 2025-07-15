import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { logger, removeThinkTag } from '@/libraries';
import { OverallStateAnnotation } from '../constants';
import { getChatLLM } from '../utils';

export const summarizeNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { messageHistory, userMessage } = state;

  const model = getChatLLM(0, logger);

  const prompt = PromptTemplate.fromTemplate(`
    You are a helpful assistant that summarizes Slack thread conversations. Do not return any additional text. Just return the summary in markdown format.

    Your summary can include:
    - TL;DR: A very short summary at the beginning
    - Key points: Key topics and debates discussed with author if applicable
    - Data & Insights: Important information, metrics, or findings shared with sources
    - Key Timeline: Critical thread messages using format '[HH:MM AM/PM] summarized message' (limit to 5 most important messages).
    - Action items: Tasks or decisions that were made if applicable
    - Use appropriate emojis to make it engaging
    - Do not include sections if nothing to mention
    - Ignore messages that is not related to the summary

    Guidelines:
    - Use appropriate emojis to enhance readability
    - Omit sections that have no relevant content
    - Ignore off-topic messages, casual greetings, and bot notifications
    - Keep total summary under 300 words
    - If thread contains no substantive content, respond with: "No actionable content found in this thread."
    - Return summary in clean markdown format without code fencing

    Relevant information:
    {mcp_tools_response}

    Message history:
    {message_history}

    User message:
    {user_message}

    Final response:
    {final_response}
  `);

  logger.info({ prompt }, 'summarizeNode before invoke');

  const chain = RunnableSequence.from([prompt, model, removeThinkTag]);

  const result = await chain.invoke({
    user_message: userMessage.text,
    message_history: messageHistory.join('\n'),
    mcp_tools_response: state.mcpToolsOutput?.mcpToolsResponse || '',
    final_response: state.finalResponse || ''
  });

  logger.info({ content: result.content }, 'summarizeNode after invoke');

  state.summarizeThreadOutput = {
    summary: result.content.toString()
  };

  state.finalResponse += `${state.finalResponse ? '\n\n' : ''}${result.content.toString()}`;

  logger.info({ state: { ...state, client: undefined } }, 'summarizeNode final state');

  return state;
};
