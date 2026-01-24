/**
 * OpenAI thread GET endpoint
 *
 * Replaces deprecated BufferMemory with direct RedisChatMessageHistory usage.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { StatusCodes } from 'http-status-codes';

import { RedisChatMessageHistory } from '@langchain/community/stores/message/ioredis';
import { getRedisClient, getRequestLogger, sendResponse } from '@/libraries';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

const redisClient = getRedisClient();

export default function threadIdGet() {
  return async (
    request: FastifyRequest<{
      Params: { id: string };
    }>,
    reply: FastifyReply
  ): Promise<void> => {
    const logger = getRequestLogger(request.log);
    const { id: threadId } = request.params;

    const sessionId = `openai-thread-${threadId}`;

    // Using RedisChatMessageHistory
    const chatHistory = new RedisChatMessageHistory({
      sessionId,
      client: redisClient
    });

    const messages = await chatHistory.getMessages();
    logger.info({ messageCount: messages.length }, 'Messages loaded');

    // Format messages for response
    const historyArray = messages.map(msg => {
      const type = msg._getType();
      return `${type}: ${msg.content}`;
    });

    await sendResponse(reply, new ServiceResponse(ResponseStatus.Success, 'OK', { history: historyArray }, StatusCodes.OK));
  };
}
