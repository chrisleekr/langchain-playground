/**
 * This endpoint is to load the directory using the parent document retriever.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';

import config from 'config';

import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { DirectoryLoader } from 'langchain/document_loaders/fs/directory';
import { JSONLoader, JSONLinesLoader } from 'langchain/document_loaders/fs/json';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { TextLoader } from 'langchain/document_loaders/fs/text';

import { cleanupQdrantVectorStoreWithSource, getOllamaEmbeddings, getParentDocumentRetriever, getQdrantVectorStore } from '@/libraries';
import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

export default function parentLoadDirectoryPut() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const logger = request.log as Logger;
    const collectionName = config.get<string>('document.collectionName');
    const directoryPath = __dirname + '/../../../../data/langgraph';

    // Initialize document loader
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

    // Validate we got documents
    if (docs.length === 0) {
      throw new Error('No documents loaded from directory. Check your directory path.');
    }

    // Enhanced document metadata
    const enhancedDocs = docs.map((doc, index) => {
      const enhanced = {
        ...doc,
        metadata: {
          ...doc.metadata,
          source: 'directory',
          method: 'vectorStore',
          lastUpdated: new Date().toISOString(),
          documentType: 'directory'
        }
      };

      if (index === 0) {
        logger.info({ enhancedDocSample: enhanced }, 'Enhanced document sample');
      }

      return enhanced;
    });

    // Initialize embeddings and vector store
    const embeddings = getOllamaEmbeddings(logger);
    // const embeddings = getPineconeEmbeddings(logger);
    logger.info('Embeddings Initialized');

    logger.info('Initializing vector store...');
    const vectorStore = await getQdrantVectorStore(embeddings, collectionName, logger);
    logger.info({ collectionName: vectorStore.collectionName }, 'Vector store Initialized');

    // Delete existing documents from collection
    const deletedCount = await cleanupQdrantVectorStoreWithSource(embeddings, collectionName, 'directory', logger);
    logger.info({ deletedCount }, 'Deleted existing documents from collection');

    // Add documents
    logger.info('Adding documents to vector store...');
    const retriever = await getParentDocumentRetriever(vectorStore, collectionName, logger);
    const addDocumentsResult = await retriever.addDocuments(enhancedDocs);
    logger.info({ addDocumentsResult }, 'Documents added');

    // Test retriever functionality
    logger.info('Testing retriever functionality...');
    const testQueries = ['What is ingredients of Korean Fried Chicken?'];

    for (const query of testQueries) {
      try {
        const testResults = await retriever.invoke(query);
        logger.info(
          {
            query,
            resultCount: testResults.length,
            firstResult: testResults[0]
              ? {
                  pageContent: testResults[0].pageContent.substring(0, 100) + '...',
                  metadata: testResults[0].metadata
                }
              : null
          },
          `Test query: "${query}"`
        );
      } catch (err) {
        logger.error({ query, err }, `Test query failed: "${query}"`);
      }
    }

    // Final collection stats
    const finalCollectionInfo = await vectorStore.client.getCollection(collectionName);
    const finalScrollResult = await vectorStore.client.scroll(collectionName, { limit: 1 });

    logger.info(
      {
        finalCollectionInfo,
        finalScrollResult: finalScrollResult.points?.[0] || null
      },
      'Final collection stats'
    );

    // Send the final response
    await sendResponse(
      reply,
      new ServiceResponse(
        ResponseStatus.Success,
        'Document loading completed successfully',
        {
          collectionInfo: finalCollectionInfo,
          sampleDoc: finalScrollResult.points?.[0] || null,
          totalDocuments: docs.length,
          testResults: {
            retrieverTests: testQueries.length
          }
        },
        StatusCodes.OK
      )
    );
  };
}
