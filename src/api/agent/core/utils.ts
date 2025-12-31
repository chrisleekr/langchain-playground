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

/**
 * Result of createTimeoutPromise with cleanup capability.
 */
export interface TimeoutPromiseResult {
  /** Promise that rejects with timeout error after specified duration */
  promise: Promise<never>;
  /** Cleanup function to clear the timeout and prevent memory leaks */
  clear: () => void;
}

/**
 * Creates a timeout promise that rejects after the specified duration.
 * Used to prevent long-running agent investigations from blocking resources.
 *
 * IMPORTANT: Always call `clear()` after Promise.race() resolves to prevent
 * memory leaks from orphaned setTimeout handles.
 *
 * @example
 * ```typescript
 * const timeout = createTimeoutPromise(30000);
 * try {
 *   const result = await Promise.race([mainOperation(), timeout.promise]);
 *   return result;
 * } finally {
 *   timeout.clear(); // Prevent memory leak
 * }
 * ```
 *
 * @param timeoutMs - Timeout duration in milliseconds
 * @returns Object with promise and cleanup function
 */
export const createTimeoutPromise = (timeoutMs: number): TimeoutPromiseResult => {
  let timeoutId: ReturnType<typeof setTimeout>;

  const promise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Investigation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const clear = () => {
    clearTimeout(timeoutId);
  };

  return { promise, clear };
};

/**
 * Wraps an async operation with a timeout.
 * If the operation doesn't complete within the timeout, it throws an error.
 *
 * Use this to wrap individual tool calls to prevent slow API calls
 * from consuming the entire timeout budget.
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   () => fetchExternalAPI(),
 *   30000,
 *   'External API call'
 * );
 * ```
 *
 * @param operation - The async operation to execute
 * @param timeoutMs - Timeout duration in milliseconds
 * @param operationName - Name of the operation for error messages
 * @returns The result of the operation
 * @throws {Error} If the operation times out
 */
export const withTimeout = async <T>(operation: () => Promise<T>, timeoutMs: number, operationName = 'Operation'): Promise<T> => {
  const timeout = createTimeoutPromise(timeoutMs);
  try {
    return await Promise.race([
      operation(),
      timeout.promise.catch(() => {
        throw new Error(`${operationName} timed out after ${timeoutMs}ms`);
      })
    ]);
  } finally {
    timeout.clear();
  }
};
