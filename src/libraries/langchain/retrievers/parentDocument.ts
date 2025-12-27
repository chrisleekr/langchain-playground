import { Document } from '@langchain/core/documents';
import { VectorStoreRetriever } from '@langchain/core/vectorstores';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { QdrantVectorStore } from '@langchain/qdrant';
import { Logger } from '@/libraries';

/**
 * Document splitting and retrieval utilities
 *
 * @see https://js.langchain.com/docs/tutorials/rag
 */

/**
 * Default text splitter configuration optimized for RAG.
 * Chunk size is set to work well with most embedding models.
 */
const getTextSplitter = (): RecursiveCharacterTextSplitter => {
  return new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 100
  });
};

/**
 * Split and add documents to a vector store.
 *
 * 1. Split documents into chunks using RecursiveCharacterTextSplitter
 * 2. Add chunks directly to the vector store
 *
 * @param vectorStore - The vector store to add documents to
 * @param documents - The documents to split and add
 * @param logger - Logger for debugging
 * @returns The IDs of the added documents
 */
const addDocumentsToVectorStore = async (
  vectorStore: Chroma | QdrantVectorStore,
  documents: Document[],
  logger: Logger
): Promise<string[] | void> => {
  const textSplitter = getTextSplitter();

  logger.info({ count: documents.length }, 'Splitting documents...');
  const splitDocs = await textSplitter.splitDocuments(documents);
  logger.info({ count: splitDocs.length }, 'Documents split into chunks');

  logger.info('Adding documents to vector store...');
  const result = await vectorStore.addDocuments(splitDocs);
  logger.info({ result }, 'Documents added to vector store');

  return result;
};

/**
 * Get a retriever from a vector store.
 *
 * vectorStore.asRetriever() for document retrieval.
 *
 * @param vectorStore - The vector store to create a retriever from
 * @param k - Number of documents to retrieve (default: 4)
 * @param logger - Logger for debugging
 * @returns A VectorStoreRetriever instance
 */
const getRetriever = (vectorStore: Chroma | QdrantVectorStore, k: number = 4, logger: Logger): VectorStoreRetriever<Chroma | QdrantVectorStore> => {
  logger.info({ k }, 'Creating retriever from vector store...');
  const retriever = vectorStore.asRetriever({ k });
  logger.info('Retriever created');
  return retriever;
};

export { getTextSplitter, addDocumentsToVectorStore, getRetriever };
