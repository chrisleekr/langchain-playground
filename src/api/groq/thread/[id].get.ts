/**
 * Groq thread GET endpoint
 *
 * Replaces deprecated BufferMemory with direct RedisChatMessageHistory usage.
 */
import config from 'config';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { RedisChatMessageHistory } from '@langchain/redis';
import { getRequestLogger, sendResponse } from '@/libraries';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

export default function threadIdGet() {
  return async (
    request: FastifyRequest<{
      Params: { id: string };
    }>,
    reply: FastifyReply
  ): Promise<void> => {
    const logger = getRequestLogger(request.log);
    const { id: threadId } = request.params;

    logger.info({ threadId }, 'Getting thread.');

    const sessionId = `groq-thread-${threadId}`;

    // Using RedisChatMessageHistory
    const chatHistory = new RedisChatMessageHistory({
      sessionId,
      config: {
        url: config.get('redis.url')
      }
    });

    const messages = await chatHistory.getMessages();
    logger.info({ messageCount: messages.length }, 'Messages loaded');

    // Format messages for response
    const historyArray = messages.map(msg => {
      const type = msg._getType();
      return `${type}: ${msg.content}`;
    });

    await sendResponse(
      reply,
      new ServiceResponse(
        ResponseStatus.Success,
        'OK',
        {
          threadId,
          history: historyArray
        },
        StatusCodes.OK
      )
    );
  };
}
