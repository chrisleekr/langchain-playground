import type { FastifyRequest, FastifyReply } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import config from 'config';
import { getPineconeEmbeddings, getQdrantVectorStoreWithFreshCollection, getRequestLogger, sendResponse } from '@/libraries';
import { ServiceResponse, ResponseStatus } from '@/models/serviceResponse';

export default function resetDelete() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const logger = getRequestLogger(request.log);
    const collectionName = config.get<string>('document.collectionName');

    const embeddings = getPineconeEmbeddings(logger);
    logger.info('Embeddings Initialized');

    const vectorStore = await getQdrantVectorStoreWithFreshCollection(embeddings, collectionName, logger);
    logger.info('Vector store Initialized');

    // Create index for metadata.loc.lines.from
    // Refer: https://qdrant.tech/documentation/concepts/indexing/
    logger.info('Creating index for metadata.loc.lines.from');
    const index = await vectorStore.client.createPayloadIndex(collectionName, {
      field_name: 'metadata.loc.lines.from',
      field_schema: {
        type: 'integer'
      }
    });
    logger.info({ index }, 'Created index for metadata.loc.lines.from');

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
