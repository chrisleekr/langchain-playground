/**
 * Note: Couldn't make it working. The memory is not being saved between requests.
 */
import config from 'config';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { LLMChain } from 'langchain/chains';

import { VectorStoreRetrieverMemory } from 'langchain/memory';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { PromptTemplate } from '@langchain/core/prompts';

import { handleServiceResponse } from '@/libraries/httpHandlers';
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
  return async (req: Request, res: Response): Promise<Response<unknown, Record<string, unknown>>> => {
    const logger = req.log;
    const { id: threadId } = req.params;
    const { message } = req.body;

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

    const response = {
      threadId,
      response: callResponse.text
    };

    const serviceResponse = new ServiceResponse(ResponseStatus.Success, 'OK', response, StatusCodes.OK);
    return handleServiceResponse(serviceResponse, res);
  };
}
