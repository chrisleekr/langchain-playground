import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { BufferMemory } from 'langchain/memory';
import { RedisChatMessageHistory } from '@langchain/community/stores/message/ioredis';
import { handleServiceResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

import { getRedisClient } from '@/libraries/redis';

const redisClient = getRedisClient();

export default function threadIdGet() {
  return async (req: Request, res: Response): Promise<Response<unknown, Record<string, unknown>>> => {
    const logger = req.log;
    const { id: threadId } = req.params;

    const sessionId = `groq-langgraph-thread-${threadId}`;

    const memory = new BufferMemory({
      chatHistory: new RedisChatMessageHistory({
        sessionId,
        client: redisClient
      })
    });

    const history = await memory.loadMemoryVariables({});
    logger.info({ history }, 'Memory history');

    const historyArray = history.history !== '' ? history.history.split('\n') : [];

    const serviceResponse = new ServiceResponse(ResponseStatus.Success, 'OK', { history: historyArray }, StatusCodes.OK);
    return handleServiceResponse(serviceResponse, res);
  };
}
