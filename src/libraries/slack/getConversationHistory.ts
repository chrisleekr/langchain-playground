import type { AppMentionEvent, ConversationsHistoryResponse, WebClient } from '@slack/web-api';
import { logger } from '@/libraries';

export const getConversationHistory = async (
  client: WebClient,
  channel: string,
  limit: number = 10,
  {
    event,
    includeAppMention = true
  }: {
    event: AppMentionEvent;
    includeAppMention?: boolean;
  }
): Promise<string[]> => {
  const result: ConversationsHistoryResponse = await client.conversations.history({
    channel,
    limit,
    include_all_metadata: true
  });

  let messages: string[] = [];

  result.messages?.forEach(message => {
    logger.info({ message }, 'getConversationHistory message');
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

  logger.info({ messages }, 'getConversationHistory found messages');

  return messages;
};
