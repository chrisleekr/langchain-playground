import config from 'config';
import { Embeddings } from '@langchain/core/embeddings';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { QdrantVectorStore } from '@langchain/qdrant';
import { Logger } from '@/libraries';

// Vector Database — ChromaDB: Used to create a vector database that stores document embeddings for efficient retrieval of information.
const getChromaVectorStore = async (embeddings: Embeddings, collectionName: string, logger: Logger): Promise<Chroma> => {
  logger.info({ collectionName }, 'Getting Chroma Vector Store...');
  const chromaUrl = config.get<string>('chroma.url');
  logger.info({ chromaUrl }, 'Chroma URL');
  return new Chroma(embeddings, {
    collectionName,
    url: chromaUrl
  });
};

const getQdrantVectorStore = async (embeddings: Embeddings, collectionName: string, logger: Logger): Promise<QdrantVectorStore> => {
  logger.info({ collectionName }, 'Getting Qdrant Vector Store...');
  const qdrantUrl = config.get<string>('qdrant.url');
  logger.info({ qdrantUrl }, 'Qdrant URL');
  return new QdrantVectorStore(embeddings, {
    collectionName,
    url: qdrantUrl
  });
};

/**
 * Creates a fresh Qdrant Vector Store by deleting existing collection and creating a new one
 * Uses the fromExistingCollection method for better performance
 */
const getQdrantVectorStoreWithFreshCollection = async (
  embeddings: Embeddings,
  collectionName: string,
  logger: Logger
): Promise<QdrantVectorStore> => {
  logger.info({ collectionName }, 'Getting Qdrant Vector Store with fresh collection...');
  const qdrantUrl = config.get<string>('qdrant.url');
  logger.info({ qdrantUrl }, 'Qdrant URL');

  try {
    // First, try to connect to existing collection to check if it exists
    const existingVectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
      collectionName,
      url: qdrantUrl
    });

    logger.info({ collectionName }, 'Found existing collection, clearing it...');

    // Get client
    const client = existingVectorStore.client;

    // Get all points in the collection
    const scrollResult = await client.scroll(collectionName, {
      limit: 10000
    });

    const existingIds = scrollResult.points?.map(point => point.id) || [];

    if (existingIds.length > 0) {
      logger.info({ existingIds: existingIds.length }, 'Deleting existing documents from collection...');
      await client.delete(collectionName, {
        points: existingIds
      });
      logger.info('Successfully cleared existing collection');
    } else {
      logger.info('Collection was already empty');
    }

    return existingVectorStore;
  } catch (error) {
    // If collection doesn't exist, create a new one
    logger.info(
      {
        collectionName,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          name: error instanceof Error ? error.name : 'Unknown error',
          stack: error instanceof Error ? error.stack : 'Unknown stack'
        }
      },
      'Collection does not exist, creating new one...'
    );
    return new QdrantVectorStore(embeddings, {
      collectionName,
      url: qdrantUrl
    });
  }
};

const cleanupQdrantVectorStoreWithSource = async (
  embeddings: Embeddings,
  collectionName: string,
  source: string,
  logger: Logger
): Promise<number> => {
  logger.info({ collectionName }, 'Getting Qdrant Vector Store...');
  const qdrantUrl = config.get<string>('qdrant.url');
  logger.info({ qdrantUrl }, 'Qdrant URL');

  try {
    const existingVectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
      collectionName,
      url: qdrantUrl
    });

    logger.info({ collectionName }, 'Found existing collection, clearing it...');

    const client = existingVectorStore.client;

    const scrollResult = await client.scroll(collectionName, {
      limit: 10000,
      with_payload: true,
      filter: {
        must: [
          {
            key: 'metadata.source',
            match: {
              value: source
            }
          }
        ]
      }
    });

    const existingIds = scrollResult.points?.map(point => point.id) || [];

    if (existingIds.length > 0) {
      logger.info({ existingIds: existingIds.length, source }, 'Deleting existing documents from collection...');
      await client.delete(collectionName, {
        points: existingIds
      });
      logger.info({ source }, 'Successfully cleared existing collection');
    } else {
      logger.info({ source }, 'Collection was already empty');
    }

    return existingIds.length;
  } catch (error) {
    logger.error({ error }, 'Error getting Qdrant Vector Store with fresh collection...');
    throw error;
  }
};

export { getChromaVectorStore, getQdrantVectorStore, getQdrantVectorStoreWithFreshCollection, cleanupQdrantVectorStoreWithSource };
