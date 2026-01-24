/**
 * This endpoint loads documents from a directory
 *
 * Following the pattern:
 * - Use RecursiveCharacterTextSplitter from @langchain/textsplitters
 * - Use vectorStore.asRetriever() for retrieval
 *
 * @see https://js.langchain.com/docs/tutorials/rag
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { StatusCodes } from 'http-status-codes';

import config from 'config';
import { Document } from '@langchain/core/documents';

import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

import {
  cleanupQdrantVectorStoreWithSource,
  getOllamaEmbeddings,
  getQdrantVectorStore,
  addDocumentsToVectorStore,
  getRetriever,
  getRequestLogger,
  DirectoryLoader,
  JSONLoader,
  JSONLinesLoader,
  TextLoader,
  sendResponse
} from '@/libraries';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

export default function parentLoadDirectoryPut() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const logger = getRequestLogger(request.log);
    const collectionName = config.get<string>('document.collectionName');
    const directoryPath = __dirname + '/../../../../../data/langgraph';

    // Initialize document loader
    logger.info({ directoryPath }, 'Initializing document loader');
    const loader = new DirectoryLoader(
      directoryPath,
      {
        '.json': (path: string) => new JSONLoader(path, '/texts'),
        '.jsonl': (path: string) => new JSONLinesLoader(path, '/html'),
        '.txt': (path: string) => new TextLoader(path),
        '.csv': (path: string) => new CSVLoader(path, 'text'),
        '.pdf': (path: string) => new PDFLoader(path, { splitPages: false })
      },
      logger
    );

    // Load documents
    const docs = await loader.load();
    logger.info({ count: docs.length }, 'Documents loaded');

    // Validate we got documents
    if (docs.length === 0) {
      throw new Error('No documents loaded from directory. Check your directory path.');
    }

    // Enhanced document metadata
    const enhancedDocs = docs.map((doc, index) => {
      const enhanced = new Document({
        pageContent: doc.pageContent,
        metadata: {
          ...doc.metadata,
          source: 'directory',
          method: 'vectorStore',
          lastUpdated: new Date().toISOString(),
          documentType: 'directory'
        }
      });

      if (index === 0) {
        logger.info({ enhancedDocSample: enhanced }, 'Enhanced document sample');
      }

      return enhanced;
    });

    // Initialize embeddings and vector store
    const embeddings = getOllamaEmbeddings(logger);
    logger.info('Embeddings Initialized');

    logger.info('Initializing vector store...');
    const vectorStore = await getQdrantVectorStore(embeddings, collectionName, logger);
    logger.info({ collectionName: vectorStore.collectionName }, 'Vector store Initialized');

    // Delete existing documents from collection
    const deletedCount = await cleanupQdrantVectorStoreWithSource(embeddings, collectionName, 'directory', logger);
    logger.info({ deletedCount }, 'Deleted existing documents from collection');

    // Add documents
    // Documents are split and added directly to vector store
    const addDocumentsResult = await addDocumentsToVectorStore(vectorStore, enhancedDocs, logger);
    logger.info({ addDocumentsResult }, 'Documents added');

    // Create retriever
    const retriever = getRetriever(vectorStore, 4, logger);

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
