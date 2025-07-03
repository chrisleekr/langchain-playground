import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';

import { formatDocumentsAsString } from 'langchain/util/document';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';

import { getChatOllama, getOllamaEmbeddings, getQdrantVectorStore } from '@/libraries';
import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

const systemTemplate = `Answer the user's question based on the context below. And improve your answers from previous answer in History.

  Don't try to make up an answer. If the context doesn't contain any relevant information to the question, don't make something up and just say "I don't know".
  Even if the context does not make sense, try to answer the question based on the context.

  Answer in a way that is easy to understand. Just answer the question directly in detail:

<context>
{context}
</context>

<chat_history>
{chatHistory}
</chat_history>

<question>
{question}
</question>

Answer:
`;

const serializeMessages = (messages: Array<{ role: string; content: string }>): string =>
  messages.map(message => `${message.role}: ${message.content}`).join('\n');

export default function documentChatPost(collectionName: string) {
  return async (
    request: FastifyRequest<{
      Body: {
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      };
    }>,
    reply: FastifyReply
  ): Promise<void> => {
    const logger = request.log as Logger;
    const { messages } = request.body;

    logger.info({ messages }, 'Received messages');

    // Initialise embeddings
    const embeddings = getOllamaEmbeddings(logger);
    logger.info({ embeddings }, 'Initialised embeddings');

    // Setup vector store
    logger.info('Initializing vector store...');
    const vectorStore = await getQdrantVectorStore(embeddings, collectionName, logger);

    logger.info('Ensuring collection exists...');
    const collection = await vectorStore.ensureCollection();
    logger.info({ collection }, 'Collection ensured');

    // Initialise retriever
    const retriever = vectorStore.asRetriever();
    logger.info({ retriever }, 'Initialised retriever');

    // Initialise chat model
    const chat = getChatOllama(0.5, logger);

    // Setup chain
    const chain = RunnableSequence.from([
      {
        question: (input: { question: string; chatHistory?: string }) => input.question,
        chatHistory: (input: { question: string; chatHistory?: string }) => input.chatHistory ?? '',
        context: async (input: { question: string; chatHistory?: string }) => {
          const relevantDocs = await retriever.invoke(input.question);
          logger.info({ relevantDocs, input }, 'Retrieved relevant documents');
          return formatDocumentsAsString(relevantDocs);
        }
      },
      PromptTemplate.fromTemplate(systemTemplate),
      chat
    ]);

    // Process query
    const query = messages[messages.length - 1].content;
    logger.info({ query, messages }, 'Processing query');

    const invokeResult = await chain.invoke({
      question: query,
      chatHistory: serializeMessages(messages)
    });
    logger.info({ invokeResult }, 'Query processed');

    await sendResponse(
      reply,
      new ServiceResponse(
        ResponseStatus.Success,
        'OK',
        {
          message: {
            role: 'assistant',
            content: invokeResult?.content
          }
        },
        StatusCodes.OK
      )
    );
  };
}
