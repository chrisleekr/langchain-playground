import config from 'config';
import { ChatOllama, Ollama } from '@langchain/ollama';
import { ChatGroq } from '@langchain/groq';
import { OpenAI } from '@langchain/openai';
import { Logger } from '@/libraries';

const getChatOllama = (temperature: number, logger: Logger): ChatOllama => {
  logger.info(
    {
      baseUrl: config.get('ollama.baseUrl'),
      model: config.get('ollama.model'),
      temperature
    },
    'Getting ChatOllama...'
  );
  return new ChatOllama({
    baseUrl: config.get('ollama.baseUrl'),
    model: config.get('ollama.model'),
    temperature
  });
};

const getLLMOllama = (temperature: number, logger: Logger): Ollama => {
  logger.info('Getting LLM Ollama...');
  return new Ollama({
    baseUrl: config.get('ollama.baseUrl'),
    model: config.get('ollama.model'),
    temperature
  });
};

const getChatGroq = (temperature: number, logger: Logger): ChatGroq => {
  logger.info('Getting ChatGroq...');
  return new ChatGroq({
    apiKey: config.get('groq.apiKey'),
    model: config.get('groq.model'),
    temperature
  });
};

const getOpenAI = (logger: Logger): OpenAI => {
  const baseURL = config.get<string>('openai.baseUrl') || undefined;
  logger.info(
    {
      baseURL: baseURL || 'Not set'
    },
    'Getting OpenAI...'
  );

  return new OpenAI({
    apiKey: config.get('openai.apiKey'),
    temperature: config.get('openai.temperature'),
    model: config.get('openai.model'),
    configuration: {
      baseURL
    }
  });
};

export { getChatOllama, getLLMOllama, getChatGroq, getOpenAI };
