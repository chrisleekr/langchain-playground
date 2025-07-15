import type { AppMentionEvent } from '@slack/types';
import { logger } from '@/libraries';
import { EventAppMention, NormalizedMessage } from './constants';
import { executeStateGraph } from './stateGraph';

/**
 * LangGraph vs Simple Intent Classifier. Why analysis.
 *  1. LangGraph or Intent Classifier in this project both aim to route the user input to the correct node like summarizing the thread or finding the relevant information from RAG.
 *  2. Intent Classifier will be simpler and faster to implement. However, it's harder to extend to have multi-step logics such as `Summarise and then translate`. It will classify user input into a predefined SINGLE category. In addition it won't remember previous states to follow up. However, it's easier to implement and easy to debug.
 *  3. LangGraph will be moderate difficult to define the logic, but it will be easy to extend new node or edges. It's supporting stateful flow, and complex tool chaining like cyclical workflow. However, it's harder to debug without LangSmith.
 *
 *  For this project,
 *  1. do I need to have multi-step logics? No.
 *  2. do I need to have stateful flow? No.
 *  3. do I need to have complex tool chaining? No.
 *  4. do I need to have easy to debug? Yes.
 *  5. do I need to have easy to implement? Yes.
 *  6. do I need to have easy to extend? Yes.
 *  7. do I need to have easy to maintain? Yes.
 *
 *  Conclusion:
 *  However, eventually there will be more tools and may extend to more support for more tools, then LangGraph will be beneficial. So use LangGraph to route the user input to the correct node using simple intent classifier.
 *
 * `app_mention` sample event:
 *  {
 *    "user": "U9HD4Q39B",
 *    "type": "app_mention",
 *    "ts": "1751639849.280369",
 *    "client_msg_id": "2d166f2b-c8ae-47f9-aca3-8f110caa7198",
 *    "text": "<@U0942CQA55J> summarise it",
 *    "team": "T9H6PEM0T",
 *    "thread_ts": "1751201323.618479",
 *    "parent_user_id": "U9HD4Q39B",
 *    "blocks": [
 *      {
 *        "type": "rich_text",
 *        "block_id": "aEdTi",
 *        "elements": [
 *          {
 *            "type": "rich_text_section",
 *            "elements": [
 *              {
 *                "type": "user",
 *                "user_id": "U0942CQA55J"
 *              },
 *              {
 *                "type": "text",
 *                "text": " summarise it"
 *              }
 *            ]
 *          }
 *        ]
 *      }
 *    ],
 *    "channel": "C07EWAS8132",
 *    "event_ts": "1751639849.280369"
 *  }
 *
 */

const normalizeMessage = (event: AppMentionEvent): NormalizedMessage => {
  const { type, subtype, channel, ts, attachments, blocks, files, text, thread_ts, bot_id, bot_profile } = event;

  const normalizedMessage: NormalizedMessage = {
    type,
    subtype,
    channel,
    channel_type: 'channel',
    ts,
    bot_id,
    bot_profile,
    text,
    thread_ts,
    attachments,
    blocks,
    files: files as {
      id: string;
      created: number;
      name: string | null;
      title: string | null;
      mimetype: string;
      filetype: string;
    }[]
  };

  if (attachments) {
    normalizedMessage.text += attachments.map(attachment => attachment.text).join('\n');
  }

  return normalizedMessage;
};

const eventAppMention = async ({ event, client }: EventAppMention): Promise<void> => {
  try {
    logger.info({ event }, 'event app_mention');

    const normalizedMessage = normalizeMessage(event);
    const result = await executeStateGraph(normalizedMessage, client);

    logger.info(
      {
        result: {
          ...result,
          client: undefined
        }
      },
      'After invoke event app_mention'
    );
  } catch (err) {
    logger.error({ err }, 'Error in event app_mention');

    await client.chat.postEphemeral({
      channel: event.channel,
      thread_ts: event.ts,
      user: event.user || '',
      text: `Sorry, something went wrong while trying to respond to your mention. Please try again later.`
    });
  }
};

export { eventAppMention };
