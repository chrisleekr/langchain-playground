import config from 'config';
import { Embeddings } from '@langchain/core/embeddings';
import { OllamaEmbeddings } from '@langchain/ollama';
import { PineconeEmbeddings } from '@langchain/pinecone';

import { AwsCredentialIdentityProvider } from '@aws-sdk/types';
import { fromSSO } from '@aws-sdk/credential-providers';
import { BedrockEmbeddings } from '@langchain/aws';
import { Logger } from '@/libraries';

let ollamaEmbeddings: Embeddings;
let pineconeEmbeddings: Embeddings;
let bedrockEmbeddings: Embeddings;

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

const getBedrockEmbeddings = (logger: Logger): Embeddings => {
  if (!bedrockEmbeddings) {
    const model = config.get<string>('aws.bedrock.embeddingModel');
    logger.info({ model }, 'Getting Bedrock Embeddings...');

    let credentials: AwsCredentialIdentityProvider;
    if (config.get<string>('aws.bedrock.credentials.profile')) {
      credentials = fromSSO({
        profile: config.get<string>('aws.bedrock.credentials.profile')
      });
    } else {
      credentials = async () => ({
        accessKeyId: config.get<string>('aws.bedrock.credentials.accessKeyId'),
        secretAccessKey: config.get<string>('aws.bedrock.credentials.secretAccessKey')
      });
    }

    bedrockEmbeddings = new BedrockEmbeddings({ model, credentials, region: config.get<string>('aws.bedrock.region') });
  }
  return bedrockEmbeddings;
};

export { getOllamaEmbeddings, getPineconeEmbeddings, getBedrockEmbeddings };
