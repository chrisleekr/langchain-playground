import type { Logger } from 'pino';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import { getChatOpenAI, getChatGroq, getChatOllama, getChatBedrockConverse } from '@/libraries/langchain/llm';
import type { AgentConfig } from './config';

/**
 * Extracts an error message from an unknown error type.
 * Safely handles Error objects, strings, and other types.
 *
 * @param error - The error to extract a message from
 * @returns A string error message
 */
export const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
};

/**
 * Get the appropriate chat model based on the agent configuration.
 * Uses the provider specified in config and applies temperature and token limits.
 *
 * @param config - The agent configuration containing provider and model settings
 * @param logger - Logger instance for debugging
 * @returns A configured BaseChatModel instance
 * @throws {Error} If the provider is not supported
 */
export const getModel = (config: AgentConfig, logger: Logger): BaseChatModel => {
  switch (config.provider) {
    case 'openai':
      return getChatOpenAI(config.temperature, logger);
    case 'groq':
      return getChatGroq(config.temperature, logger);
    case 'ollama':
      return getChatOllama(config.temperature, logger);
    case 'bedrock':
      return getChatBedrockConverse({ temperature: config.temperature, maxTokens: config.maxTokens }, logger);
    default: {
      const exhaustiveCheck: never = config.provider;
      throw new Error(`Unsupported provider: ${exhaustiveCheck}`);
    }
  }
};
