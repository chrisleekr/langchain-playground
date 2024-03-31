import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { RunnableSequence } from '@langchain/core/runnables';
import { PromptTemplate } from '@langchain/core/prompts';

import { formatDocumentsAsString } from 'langchain/util/document';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { handleServiceResponse } from '@/libraries/httpHandlers';
import { getChat, getEmbeddings, getRetriever } from '@/libraries';

const systemTemplate = `Answer the user's question based on the context below.
Your answer should be in the format of Markdown.

If the context doesn't contain any relevant information to the question, don't make something up and just say "I don't know":

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
    const embeddings = getEmbeddings(logger);
    logger.info({ embeddings }, 'Got embeddings.');

    // Get retriever
    const retriever = await getRetriever(embeddings, collectionName, logger);
    logger.info({ retriever }, 'Got retriever.');

    // Get chat
    const chat = getChat(logger);

    // Create RunnableSequence.from
    const query = messages[messages.length - 1].content;

    const chain = RunnableSequence.from([
      {
        question: (input: { question: string; chatHistory?: string }) => input.question,
        chatHistory: (input: { question: string; chatHistory?: string }) => input.chatHistory ?? '',
        context: async (input: { question: string; chatHistory?: string }) => {
          const relevantDocs = await retriever.getRelevantDocuments(input.question);
          logger.info({ relevantDocs }, 'Relevant documents');
          return formatDocumentsAsString(relevantDocs);
        }
      },
      PromptTemplate.fromTemplate(systemTemplate),
      chat
    ]);

    logger.info({ query, messages }, 'Invoking chain...');
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
