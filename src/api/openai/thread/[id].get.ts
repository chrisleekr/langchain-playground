/**
 * OpenAI thread GET endpoint
 *
 * Replaces deprecated BufferMemory with direct RedisChatMessageHistory usage.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';

import { RedisChatMessageHistory } from '@langchain/community/stores/message/ioredis';
import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { getRedisClient } from '@/libraries/redis';

const redisClient = getRedisClient();

export default function threadIdGet() {
  return async (
    request: FastifyRequest<{
      Params: { id: string };
    }>,
    reply: FastifyReply
  ): Promise<void> => {
    const logger = request.log as Logger;
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
