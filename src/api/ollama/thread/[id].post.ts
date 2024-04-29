/**
 * Note: It works. But it's too slow.
 */
import config from 'config';

import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ConversationSummaryBufferMemory } from 'langchain/memory';
import { ConversationChain } from 'langchain/chains';
import { RedisChatMessageHistory } from '@langchain/community/stores/message/ioredis';

import { ChatPromptTemplate, HumanMessagePromptTemplate, MessagesPlaceholder, SystemMessagePromptTemplate } from '@langchain/core/prompts';
import { handleServiceResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { getChatOllama, getLLMOllama } from '@/libraries';
import { getRedisClient } from '@/libraries/redis';

const redisClient = getRedisClient();

const systemTemplate =
  <string>config.get('ollama.documentSystemTemplate') ??
  `The AI will engage in a friendly conversation with a human, offering specific details from its context. If it lacks knowledge on a topic, it will simply respond with "I don't know." The AI will provide clear and direct answers, avoiding unnecessary information and refraining from asking questions back. It will respond to the last question asked without introducing new topics, providing additional details or asking questions in return.`;

export default function threadIdPost() {
  return async (req: Request, res: Response): Promise<Response<unknown, Record<string, unknown>>> => {
    const logger = req.log;
    const { id: threadId } = req.params;
    const { message } = req.body;

    const sessionId = `ollama-thread-${threadId}`;

    logger.info({ sessionId, systemTemplate }, 'Session ID and system template');

    const memory = new ConversationSummaryBufferMemory({
      llm: getLLMOllama(0, logger),
      maxTokenLimit: 10,
      chatHistory: new RedisChatMessageHistory({
        sessionId,
        client: redisClient
      })
    });

    const history = await memory.loadMemoryVariables({});
    logger.info({ history }, 'Memory history');

    const chatPromptMemory = new ConversationSummaryBufferMemory({
      llm: getChatOllama(0, logger),
      chatHistory: new RedisChatMessageHistory({
        sessionId,
        client: redisClient
      }),
      maxTokenLimit: 10,
      returnMessages: true
    });

    const messages = await chatPromptMemory.chatHistory.getMessages();
    const previous_summary = '';
    const predictSummary = await chatPromptMemory.predictNewSummary(messages, previous_summary);
    logger.info({ predictSummary }, 'Predict summary');

    const chatPrompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(systemTemplate),
      new MessagesPlaceholder('history'),
      HumanMessagePromptTemplate.fromTemplate('{input}')
    ]);

    const model = getChatOllama(0.9, logger);
    const chain = new ConversationChain({
      llm: model,
      memory: chatPromptMemory,
      prompt: chatPrompt
    });

    const callResponse = await chain.invoke({ input: message });
    console.log({ callResponse }, 'callResponse');

    const response = {
      threadId,
      response: callResponse.response
    };

    const serviceResponse = new ServiceResponse(ResponseStatus.Success, 'OK', response, StatusCodes.OK);
    return handleServiceResponse(serviceResponse, res);
  };
}
