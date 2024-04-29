import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';

import { formatDocumentsAsString } from 'langchain/util/document';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { handleServiceResponse } from '@/libraries/httpHandlers';
import { getChatOllama, getOllamaEmbeddings, getParentDocumentRetriever, getChromaVectorStore } from '@/libraries';

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
  return async (req: Request, res: Response): Promise<Response<unknown, Record<string, unknown>>> => {
    const logger = req.log;

    const { messages } = req.body;
    logger.info({ messages }, 'Received messages.');

    // Get embeddings
    const embeddings = getOllamaEmbeddings(logger);
    logger.info({ embeddings }, 'Got embeddings.');

    logger.info('Getting Vector Store...');
    const vectorStore = await getChromaVectorStore(embeddings, collectionName, logger);

    logger.info('Ensuring collection exists...');
    const collection = await vectorStore.ensureCollection();
    logger.info({ collection }, 'Ensured collection exists');

    // Get retriever
    const retriever = await getParentDocumentRetriever(vectorStore, collectionName, logger);
    logger.info({ retriever }, 'Got retriever.');

    // Get chat
    const chat = getChatOllama(0, logger);

    const chain = RunnableSequence.from([
      {
        question: (input: { question: string; chatHistory?: string }) => input.question,
        chatHistory: (input: { question: string; chatHistory?: string }) => input.chatHistory ?? '',
        context: async (input: { question: string; chatHistory?: string }) => {
          const relevantDocs = await retriever.invoke(input.question);
          logger.info({ relevantDocs, input }, 'Relevant documents');
          return formatDocumentsAsString(relevantDocs);
        }
      },
      PromptTemplate.fromTemplate(systemTemplate),
      chat
    ]);

    const query = messages[messages.length - 1].content;
    logger.info({ query, messages, chain, systemTemplate }, 'Invoking chain...');
    const invokeResult = await chain.invoke({
      question: query,
      chatHistory: serializeMessages(messages)
    });

    logger.info({ invokeResult }, 'Completed invoking chain.');

    const response = {
      message: {
        role: 'assistant',
        content: invokeResult?.content
      }
    };

    const serviceResponse = new ServiceResponse(ResponseStatus.Success, 'OK', response, StatusCodes.OK);
    return handleServiceResponse(serviceResponse, res);
  };
}
