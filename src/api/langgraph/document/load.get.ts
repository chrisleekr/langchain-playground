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

import { getOllamaEmbeddings, getChromaVectorStore, getParentDocumentRetriever } from '@/libraries';
import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { collectionName } from '../langgraphRouter';

const verifyDocs = async (retriever: ParentDocumentRetriever, logger: Logger) => {
  // Verify relevant document retrieval
  const testRelevantDocs = await retriever.invoke('What is ingredients of Korean Fried Chicken?');
  logger.info({ testRelevantDocs }, 'Testing relevant document retrieval');

  if (testRelevantDocs.length === 0 || testRelevantDocs.filter((doc: Document) => doc.pageContent.indexOf('chicken') !== -1).length === 0) {
    throw new Error('Retriever did not return relevant documents for test query');
  }

  // Verify irrelevant document filtering
  const testIrrelevantDocs = await retriever.invoke('What is the moon?');
  logger.info({ testIrrelevantDocs }, 'Testing irrelevant document filtering');

  if (testIrrelevantDocs.length !== 0 || testIrrelevantDocs.filter((doc: Document) => doc.pageContent.indexOf('moon') !== -1).length !== 0) {
    throw new Error('Retriever returned irrelevant documents for test query');
  }
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
    const embeddings = getOllamaEmbeddings(logger);
    logger.info({ embeddings }, 'Embeddings Initialised');

    logger.info('Initializing vector store...');
    const vectorStore = await getChromaVectorStore(embeddings, collectionName, logger);
    logger.info({ collectionName: vectorStore.collectionName }, 'Vector store Initialised');

    // Setup collection
    logger.info('Ensuring collection exists...');
    const collection = await vectorStore.ensureCollection();
    logger.info({ collection }, 'Collection ensured');

    // Clear existing documents
    logger.info('Clearing existing documents...');
    const existingCollectionIds = (await collection.get()).ids;
    await collection.delete({ ids: existingCollectionIds });
    logger.info({ existingCollectionIds }, 'Existing documents cleared');

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
    } catch (e) {
      logger.error({ error: e }, 'Retriever verification failed');
    }

    // Get collection stats
    const collectionCount = await collection.count();
    const collectionDocs = await collection.get();
    logger.info({ collectionCount }, 'Collection stats retrieved');

    await sendResponse(
      reply,
      new ServiceResponse(
        ResponseStatus.Success,
        'OK',
        {
          collectionCount,
          collectionDocs
        },
        StatusCodes.OK
      )
    );
  };
}
