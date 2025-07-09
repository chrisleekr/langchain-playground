import { Logger } from 'pino';
import { getChatOllama } from '@/libraries';

export const getChatLLM = (temperature: number, logger: Logger) => {
  return getChatOllama(temperature, logger);
  // return getChatGroq(temperature, logger);
};
