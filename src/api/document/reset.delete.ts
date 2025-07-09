import type { FastifyRequest, FastifyReply } from 'fastify';
import { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';
import config from 'config';
import { getPineconeEmbeddings, getQdrantVectorStoreWithFreshCollection, sendResponse } from '@/libraries';
import { ServiceResponse, ResponseStatus } from '@/models/serviceResponse';

export default function resetDelete() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const logger = request.log as Logger;
    const collectionName = config.get<string>('document.collectionName');

    const embeddings = getPineconeEmbeddings(logger);
    logger.info({ embeddings }, 'Embeddings Initialized');

    const vectorStore = await getQdrantVectorStoreWithFreshCollection(embeddings, collectionName, logger);
    logger.info({ vectorStore }, 'Vector store Initialized');

    const collectionCount = await vectorStore.client.getCollection(collectionName);
    logger.info({ collectionCount }, 'Collection stats retrieved');

    const collectionDocs = await vectorStore.client.scroll(collectionName, { limit: 1 });
    logger.info({ collectionDocs }, 'Collection docs retrieved');

    // Send the final response
    await sendResponse(
      reply,
      new ServiceResponse(
        ResponseStatus.Success,
        'Document reset completed successfully',
        {
          collectionCount,
          collectionDocs
        },
        StatusCodes.OK
      )
    );
  };
}
