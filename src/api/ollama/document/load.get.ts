/**
 * This endpoint loads documents
 *
 * @see https://js.langchain.com/docs/tutorials/rag
 */
import config from 'config';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';

import { UnstructuredDirectoryLoader } from '@langchain/community/document_loaders/fs/unstructured';
import { DocumentInterface } from '@langchain/core/documents';
import { getOllamaEmbeddings, getQdrantVectorStoreWithFreshCollection, addDocumentsToVectorStore, getRetriever } from '@/libraries';
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

      logger.info('Getting Vector Store with fresh collection...');
      const vectorStore = await getQdrantVectorStoreWithFreshCollection(embeddings, collectionName, logger);
      logger.info({ collectionName: vectorStore.collectionName }, 'Got Vector Store with fresh collection...');

      // Add documents
      logger.info({ count: docs.length }, 'Adding documents to the vector store...');
      const addDocumentsResult = await addDocumentsToVectorStore(vectorStore, docs, logger);
      logger.info({ addDocumentsResult }, 'Added documents to the vector store.');

      // Create retriever
      const retriever = getRetriever(vectorStore, 4, logger);
      logger.info('Created retriever.');

      const testRelevantDocs = await retriever.invoke('What is the moon made of?');
      logger.info({ testRelevantDocs }, 'Test relevant docs');

      if (
        testRelevantDocs.length === 0 ||
        testRelevantDocs.filter((doc: DocumentInterface<object>) => doc.pageContent.indexOf('moon') !== -1).length === 0
      ) {
        throw new Error('Retriever did not return relevant documents for test query.');
      }

      // Get collection info for response
      const client = vectorStore.client;
      const collectionInfo = await client.getCollection(collectionName);
      const scrollResult = await client.scroll(collectionName, { limit: 1 });

      logger.info({ collectionInfo }, 'Document loading completed successfully');

      // Send the final response
      await sendResponse(
        reply,
        new ServiceResponse(
          ResponseStatus.Success,
          'Document loading completed successfully',
          {
            collectionInfo,
            sampleDoc: scrollResult.points?.[0] || null
          },
          StatusCodes.OK
        )
      );
    } catch (err) {
      logger.error({ err }, 'Error in document loading process');
      await sendResponse(
        reply,
        new ServiceResponse(
          ResponseStatus.Failed,
          err instanceof Error ? err.message : 'Unknown error occurred',
          null,
          StatusCodes.INTERNAL_SERVER_ERROR
        )
      );
    }
  };
}
