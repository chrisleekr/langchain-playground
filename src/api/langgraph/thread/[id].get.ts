import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';

import { BufferMemory } from 'langchain/memory';
import { RedisChatMessageHistory } from '@langchain/community/stores/message/ioredis';

import { getRedisClient } from '@/libraries/redis';
import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

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

    logger.info({ threadId }, 'Processing thread request');

    // Initialise memory
    const sessionId = `groq-langgraph-thread-${threadId}`;
    const memory = new BufferMemory({
      chatHistory: new RedisChatMessageHistory({
        sessionId,
        client: redisClient
      })
    });
    logger.info({ memory }, 'Memory Initialised');

    // Load history
    const history = await memory.loadMemoryVariables({});
    logger.info({ history }, 'History loaded');

    const historyArray = history.history !== '' ? history.history.split('\n') : [];

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
