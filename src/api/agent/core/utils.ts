import type { Logger } from 'pino';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import { getChatOpenAI, getChatGroq, getChatOllama, getChatBedrockConverse } from '@/libraries/langchain/llm';
import type { AgentConfig } from './config';

/**
 * Custom error class for timeout operations.
 * Use `instanceof TimeoutError` to distinguish timeout errors from other errors.
 *
 * @example
 * ```typescript
 * try {
 *   await withTimeout(() => slowOperation(), 5000, 'Slow op');
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.log('Operation timed out:', error.timeoutMs);
 *   } else {
 *     console.log('Operation failed:', error);
 *   }
 * }
 * ```
 */
export class TimeoutError extends Error {
  /** The timeout duration that was exceeded */
  readonly timeoutMs: number;
  /** The name of the operation that timed out */
  readonly operationName: string;

  constructor(operationName: string, timeoutMs: number) {
    super(`${operationName} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    this.operationName = operationName;
    // Maintains proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

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
 * Creates a timeout promise that rejects with `TimeoutError` after the specified duration.
 * Used to prevent long-running agent investigations from blocking resources.
 *
 * IMPORTANT: Always call `clear()` after Promise.race() resolves to prevent
 * memory leaks from orphaned setTimeout handles.
 *
 * @example
 * ```typescript
 * const timeout = createTimeoutPromise(30000, 'Investigation');
 * try {
 *   const result = await Promise.race([mainOperation(), timeout.promise]);
 *   return result;
 * } finally {
 *   timeout.clear(); // Prevent memory leak
 * }
 * ```
 *
 * @param timeoutMs - Timeout duration in milliseconds
 * @param operationName - Name of the operation for error messages
 * @returns Object with promise (rejects with TimeoutError) and cleanup function
 */
export const createTimeoutPromise = (timeoutMs: number, operationName = 'Operation'): TimeoutPromiseResult => {
  let timeoutId: ReturnType<typeof setTimeout>;

  const promise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(operationName, timeoutMs));
    }, timeoutMs);
  });

  const clear = () => {
    clearTimeout(timeoutId);
  };

  return { promise, clear };
};

/**
 * Wraps an async operation with a timeout.
 * If the operation doesn't complete within the timeout, throws a `TimeoutError`.
 *
 * Use this to wrap individual tool calls to prevent slow API calls
 * from consuming the entire timeout budget.
 *
 * Error handling:
 * - Timeout: Throws `TimeoutError` (use `instanceof TimeoutError` to detect)
 * - Operation error: Original error propagates unchanged
 *
 * @example
 * ```typescript
 * try {
 *   const result = await withTimeout(
 *     () => fetchExternalAPI(),
 *     30000,
 *     'External API call'
 *   );
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     // Handle timeout specifically
 *   }
 *   throw error; // Re-throw operation errors
 * }
 * ```
 *
 * @param operation - The async operation to execute
 * @param timeoutMs - Timeout duration in milliseconds
 * @param operationName - Name of the operation for error messages
 * @returns The result of the operation
 * @throws {TimeoutError} If the operation times out
 * @throws {Error} If the operation itself throws an error (propagated unchanged)
 */
export const withTimeout = async <T>(operation: () => Promise<T>, timeoutMs: number, operationName = 'Operation'): Promise<T> => {
  const timeout = createTimeoutPromise(timeoutMs, operationName);
  try {
    return await Promise.race([operation(), timeout.promise]);
  } finally {
    timeout.clear();
  }
};
