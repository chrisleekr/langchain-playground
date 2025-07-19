import config from 'config';
import { Embeddings } from '@langchain/core/embeddings';
import { OllamaEmbeddings } from '@langchain/ollama';
import { PineconeEmbeddings } from '@langchain/pinecone';

import { Logger } from '@/libraries';

let ollamaEmbeddings: Embeddings;
let pineconeEmbeddings: Embeddings;
const getOllamaEmbeddings = (logger: Logger): Embeddings => {
  if (!ollamaEmbeddings) {
    const baseUrl = config.get<string>('ollama.baseUrl');
    const model = config.get<string>('ollama.embeddingModel');
    logger.info({ baseUrl, model }, 'Getting Ollama Embeddings...');
    ollamaEmbeddings = new OllamaEmbeddings({
      baseUrl,
      model
    });
  }
  return ollamaEmbeddings;
};

const getPineconeEmbeddings = (logger: Logger): Embeddings => {
  if (!pineconeEmbeddings) {
    const apiKey = config.get<string>('pinecone.apiKey');

    logger.info('Getting Pinecone Embeddings...');
    pineconeEmbeddings = new PineconeEmbeddings({
      apiKey,
      model: 'multilingual-e5-large' // Only support this model for now
    });
  }
  return pineconeEmbeddings;
};

export { getOllamaEmbeddings, getPineconeEmbeddings };
