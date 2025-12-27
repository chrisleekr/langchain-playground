/**
 * Groq thread endpoint
 *
 * Replaces deprecated ConversationChain and ConversationSummaryBufferMemory
 * with RunnableSequence and manual chat history management.
 *
 * @see https://js.langchain.com/docs/tutorials/chatbot
 */
import config from 'config';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';
import { RedisChatMessageHistory } from '@langchain/community/stores/message/ioredis';
import { HumanMessage, AIMessage, trimMessages, type BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableSequence, RunnablePassthrough, RunnableLambda } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';

import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { getChatGroq } from '@/libraries';
import { getRedisClient } from '@/libraries/redis';

/**
 * Maximum tokens to keep in conversation history.
 * This prevents context window overflow in long conversations.
 * Uses the LLM model for accurate token counting.
 * @see https://docs.langchain.com/oss/javascript/langgraph/add-memory#trim-messages
 */
const MAX_HISTORY_TOKENS = 4000;

const redisClient = getRedisClient();

const systemTemplate =
  <string>config.get('groq.documentSystemTemplate') ??
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

    logger.info({ threadId, message }, 'Posting to thread.');

    const sessionId = `groq-thread-${threadId}`;

    // Initialize chat history with Redis
    const chatHistory = new RedisChatMessageHistory({
      sessionId,
      client: redisClient
    });

    // Initialize model (needed for token counting)
    const model = getChatGroq(config.get<number>('groq.temperature'), logger);

    // Get previous messages from history and trim to prevent context window overflow
    // Refer: https://docs.langchain.com/oss/javascript/langgraph/add-memory#trim-messages
    const allMessages = await chatHistory.getMessages();
    const previousMessages: BaseMessage[] = await trimMessages(allMessages, {
      maxTokens: MAX_HISTORY_TOKENS,
      strategy: 'last',
      tokenCounter: model,
      includeSystem: true,
      startOn: 'human'
    });
    logger.info({ totalMessages: allMessages.length, trimmedMessages: previousMessages.length }, 'Previous messages loaded and trimmed');

    // Create prompt template with message history
    const prompt = ChatPromptTemplate.fromMessages([['system', systemTemplate], new MessagesPlaceholder('history'), ['human', '{input}']]);

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
