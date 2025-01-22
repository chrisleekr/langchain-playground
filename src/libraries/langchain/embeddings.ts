import config from 'config';
import { Embeddings } from '@langchain/core/embeddings';
import { OllamaEmbeddings } from '@langchain/ollama';

import { Logger } from '@/libraries';

const getOllamaEmbeddings = (logger: Logger): Embeddings => {
  const baseUrl = <string>config.get('ollama.baseUrl');
  const model = <string>config.get('ollama.embeddingModel');
  logger.info({ baseUrl, model }, 'Getting Ollama Embeddings...');
  return new OllamaEmbeddings({
    baseUrl,
    model
  });
};

export { getOllamaEmbeddings };
