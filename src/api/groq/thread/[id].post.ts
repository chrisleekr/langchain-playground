/**
 * Groq thread conversation endpoint
 *
 * Replaces deprecated ConversationChain and ConversationSummaryBufferMemory
 * with RunnableSequence and manual chat history management.
 *
 * @architecture This handler is intentionally separate from other provider handlers
 * (OpenAI, Ollama) to maintain separation of concerns. While the structure is similar,
 * keeping them separate allows:
 * - Independent configuration (system templates, temperatures, models)
 * - Provider-specific feature additions without affecting others
 * - Clear isolation for testing and debugging
 *
 * Groq-specific considerations:
 * - Uses Groq's fast inference API for lower latency responses
 * - Different model options than OpenAI (e.g., Llama, Mixtral)
 *
 * @see https://js.langchain.com/docs/tutorials/chatbot
 */
import config from 'config';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { RedisChatMessageHistory } from '@langchain/community/stores/message/ioredis';
import { HumanMessage, AIMessage, trimMessages, type BaseMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableSequence, RunnablePassthrough, RunnableLambda } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';

import { getChatGroq, getRedisClient, getRequestLogger, sendResponse } from '@/libraries';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

/**
 * Maximum tokens to keep in conversation history.
 * This prevents context window overflow in long conversations.
 * Uses the LLM model for accurate token counting.
 * Configured via `thread.maxHistoryTokens` in config.
 * @see https://docs.langchain.com/oss/javascript/langgraph/add-memory#trim-messages
 */

const redisClient = getRedisClient();

const systemTemplate = config.get<string>('groq.documentSystemTemplate');

export default function threadIdPost() {
  return async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { message: string };
    }>,
    reply: FastifyReply
  ): Promise<void> => {
    const logger = getRequestLogger(request.log);
    const { id: threadId } = request.params;
    const { message } = request.body;

    try {
      logger.info({ threadId, message }, 'Posting to thread.');

      const sessionId = `groq-thread-${threadId}`;

      // Initialize chat history with Redis
      const chatHistory = new RedisChatMessageHistory({
        sessionId,
        client: redisClient
      });

      // Initialize model (needed for token counting)
      const model = getChatGroq(logger);

      // Get previous messages from history and trim to prevent context window overflow
      // Refer: https://docs.langchain.com/oss/javascript/langgraph/add-memory#trim-messages
      const allMessages = await chatHistory.getMessages();
      const previousMessages: BaseMessage[] = await trimMessages(allMessages, {
        maxTokens: config.get<number>('thread.maxHistoryTokens'),
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
    } catch (error) {
      logger.error(
        {
          error: {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          },
          threadId
        },
        'Error processing thread message'
      );
      await sendResponse(reply, new ServiceResponse(ResponseStatus.Failed, 'Internal server error', null, StatusCodes.INTERNAL_SERVER_ERROR));
    }
  };
}
