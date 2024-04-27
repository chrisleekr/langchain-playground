/**
 * Note: It works. But it's too slow.
 */
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ConversationChain } from 'langchain/chains';
import { RedisChatMessageHistory } from '@langchain/community/stores/message/ioredis';
import { BufferMemory } from 'langchain/memory';
import { PromptTemplate } from '@langchain/core/prompts';

import { handleServiceResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { getChatOllama } from '@/libraries';
import { getRedisClient } from '@/libraries/redis';

const redisClient = getRedisClient();

const systemTemplate =
  process.env.OLLAMA_THREAD_SYSTEM_TEMPLATE ??
  `The AI will engage in a friendly conversation with a human, offering specific details from its context. If it lacks knowledge on a topic, it will simply respond with "I don't know." The AI will provide clear and direct answers, avoiding unnecessary information and refraining from asking questions back. It will respond to the last question asked without introducing new topics, providing additional details or asking questions in return.

Current conversation:
{history}

Human: {input}

AI:`;

export default function threadIdPost() {
  return async (req: Request, res: Response): Promise<Response<unknown, Record<string, unknown>>> => {
    const logger = req.log;
    const { id: threadId } = req.params;
    const { message } = req.body;

    const memory = new BufferMemory({
      chatHistory: new RedisChatMessageHistory({
        sessionId: threadId,
        client: redisClient
      })
    });

    logger.info({ memory }, 'Created new memory.');

    // Get chat
    const chat = getChatOllama(0.5, logger);

    const promptTemplate = PromptTemplate.fromTemplate(systemTemplate);

    const chain = new ConversationChain({ llm: chat, memory, prompt: promptTemplate });

    logger.info({ chain }, 'Created new chain.');

    const callResponse = await chain.call({ input: message });

    const response = {
      threadId,
      response: callResponse.response
    };

    const serviceResponse = new ServiceResponse(ResponseStatus.Success, 'OK', response, StatusCodes.OK);
    return handleServiceResponse(serviceResponse, res);
  };
}
