import config from 'config';
import { BaseChatModel } from 'langchain/chat_models/base';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { LLM } from 'langchain/llms/base';
import { Ollama } from '@langchain/community/llms/ollama';
import { ChatGroq } from '@langchain/groq';
import { Logger } from '@/libraries';

const getChatOllama = (temperature: number, logger: Logger): BaseChatModel => {
  logger.info('Getting ChatOllama...');
  return new ChatOllama({
    baseUrl: config.get('ollama.baseUrl'),
    model: config.get('ollama.model'),
    temperature
  });
};

const getLLMOllama = (temperature: number, logger: Logger): LLM => {
  logger.info('Getting LLM...');
  return new Ollama({
    baseUrl: config.get('ollama.baseUrl'),
    model: config.get('ollama.model'),
    temperature
  });
};

const getChatGroq = (temperature: number, logger: Logger): BaseChatModel => {
  logger.info('Getting ChatGroq...');
  return new ChatGroq({
    apiKey: config.get('groq.apiKey'),
    model: config.get('groq.model'),
    temperature
  });
};

export { getChatOllama, getLLMOllama, getChatGroq };
