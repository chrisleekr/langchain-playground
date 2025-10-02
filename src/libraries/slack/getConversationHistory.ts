import type { ConversationsHistoryResponse, WebClient } from '@slack/web-api';
import { logger } from '@/libraries';
import { formatTimestamp } from './utils';
import { NormalizedMessage } from '../../slack/event/message/constants';

export const getConversationHistory = async (
  client: WebClient,
  channel: string,
  limit: number = 10,
  {
    userMessage,
    includeAppMention = true
  }: {
    userMessage: NormalizedMessage;
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
    if (message.ts === userMessage.ts && !includeAppMention) {
      logger.info('Ignore original message');
      return;
    }

    if (message.bot_id) {
      // Loop message.attachments and append to message.text
      let text = message.text;
      message.attachments?.forEach(attachment => {
        text += `\n${attachment.text}`;
      });

      messages.push(`[${formatTimestamp(message.ts ?? '')}] @${message.bot_profile?.name || 'Unknown'}: ${text}`);
    } else {
      messages.push(`[${message.ts}] @${message.user}: ${message.text}`);
    }
  });

  logger.info({ messages }, 'getConversationHistory found messages');

  return messages;
};
