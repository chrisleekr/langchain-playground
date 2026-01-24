import { Logger } from 'pino';
import { getChatOllama } from '@/libraries';

/**
 * Gets the chat LLM for Slack event handling.
 *
 * Temperature is configured via config file (ollama.temperature).
 * Switch the return statement to use a different provider.
 */
export const getChatLLM = (logger: Logger) => {
  return getChatOllama(logger);
  // return getChatGroq(logger);
};
