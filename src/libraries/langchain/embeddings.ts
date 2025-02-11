import config from 'config';
import { Embeddings } from '@langchain/core/embeddings';
import { OllamaEmbeddings } from '@langchain/ollama';
import { PineconeEmbeddings } from '@langchain/pinecone';

import { Logger } from '@/libraries';

let ollamaEmbeddings: Embeddings;
let pineconeEmbeddings: Embeddings;
const getOllamaEmbeddings = (logger: Logger): Embeddings => {
  if (!ollamaEmbeddings) {
    const baseUrl = <string>config.get('ollama.baseUrl');
    const model = <string>config.get('ollama.embeddingModel');
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
    const apiKey = <string>config.get('pinecone.apiKey');
    logger.info('Getting Pinecone Embeddings...');
    pineconeEmbeddings = new PineconeEmbeddings({
      apiKey,
      model: 'multilingual-e5-large'
    });
  }
  return pineconeEmbeddings;
};

export { getOllamaEmbeddings, getPineconeEmbeddings };
