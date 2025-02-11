import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';

import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { Document } from 'langchain/document';
import { JSONLoader, JSONLinesLoader } from 'langchain/document_loaders/fs/json';
import { ParentDocumentRetriever } from 'langchain/retrievers/parent_document';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { TextLoader } from 'langchain/document_loaders/fs/text';

import { getChromaVectorStore, getParentDocumentRetriever, getPineconeEmbeddings } from '@/libraries';
import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { collectionName } from '../langgraphRouter';

const verifyDocs = async (retriever: ParentDocumentRetriever, logger: Logger) => {
  // Verify relevant document retrieval
  const testQuery = 'What is ingredients of Korean Fried Chicken?';
  const testRelevantDocs = await retriever.invoke(testQuery);
  logger.info({ testQuery, testRelevantDocs }, 'Testing relevant document retrieval');

  if (
    testRelevantDocs.length === 0 ||
    testRelevantDocs.filter((doc: Document) => doc.pageContent.toLowerCase().indexOf('chicken') !== -1).length === 0
  ) {
    throw new Error('Retriever did not return documents for an relevant query');
  }

  // FIXME: It's still returning documents for irrelevant queries.
  // Verify irrelevant document filtering
  // const testIrrelevantQuery = 'What is the moon?';
  // const testIrrelevantDocs = await retriever.invoke(testIrrelevantQuery);
  // logger.info({ testIrrelevantQuery, testIrrelevantDocs }, 'Testing irrelevant document filtering');

  // if (testIrrelevantDocs.length !== 0) {
  //   throw new Error('Retriever returned documents for an irrelevant query');
  // }
};

export default function documentLoadGet() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const logger = request.log as Logger;
    const directoryPath = __dirname + '/../../../../data/langgraph';

    // Initialise document loader
    logger.info({ directoryPath }, 'Initializing document loader');
    const loader = new DirectoryLoader(directoryPath, {
      '.json': path => new JSONLoader(path, '/texts'),
      '.jsonl': path => new JSONLinesLoader(path, '/html'),
      '.txt': path => new TextLoader(path),
      '.csv': path => new CSVLoader(path, 'text'),
      '.pdf': path => new PDFLoader(path, { splitPages: false })
    });

    // Load documents
    const docs = await loader.load();
    logger.info({ docs }, 'Documents loaded');

    // Initialise embeddings and vector store
    // const embeddings = getOllamaEmbeddings(logger);
    const embeddings = getPineconeEmbeddings(logger);
    logger.info({ embeddings }, 'Embeddings Initialised');

    logger.info('Initializing vector store...');
    const vectorStore = await getChromaVectorStore(embeddings, collectionName, logger);
    logger.info({ collectionName: vectorStore.collectionName }, 'Vector store Initialised');

    // Setup collection
    logger.info('Ensuring collection exists...');
    // Delete collection if it exists
    // await vectorStore.delete({ ids: [collectionName] });
    // Create collection
    const collection = await vectorStore.ensureCollection();
    logger.info({ collection }, 'Collection ensured');

    // Clear existing documents
    logger.info('Clearing existing documents...');
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

    // Initialise retriever
    const retriever = await getParentDocumentRetriever(vectorStore, collectionName, logger);
    logger.info({ retriever }, 'Retriever Initialised');

    // Add documents
    logger.info('Adding documents to retriever...');
    const addDocumentsResult = await retriever.addDocuments(docs);
    logger.info({ addDocumentsResult }, 'Documents added');

    // Verify retriever
    try {
      await verifyDocs(retriever, logger);
      logger.info('Retriever verification passed');
    } catch (error) {
      logger.error(error, 'Retriever verification failed');
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : 'Unknown stack';
      await sendResponse(
        reply,
        new ServiceResponse(
          ResponseStatus.Failed,
          'Retriever verification failed',
          { error: { message: errorMessage, stack: errorStack } },
          StatusCodes.INTERNAL_SERVER_ERROR
        )
      );
      return;
    }

    // Get collection stats
    const collectionCount = await collection.count();
    const collectionDocs = await collection.get();
    logger.info({ collectionCount }, 'Collection stats retrieved');

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
  };
}
