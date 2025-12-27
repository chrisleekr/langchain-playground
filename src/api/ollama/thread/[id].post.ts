/**
 * Ollama thread endpoint
 *
 * Replaces deprecated ConversationChain and ConversationSummaryBufferMemory
 * with RunnableSequence and manual chat history management.
 *
 * Note: May be slow due to Ollama local inference.
 *
 * @see https://js.langchain.com/docs/tutorials/chatbot
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import config from 'config';
import { StatusCodes } from 'http-status-codes';
import { RedisChatMessageHistory } from '@langchain/community/stores/message/ioredis';
import { HumanMessage, AIMessage, trimMessages, type BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableSequence, RunnablePassthrough, RunnableLambda } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';

import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { getChatOllama } from '@/libraries';
import { getRedisClient } from '@/libraries/redis';

/**
 * Maximum number of messages to keep in history.
 * This prevents unbounded memory usage in long conversations.
 * @see https://js.langchain.com/docs/tutorials/chatbot#managing-conversation-history
 */
const MAX_HISTORY_MESSAGES = 20;

const redisClient = getRedisClient();

const systemTemplate =
  <string>config.get('ollama.documentSystemTemplate') ??
  `The AI will engage in a friendly conversation with a human, offering specific details from its context. If it lacks knowledge on a topic, it will simply respond with "I don't know." The AI will provide clear and direct answers, avoiding unnecessary information and refraining from asking questions back. It will respond to the last question asked without introducing new topics, providing additional details or asking questions in return.`;

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

    const sessionId = `ollama-thread-${threadId}`;
    logger.info({ sessionId, systemTemplate }, 'Session ID and system template');

    // Initialize chat history with Redis
    const chatHistory = new RedisChatMessageHistory({
      sessionId,
      client: redisClient
    });

    // Get previous messages from history and trim to prevent unbounded growth
    const allMessages = await chatHistory.getMessages();
    const previousMessages: BaseMessage[] = await trimMessages(allMessages, {
      maxTokens: MAX_HISTORY_MESSAGES,
      strategy: 'last',
      startOn: 'human',
      tokenCounter: (msgs: BaseMessage[]) => msgs.length
    });
    logger.info({ totalMessages: allMessages.length, trimmedMessages: previousMessages.length }, 'Previous messages loaded and trimmed');

    // Create prompt template with message history
    const prompt = ChatPromptTemplate.fromMessages([['system', systemTemplate], new MessagesPlaceholder('history'), ['human', '{input}']]);

    const model = getChatOllama(0.9, logger);

    // Build the chain using RunnableSequence
    const chain = RunnableSequence.from([
      RunnablePassthrough.assign({
        history: new RunnableLambda({ func: () => previousMessages })
      }),
      prompt,
      model,
      new StringOutputParser()
    ]);

    // Invoke the chain
    const response = await chain.invoke({ input: message });
    logger.info({ response }, 'Chain response');

    // Save messages to history
    await chatHistory.addMessage(new HumanMessage(message));
    await chatHistory.addMessage(new AIMessage(response));

    await sendResponse(
      reply,
      new ServiceResponse(
        ResponseStatus.Success,
        'OK',
        {
          threadId,
          response
        },
        StatusCodes.OK
      )
    );
  };
}
