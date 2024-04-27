import config from 'config';
import { Embeddings } from '@langchain/core/embeddings';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { Logger } from '@/libraries';

// Embeddings Model — OpenAI Embeddings: Converts text into embeddings, a numerical representation that machines can understand and process.
const getOllamaEmbeddings = (logger: Logger): Embeddings => {
  logger.info('Getting Ollama Embeddings...');
  return new OllamaEmbeddings({
    baseUrl: config.get('ollama.baseUrl'),
    model: config.get('ollama.embeddingModel')
  });
};

export { getOllamaEmbeddings };
