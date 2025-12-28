import config from 'config';
import { ChatOllama, Ollama } from '@langchain/ollama';
import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';
import { ChatBedrockConverse } from '@langchain/aws';
import { fromSSO } from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentityProvider } from '@aws-sdk/types';
import { Logger } from '@/libraries';

let chatOllama: ChatOllama;
let llmOllama: Ollama;
let chatGroq: ChatGroq;
let chatOpenAI: ChatOpenAI;
let chatBedrockConverse: ChatBedrockConverse;

type LLM = ChatOllama | Ollama | ChatGroq | ChatOpenAI | ChatBedrockConverse;

const getChatOllama = (temperature: number, logger: Logger): ChatOllama => {
  logger.info(
    {
      baseUrl: config.get('ollama.baseUrl'),
      model: config.get('ollama.model'),
      temperature
    },
    'Getting ChatOllama...'
  );
  if (!chatOllama) {
    chatOllama = new ChatOllama({
      baseUrl: config.get('ollama.baseUrl'),
      model: config.get('ollama.model'),
      temperature,
      keepAlive: 300
    });
  }
  return chatOllama;
};

const getLLMOllama = (temperature: number, logger: Logger): Ollama => {
  logger.info(
    {
      baseUrl: config.get('ollama.baseUrl'),
      model: config.get('ollama.model'),
      temperature
    },
    'Getting LLM Ollama...'
  );
  if (!llmOllama) {
    llmOllama = new Ollama({
      baseUrl: config.get('ollama.baseUrl'),
      model: config.get('ollama.model'),
      temperature,
      keepAlive: 300
    });
  }
  return llmOllama;
};

const getChatGroq = (temperature: number, logger: Logger): ChatGroq => {
  logger.info(
    {
      model: config.get('groq.model'),
      temperature
    },
    'Getting ChatGroq...'
  );
  if (!chatGroq) {
    chatGroq = new ChatGroq({
      apiKey: config.get('groq.apiKey'),
      model: config.get('groq.model'),
      temperature
    });
  }
  return chatGroq;
};

const getChatOpenAI = (temperature: number, logger: Logger): ChatOpenAI => {
  if (!chatOpenAI) {
    const baseURL = config.get<string>('openai.baseUrl') || undefined;
    logger.info(
      {
        baseURL: baseURL || 'Not set',
        temperature,
        model: config.get('openai.model')
      },
      'Getting OpenAI...'
    );

    chatOpenAI = new ChatOpenAI({
      apiKey: config.get('openai.apiKey'),
      temperature,
      model: config.get('openai.model'),
      configuration: {
        baseURL
      }
    });
  }
  return chatOpenAI;
};

interface GetChatBedrockConverseParams {
  temperature: number;
  maxTokens: number;
}

const getChatBedrockConverse = ({ temperature, maxTokens }: GetChatBedrockConverseParams, logger: Logger): ChatBedrockConverse => {
  if (!chatBedrockConverse) {
    logger.info({ temperature, maxTokens, profile: config.get('aws.bedrock.credentials.profile') }, 'Getting ChatBedrockConverse...');

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

    chatBedrockConverse = new ChatBedrockConverse({
      model: config.get<string>('aws.bedrock.model'),
      temperature,
      maxTokens,
      region: config.get<string>('aws.bedrock.region'),
      credentials
    });
  }
  return chatBedrockConverse;
};

export { getChatOllama, getLLMOllama, getChatGroq, getChatOpenAI, getChatBedrockConverse, GetChatBedrockConverseParams, LLM };
