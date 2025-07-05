import type { AppMentionEvent, ConversationsRepliesResponse, WebClient } from '@slack/web-api';
import { logger } from '@/libraries';

export const getConversationReplies = async (
  client: WebClient,
  channel: string,
  ts: string,
  limit: number = 10,
  {
    event,
    includeAppMention = true
  }: {
    event: AppMentionEvent;
    includeAppMention?: boolean;
  }
): Promise<string[]> => {
  logger.info({ channel, ts, limit }, 'getConversationReplies request');
  const result: ConversationsRepliesResponse = await client.conversations.replies({
    channel,
    include_all_metadata: true,
    ts,
    limit
  });

  let messages: string[] = [];

  result.messages?.forEach(message => {
    logger.info({ message }, 'getConversationReplies message');
    // Ignore app mention message
    if (message.ts === event.ts && !includeAppMention) {
      logger.info('Ignore original message');
      return;
    }

    if (message.bot_id) {
      // Loop message.attachments and append to message.text
      let text = message.text;
      message.attachments?.forEach(attachment => {
        text += `\n${attachment.text}`;
      });

      messages.push(`[${message.ts}] <@${message.bot_id}>: ${text}`);
    } else {
      messages.push(`[${message.ts}] <@${message.user}>: ${message.text}`);
    }
  });

  logger.info({ messages }, 'getConversationReplies found messages');

  return messages;
};
