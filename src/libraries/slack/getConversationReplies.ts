import type { ConversationsRepliesResponse, WebClient } from '@slack/web-api';
import type { MessageElement } from '@slack/web-api/dist/types/response/ConversationsRepliesResponse';
import { logger } from '@/libraries';
import { NormalizedMessage } from '@/slack/event/message/constants';
import { formatTimestamp } from './utils';

export const getConversationReplies = async (
  client: WebClient,
  channel: string,
  ts: string,
  limit: number = 10,
  {
    userMessage,
    includeAppMention = true
  }: {
    userMessage: NormalizedMessage | null;
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
    if (userMessage && message.ts === userMessage.ts && !includeAppMention) {
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

  logger.info({ messages }, 'getConversationReplies found messages');

  return messages;
};

export const getConversationRepliesV2 = async (client: WebClient, channel: string, ts: string): Promise<MessageElement[]> => {
  const result: ConversationsRepliesResponse = await client.conversations.replies({
    channel,
    include_all_metadata: true,
    ts,
    limit: 1000 // Maximum limit is 1000
  });

  return result.messages || [];
};
