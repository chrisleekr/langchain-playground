import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import slackifyMarkdown from 'slackify-markdown';
import { getChatOllama, logger } from '@/libraries';
import { OverallStateAnnotation } from '../constants';

export const finalResponseNode = async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
  const { event, client, finalResponse } = state;
  const { text: message, channel, thread_ts: threadTs, ts: messageTs } = event;

  logger.info({ message, finalResponse }, 'finalResponseNode request');

  // If the final response is empty, then reply with a message that the user has been mentioned saying "Sorry, I don't know what to do with that."

  if (finalResponse !== '') {
    if (finalResponse.length > 4000) {
      const model = getChatOllama(0, logger);

      const prompt = PromptTemplate.fromTemplate(`
        You are a helpful assistant that summarise the final response from the bot. The response should not exceed 4000 characters. Please respond with ONLY a JSON object that follows the format specified below.

        Do not return any additional text. Just return the summary in markdown format.

        Bot message:
        {message}
      `);

      logger.info({ prompt, message: finalResponse }, 'finalResponseNode before invoke');

      const chain = RunnableSequence.from([prompt, model]);

      const result = await chain.invoke({
        message: finalResponse
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

  // Remove the reaction eyes
  await client.reactions.remove({
    channel,
    name: 'eyes',
    timestamp: event.ts
  });

  // Add the reaction check mark
  await client.reactions.add({
    channel,
    name: 'white_check_mark',
    timestamp: event.ts
  });

  return state;
};
