import config from 'config';
import { BaseChatModel } from 'langchain/chat_models/base';
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { Logger } from '@/libraries';

const getChat = (logger: Logger): BaseChatModel => {
  logger.info('Getting ChatOllama...');
  return new ChatOllama({
    baseUrl: config.get('ollama.baseUrl'),
    model: config.get('ollama.model')
  });
};

export { getChat };
