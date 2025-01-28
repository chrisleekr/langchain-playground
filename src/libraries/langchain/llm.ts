import config from 'config';
import { ChatOllama, Ollama } from '@langchain/ollama';
import { ChatGroq } from '@langchain/groq';
import { OpenAI } from '@langchain/openai';
import { Logger } from '@/libraries';

let chatOllama: ChatOllama;
let llmOllama: Ollama;
let chatGroq: ChatGroq;
let openAI: OpenAI;

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
      temperature
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
      temperature
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

const getOpenAI = (logger: Logger): OpenAI => {
  if (!openAI) {
    const baseURL = config.get<string>('openai.baseUrl') || undefined;
    logger.info(
      {
        baseURL: baseURL || 'Not set',
        temperature: config.get('openai.temperature'),
        model: config.get('openai.model')
      },
      'Getting OpenAI...'
    );

    openAI = new OpenAI({
      apiKey: config.get('openai.apiKey'),
      temperature: config.get('openai.temperature'),
      model: config.get('openai.model'),
      configuration: {
        baseURL
      }
    });
  }
  return openAI;
};

export { getChatOllama, getLLMOllama, getChatGroq, getOpenAI };
