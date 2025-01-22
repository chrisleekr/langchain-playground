/**
 * Note: Couldn't make it working. The memory is not being saved between requests.
 */
import config from 'config';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';
import { LLMChain } from 'langchain/chains';

import { VectorStoreRetrieverMemory } from 'langchain/memory';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { PromptTemplate } from '@langchain/core/prompts';

import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { getOllamaEmbeddings, getLLMOllama } from '@/libraries';

const systemTemplate =
  <string>config.get('ollama.documentSystemTemplate') ??
  `The AI will engage in a friendly conversation with a human, offering specific details from its context. If it lacks knowledge on a topic, it will simply respond with "I don't know." The AI will provide clear and direct answers, avoiding unnecessary information and refraining from asking questions back. It will respond to the last question asked without introducing new topics, providing additional details or asking questions in return.

Relevant pieces of previous conversation:
{history}

(You do not need to use these pieces of information if not relevant)

Current conversation:
Human: {input}

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

    logger.info({ threadId, message }, 'Posting to thread.');

    const vectorStore = new MemoryVectorStore(getOllamaEmbeddings(logger));
    const memory = new VectorStoreRetrieverMemory({
      // 1 is how many documents to return, you might want to return more, eg. 4
      vectorStoreRetriever: vectorStore.asRetriever(5, doc => {
        logger.info({ doc }, 'Vector doc');
        return doc.metadata?.threadId === threadId;
      }),
      // vectorStoreRetriever: vectorStore.asRetriever(1),
      memoryKey: `history`,
      metadata: { threadId }
    });

    // logger.info({ memory }, 'Created new memory.');

    // Get chat
    const chat = getLLMOllama(0.5, logger);

    const promptTemplate = PromptTemplate.fromTemplate(systemTemplate);

    const chain = new LLMChain({ llm: chat, memory, prompt: promptTemplate });

    logger.info({ chain }, 'Created new chain.');

    logger.info(
      {
        message,
        loadMemoryVariables: await memory.loadMemoryVariables({
          prompt: message
        })
      },
      'Load memory variables'
    );

    const callResponse = await chain.call({ input: message });

    await memory.saveContext({ input: message }, { output: callResponse.text });
    logger.info({ input: message, output: callResponse.text }, 'Saved context');

    await sendResponse(
      reply,
      new ServiceResponse(
        ResponseStatus.Success,
        'OK',
        {
          threadId,
          response: callResponse.text
        },
        StatusCodes.OK
      )
    );
  };
}
