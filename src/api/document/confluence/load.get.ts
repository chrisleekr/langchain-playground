import type { FastifyRequest, FastifyReply } from 'fastify';

import config from 'config';
import { Logger } from 'pino';
import { ConfluencePagesLoader } from '@langchain/community/document_loaders/web/confluence';
import { StatusCodes } from 'http-status-codes';
import { cleanupQdrantVectorStoreWithSource, getParentDocumentRetriever, getPineconeEmbeddings, getQdrantVectorStore } from '@/libraries';
import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';

export default function confluenceLoadGet() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const logger = request.log as Logger;
    const collectionName = config.get<string>('document.collectionName');

    const baseUrl = config.get<string>('document.confluence.baseUrl');
    const username = config.get<string>('document.confluence.username');
    const accessToken = config.get<string>('document.confluence.accessToken');
    const spaceKey = config.get<string>('document.confluence.spaceKey');

    const confluence = new ConfluencePagesLoader({
      baseUrl,
      username,
      accessToken,
      spaceKey
    });

    const docs = await confluence.load();
    logger.info(
      {
        documentCount: docs.length,
        firstDocSample:
          docs.length > 0
            ? {
                pageContent: docs[0].pageContent.substring(0, 200) + '...',
                metadata: docs[0].metadata
              }
            : null
      },
      'Documents loaded from Confluence'
    );

    // Validate we got documents
    if (docs.length === 0) {
      throw new Error('No documents loaded from Confluence. Check your space key and permissions.');
    }

    // Enhanced document metadata
    const enhancedDocs = docs.map((doc, index) => {
      const enhanced = {
        ...doc,
        metadata: {
          ...doc.metadata,
          source: 'confluence',
          confluenceSpace: spaceKey,
          lastUpdated: new Date().toISOString(),
          confluencePageId: doc.metadata.confluencePageId,
          documentType: 'confluence-page'
        }
      };

      if (index === 0) {
        logger.info({ enhancedDocSample: enhanced }, 'Enhanced document sample');
      }

      return enhanced;
    });

    const embeddings = getPineconeEmbeddings(logger);
    logger.info({ embeddings }, 'Embeddings Initialized');

    logger.info('Initializing vector store...');
    const vectorStore = await getQdrantVectorStore(embeddings, collectionName, logger);
    logger.info({ collectionName: vectorStore.collectionName }, 'Vector store Initialized');

    // Delete existing documents from collection
    const deletedCount = await cleanupQdrantVectorStoreWithSource(embeddings, collectionName, 'confluence', logger);
    logger.info({ deletedCount }, 'Deleted existing documents from collection');

    // Initialize retriever
    const retriever = await getParentDocumentRetriever(vectorStore, collectionName, logger);
    logger.info({ retriever }, 'Retriever Initialized');

    // Add documents
    logger.info('Adding documents to retriever...');
    const addDocumentsResult = await retriever.addDocuments(enhancedDocs);
    logger.info({ addDocumentsResult }, 'Documents added');

    // Wait a moment for indexing
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check collection stats after adding documents
    const postAddCollectionInfo = await vectorStore.client.getCollection(collectionName);
    logger.info({ postAddCollectionInfo }, 'Post-add collection stats');

    // Test if documents are actually in the collection
    const scrollResult = await vectorStore.client.scroll(collectionName, { limit: 10 });
    logger.info(
      {
        scrollResultCount: scrollResult.points?.length || 0,
        samplePoint: scrollResult.points?.[0] || null
      },
      'Collection scroll results'
    );

    // Test retriever functionality
    logger.info('Testing retriever functionality...');
    const testQueries = [
      'confluence',
      'documentation',
      docs[0].pageContent.split(' ').slice(0, 3).join(' ') // First few words from first doc
    ];

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

    // Test direct vector store search
    logger.info('Testing direct vector store search...');
    const directSearchResults = await vectorStore.similaritySearch('confluence', 3);
    logger.info(
      {
        directSearchCount: directSearchResults.length,
        firstDirectResult: directSearchResults[0]
          ? {
              pageContent: directSearchResults[0].pageContent.substring(0, 100) + '...',
              metadata: directSearchResults[0].metadata
            }
          : null
      },
      'Direct vector store search results'
    );

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
          confluenceSpace: spaceKey,
          testResults: {
            directSearchResults: directSearchResults.length,
            retrieverTests: testQueries.length
          }
        },
        StatusCodes.OK
      )
    );
  };
}
