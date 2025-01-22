import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';
import { BufferMemory } from 'langchain/memory';
import { RedisChatMessageHistory } from '@langchain/redis';
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

    logger.info({ threadId }, 'Getting thread.');

    const sessionId = `groq-thread-${threadId}`;

    const memory = new BufferMemory({
      chatHistory: new RedisChatMessageHistory({
        sessionId,
        client: redisClient
      })
    });

    const history = await memory.loadMemoryVariables({});
    logger.info({ history }, 'Memory history');

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
