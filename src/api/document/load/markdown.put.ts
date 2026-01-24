/**
 * This endpoint is to load the markdown files using the markdown text splitter.
 */
import type { FastifyRequest, FastifyReply } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import config from 'config';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import crypto from 'crypto';
import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { cleanupQdrantVectorStoreWithSource, getOllamaEmbeddings, getQdrantVectorStore, getRequestLogger, sendResponse } from '@/libraries';

async function getMarkdownFiles(directoryPath: string): Promise<string[]> {
  const markdownFiles: string[] = [];
  const files = await readdir(directoryPath);
  for (const file of files) {
    const filePath = join(directoryPath, file);
    const stats = await stat(filePath);
    if (stats.isDirectory()) {
      markdownFiles.push(...(await getMarkdownFiles(filePath)));
    } else if (file.endsWith('.md')) {
      markdownFiles.push(filePath);
    }
  }
  return markdownFiles;
}

export default function parentLoadMarkdownPut() {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const logger = getRequestLogger(request.log);
    const collectionName = config.get<string>('document.collectionName');
    const directoryPath = resolve(__dirname, '../../../../data/langgraph');

    // Initialize embeddings and vector store
    const embeddings = getOllamaEmbeddings(logger);
    // const embeddings = getPineconeEmbeddings(logger);
    logger.info('Embeddings Initialized');

    logger.info('Initializing vector store...');
    const vectorStore = await getQdrantVectorStore(embeddings, collectionName, logger);
    logger.info({ collectionName: vectorStore.collectionName }, 'Vector store Initialized');

    // Delete existing documents from collection
    const deletedCount = await cleanupQdrantVectorStoreWithSource(embeddings, collectionName, 'markdown', logger);
    logger.info({ deletedCount }, 'Deleted existing documents from collection');

    // Get all markdown files recursively from the directory
    const markdownFiles = await getMarkdownFiles(directoryPath);
    logger.info({ markdownFiles }, 'Markdown files loaded');

    // Constants for safe chunk processing
    const SAFE_CHUNK_SIZE = 1000; // Conservative limit
    const CHUNK_OVERLAP = 0; // Reasonable overlap for context preservation
    let processedCount = 0;
    let skippedCount = 0;

    // Loop through the markdown files and retrieve the text
    for (const markdownFile of markdownFiles) {
      const markdownText = await readFile(markdownFile, 'utf8');
      const markdownSplitter = RecursiveCharacterTextSplitter.fromLanguage('markdown', {
        chunkSize: SAFE_CHUNK_SIZE,
        chunkOverlap: CHUNK_OVERLAP
      });
      const markdownDoc = await markdownSplitter.createDocuments([markdownText]);

      logger.info(
        {
          file: markdownFile,
          chunksCreated: markdownDoc.length
        },
        'Created chunks for markdown file'
      );

      // Loop markdownDoc and add metadata
      for (const doc of markdownDoc) {
        // Validate and potentially truncate the document

        doc.metadata = {
          ...doc.metadata,
          // exclude the directory path from markdown file
          source: markdownFile.replace(directoryPath, ''),
          method: 'vectorStore',
          lastUpdated: new Date().toISOString(),
          documentType: 'markdown',
          // md5 hash of the markdown file
          doc_id: crypto.createHash('md5').update(markdownFile).digest('hex')
        };

        try {
          logger.info(
            {
              contentLength: doc.pageContent.length,
              source: doc.metadata.source
            },
            'Adding document to vector store...'
          );

          await vectorStore.addDocuments([doc]);
          processedCount++;
          logger.info('Document added successfully');
        } catch (addError) {
          logger.error(
            {
              error: addError,
              source: doc.metadata.source,
              contentLength: doc.pageContent.length,
              contentPreview: doc.pageContent.substring(0, 100) + '...'
            },
            'Failed to add document to vector store'
          );
          skippedCount++;
        }
      }
    }

    logger.info({ processedCount, skippedCount }, 'Processed and skipped documents');

    // Final collection stats
    const finalCollectionInfo = await vectorStore.client.getCollection(collectionName);
    const finalScrollResult = await vectorStore.client.scroll(collectionName, { limit: 1 });
    logger.info({ finalCollectionInfo, finalScrollResult }, 'Final collection stats');

    // Send the final response
    await sendResponse(
      reply,
      new ServiceResponse(
        ResponseStatus.Success,
        'Document loading completed successfully',
        {
          collectionInfo: finalCollectionInfo,
          sampleDoc: finalScrollResult.points?.[0] || null,
          totalDocuments: markdownFiles.length
        },
        StatusCodes.OK
      )
    );
  };
}
