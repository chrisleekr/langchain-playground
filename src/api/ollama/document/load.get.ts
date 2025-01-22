import config from 'config';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';

import { UnstructuredDirectoryLoader } from '@langchain/community/document_loaders/fs/unstructured';
import { DocumentInterface } from '@langchain/core/documents';
import { getOllamaEmbeddings, getParentDocumentRetriever, getChromaVectorStore } from '@/libraries';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { sendResponse } from '@/libraries/httpHandlers';

export default function documentLoadGet(collectionName: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const logger = request.log as Logger;
    const directoryPath = __dirname + '/../../../../data';

    try {
      // Disable request timeout
      request.raw.setTimeout(0);

      logger.info({ directoryPath }, 'Loading documents from the directory');

      const directoryLoader: UnstructuredDirectoryLoader = new UnstructuredDirectoryLoader(directoryPath, {
        apiUrl: config.get('unstructuredAPI.url')
      });

      const docs = await directoryLoader.load();
      logger.info({ docs }, 'Loaded documents from the directory.');

      const embeddings = getOllamaEmbeddings(logger);
      logger.info({ embeddings }, 'Got embeddings.');

      logger.info('Getting Vector Store...');
      const vectorStore = await getChromaVectorStore(embeddings, collectionName, logger);
      logger.info({ collectionName: vectorStore.collectionName }, 'Got Vector Store...');

      logger.info('Ensuring collection exists...');
      const collection = await vectorStore.ensureCollection();
      logger.info({ collection }, 'Ensured collection exists, checking collection IDs...');

      const existingCollectionIds = (await collection.get()).ids;
      if (existingCollectionIds.length > 0) {
        logger.info(
          {
            existingCollectionIds
          },
          'Deleting existing docs from collection to create fresh collection...'
        );
        await collection.delete({ ids: existingCollectionIds });
        logger.info({ existingCollectionIds }, 'Deleted existing docs from collection');
      } else {
        logger.info('No existing docs found in collection');
      }

      const retriever = await getParentDocumentRetriever(vectorStore, collectionName, logger);
      logger.info({ retriever }, 'Got retriever.');

      logger.info('Adding documents to the retriever...');
      const addDocumentsResult = await retriever.addDocuments(docs);
      logger.info({ addDocumentsResult }, 'Added documents to the retriever.');

      const testRelevantDocs = await retriever.invoke('What is the moon made of?');
      logger.info({ testRelevantDocs }, 'Test relevant docs');

      if (
        testRelevantDocs.length === 0 ||
        testRelevantDocs.filter((doc: DocumentInterface<object>) => doc.pageContent.indexOf('moon') !== -1).length === 0
      ) {
        throw new Error('Retriever did not return relevant documents for test query.');
      }

      const collectionCount = await collection.count();
      const collectionDocs = await collection.get();
      logger.info({ collectionCount }, 'Document loading completed successfully');

      // Send the final response
      await sendResponse(
        reply,
        new ServiceResponse(
          ResponseStatus.Success,
          'Document loading completed successfully',
          {
            collectionCount,
            collectionDocs
          },
          StatusCodes.OK
        )
      );
    } catch (error) {
      logger.error({ error }, 'Error in document loading process');
      await sendResponse(
        reply,
        new ServiceResponse(
          ResponseStatus.Failed,
          error instanceof Error ? error.message : 'Unknown error occurred',
          null,
          StatusCodes.INTERNAL_SERVER_ERROR
        )
      );
    }
  };
}
