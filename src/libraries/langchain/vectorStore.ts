import config from 'config';
import { Embeddings } from '@langchain/core/embeddings';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { Logger } from '@/libraries';

// Vector Database — ChromaDB: Used to create a vector database that stores document embeddings for efficient retrieval of information.
const getVectorStore = async (embeddings: Embeddings, collectionName: string, logger: Logger): Promise<Chroma> => {
  logger.info('Getting Chroma Vector Store...');
  return new Chroma(embeddings, {
    collectionName,
    url: config.get('chroma.url')
  });
};

export { getVectorStore };
