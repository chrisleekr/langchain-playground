/**
 * Note: It works. But it's too slow.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';

import { BufferMemory } from 'langchain/memory';
import { ConversationChain } from 'langchain/chains';
import { PromptTemplate } from '@langchain/core/prompts';
import { RedisChatMessageHistory } from '@langchain/community/stores/message/ioredis';

import { getChatOllama } from '@/libraries';
import { getRedisClient } from '@/libraries/redis';
import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

const redisClient = getRedisClient();

const systemTemplate =
  process.env.OLLAMA_THREAD_SYSTEM_TEMPLATE ??
  `The AI will engage in a friendly conversation with a human, offering specific details from its context. If it lacks knowledge on a topic, it will simply respond with "I don't know." The AI will provide clear and direct answers, avoiding unnecessary information and refraining from asking questions back. It will respond to the last question asked without introducing new topics, providing additional details or asking questions in return.

Current conversation:
{history}

H: {input}

AI:`;

export default function threadIdPost() {
  return async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { message: string };
    }>,
    reply: FastifyReply
  ): Promise<void> => {
    const logger = request.log as Logger;
    const { id: threadId } = request.params;
    const { message } = request.body;

    logger.info({ threadId, message }, 'Processing message');

    // Initialise memory
    const memory = new BufferMemory({
      chatHistory: new RedisChatMessageHistory({
        sessionId: threadId,
        client: redisClient
      })
    });
    logger.info({ memory }, 'Memory Initialised');

    // Initialise chat model
    const chat = getChatOllama(0.5, logger);

    // Setup chain
    const promptTemplate = PromptTemplate.fromTemplate(systemTemplate);
    const chain = new ConversationChain({ llm: chat, memory, prompt: promptTemplate });
    logger.info({ chain }, 'Chain Initialised');

    // Process message
    const callResponse = await chain.call({ input: message });
    logger.info({ callResponse }, 'Message processed');

    await sendResponse(
      reply,
      new ServiceResponse(
        ResponseStatus.Success,
        'OK',
        {
          threadId,
          response: callResponse.response
        },
        StatusCodes.OK
      )
    );
  };
}
