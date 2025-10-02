import config from 'config';
import type { WebClient } from '@slack/web-api';
import type { MessageElement } from '@slack/web-api/dist/types/response/ConversationsRepliesResponse';
import { logger } from '@/libraries';
import { getConversationRepliesV2 } from './getConversationReplies';
import { formatTimestamp, isImageMimeType, parseArchiveURLs, parseThreadTsFromArchiveURL } from './utils';
import { getUserName } from './getUserName';

export const getThreadRepliesFromText = async (client: WebClient, text: string): Promise<MessageElement[]> => {
  let allReplies: MessageElement[] = [];
  const archiveURLs = parseArchiveURLs(text);
  if (archiveURLs.length > 0) {
    for (const archiveURL of archiveURLs) {
      const result = parseThreadTsFromArchiveURL(archiveURL);
      if (result) {
        const { channelId, threadTs } = result;
        if (channelId && threadTs) {
          logger.info({ channelId, threadTs }, 'getThreadRepliesFromText parseThreadTsFromArchiveURL');

          // Get replies from Slack
          try {
            const replies = await getConversationRepliesV2(client, channelId, threadTs);

            logger.info({ replies }, 'getThreadRepliesFromText getConversationRepliesV2');

            allReplies.push(...replies);
          } catch (err) {
            logger.error({ err }, 'getThreadRepliesFromText getConversationReplies failed');
          }
        } else {
          logger.error({ archiveURL }, 'getThreadRepliesFromText parseThreadTsFromArchiveURL failed');
        }
      }
    }
  }

  return allReplies;
};

export interface FormattedMessageElement {
  timestamp: string;
  userName: string;
  user: string;
  text: string;
  threadTs: string;
  images?: {
    url: string;
    mimeType: string;
    base64?: string;
    description?: string;
  }[];
}

export const downloadFile = async (fileUrl: string): Promise<string> => {
  try {
    const response = await fetch(fileUrl, {
      headers: {
        Authorization: `Bearer ${config.get<string>('slack.botToken')}`
      }
    });

    if (!response.ok) {
      logger.error({ fileUrl, response }, 'downloadFile failed');
      throw new Error(`Failed to download file: ${response.statusText}`);
    }

    logger.info({ fileUrl }, 'downloadFile success');

    const fileBase64 = await response.arrayBuffer();

    return Buffer.from(fileBase64).toString('base64');
  } catch (error) {
    logger.error(
      {
        fileUrl,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : 'Unknown stack'
        }
      },
      'downloadFile failed'
    );
    throw new Error(`Failed to download file: ${error}`);
  }
};

/**
 * Format thread replies
 *
 * @param client
 * @param replies
 * @returns
 */
export const formatThreadReplies = async (client: WebClient, replies: MessageElement[]): Promise<FormattedMessageElement[]> => {
  const formattedReplies: FormattedMessageElement[] = await Promise.all(
    replies.map(async reply => {
      const formattedReply: FormattedMessageElement = {
        timestamp: reply.ts ? formatTimestamp(reply.ts) : '',
        userName: reply.user ? await getUserName(client, reply.user) : '',
        user: reply.user ?? '',
        text: reply.text ?? '',
        threadTs: reply.thread_ts ?? '',
        images: reply.files
          ? (
              await Promise.all(
                reply.files.map(async file => {
                  // download the images

                  if (!file.url_private_download || !file.mimetype) {
                    logger.info({ file }, 'downloadFile file.url_private_download or file.mimetype is null');
                    return null;
                  }

                  if (!isImageMimeType(file.mimetype)) {
                    logger.info({ file }, 'downloadFile file.mimetype is not an image');
                    return null;
                  }
                  const fileBase64 = await downloadFile(file.url_private_download);
                  logger.info('downloadFile fileBase64');
                  return {
                    url: file.url_private_download,
                    mimeType: file.mimetype,
                    base64: fileBase64,
                    description: ''
                  };
                })
              )
            ).filter(file => file !== null)
          : []
      };

      return formattedReply;
    })
  );

  return formattedReplies;
};
