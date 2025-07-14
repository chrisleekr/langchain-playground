import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import slackifyMarkdown from 'slackify-markdown';
import { logger, removeThinkTag } from '@/libraries';
import { OverallStateAnnotation } from '../constants';
import { getChatLLM } from '../utils';

export const finalResponseNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { userMessage, client, finalResponse } = state;
  const { text: message, channel, thread_ts: threadTs, ts: messageTs } = userMessage;

  logger.info({ message, finalResponse }, 'finalResponseNode request');

  // If the final response is empty, then reply with a message that the user has been mentioned saying "Sorry, I don't know what to do with that."

  if (finalResponse !== '') {
    if (finalResponse.length > 4000) {
      const model = getChatLLM(0, logger);

      const prompt = PromptTemplate.fromTemplate(`
        You are a helpful assistant that summarize the final response from the bot. The response should not exceed 4000 characters. Do not return any additional text. Just return the summary in markdown format.

        Bot message:
        {final_response}
      `);

      logger.info({ prompt, message: finalResponse }, 'finalResponseNode before invoke');

      const chain = RunnableSequence.from([prompt, model, removeThinkTag]);

      const result = await chain.invoke({
        final_response: finalResponse
      });

      logger.info({ result }, 'finalResponseNode after invoke');

      await client.chat.postMessage({
        channel,
        thread_ts: threadTs || messageTs,
        text: slackifyMarkdown(result.content.toString()),
        mrkdwn: true
      });
    } else {
      await client.chat.postMessage({
        channel,
        thread_ts: threadTs || messageTs,
        text: slackifyMarkdown(finalResponse),
        mrkdwn: true
      });
    }
  } else {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs || messageTs,
      text: "Sorry, I don't know what to do with that."
    });
  }

  try {
    // Remove the reaction eyes
    await client.reactions.remove({
      channel,
      name: 'eyes',
      timestamp: userMessage.ts
    });

    // Add the reaction check mark
    await client.reactions.add({
      channel,
      name: 'white_check_mark',
      timestamp: userMessage.ts
    });
  } catch (error) {
    logger.warn({ error }, 'finalResponseNode error for removing reaction eyes');
  }

  return state;
};
