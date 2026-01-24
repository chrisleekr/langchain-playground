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
 * Safely handles Error objects, strings, objects with message property, and other types.
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
  // Handle objects with a message property (e.g., AWS SDK errors that might not be Error instances)
  if (error !== null && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  // Try to stringify the error for debugging
  try {
    const stringified = JSON.stringify(error);
    if (stringified !== '{}') {
      return `Unknown error: ${stringified}`;
    }
  } catch {
    // JSON.stringify failed, fall through
  }
  return 'Unknown error occurred';
};

/**
 * Get the appropriate chat model based on the agent configuration.
 * Uses the provider specified in config.
 *
 * **Note**: Temperature and maxTokens are read from the global config for each
 * provider (e.g., `openai.temperature`, `groq.temperature`). The AgentConfig's
 * temperature/maxTokens fields are ignored because the LLM instances are singletons.
 *
 * @param config - The agent configuration containing provider selection
 * @param logger - Logger instance for debugging
 * @returns A configured BaseChatModel instance (singleton)
 * @throws {Error} If the provider is not supported
 */
export const getModel = (config: AgentConfig, logger: Logger): BaseChatModel => {
  switch (config.provider) {
    case 'openai':
      return getChatOpenAI(logger);
    case 'groq':
      return getChatGroq(logger);
    case 'ollama':
      return getChatOllama(logger);
    case 'bedrock':
      return getChatBedrockConverse(logger);
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

/**
 * Wraps an async operation with a timeout and AbortController support.
 *
 * Unlike `withTimeout`, this version:
 * 1. Creates an AbortController and passes its signal to the operation
 * 2. Aborts the operation when timeout occurs (for supported APIs like AWS SDK)
 *
 * Use this when the underlying operation supports AbortController
 * (e.g., fetch, AWS SDK v3 commands).
 *
 * @see https://aws.amazon.com/blogs/developer/abortcontroller-in-modular-aws-sdk-for-javascript/
 *
 * @example
 * ```typescript
 * const result = await withTimeoutAbortable(
 *   (signal) => queryRdsCloudWatchMetrics({ ...params, abortSignal: signal }, logger),
 *   30000,
 *   'AWS API call'
 * );
 * ```
 *
 * @param operation - The async operation that accepts an AbortSignal
 * @param timeoutMs - Timeout duration in milliseconds
 * @param operationName - Name of the operation for error messages
 * @returns The result of the operation
 * @throws {TimeoutError} If the operation times out
 * @throws {Error} If the operation itself throws an error (propagated unchanged)
 */
export const withTimeoutAbortable = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  operationName = 'Operation'
): Promise<T> => {
  const controller = new AbortController();
  const timeout = createTimeoutPromise(timeoutMs, operationName);

  try {
    return await Promise.race([operation(controller.signal), timeout.promise]);
  } finally {
    // Abort any in-flight request and clear the timeout
    controller.abort();
    timeout.clear();
  }
};

/**
 * Format bytes to human-readable string.
 *
 * @param bytes - Number of bytes (returns undefined if bytes is undefined, negative, NaN, or Infinity)
 * @returns Formatted string (e.g., "1.50 GB", "256.00 MB", "512.00 KB"), or undefined for invalid input
 */
export const formatBytes = (bytes: number | undefined): string | undefined => {
  if (bytes === undefined) return undefined;
  if (!Number.isFinite(bytes) || bytes < 0) return undefined;

  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(2)} KB`;
};

/**
 * Formatted metric pair result for LLM consumption.
 */
export interface MetricPairResult {
  [key: string]: string;
}

/**
 * Format result for a metric pair (avg/max or avg/min).
 *
 * Returns null if both values are undefined, avoiding objects with undefined properties
 * that could confuse LLM analysis.
 *
 * @param primary - Primary value (usually average)
 * @param secondary - Secondary value (usually max or min)
 * @param decimals - Number of decimal places (default: 2)
 * @param primaryKey - Key for primary value (default: 'avg')
 * @param secondaryKey - Key for secondary value (default: 'max')
 * @returns Formatted object or null
 */
export const formatMetricPair = (
  primary: number | undefined,
  secondary: number | undefined,
  decimals: number = 2,
  primaryKey: string = 'avg',
  secondaryKey: string = 'max'
): MetricPairResult | null => {
  if (primary === undefined && secondary === undefined) {
    return null;
  }
  const result: MetricPairResult = {};
  result[primaryKey] = primary !== undefined ? primary.toFixed(decimals) : 'N/A';
  result[secondaryKey] = secondary !== undefined ? secondary.toFixed(decimals) : 'N/A';
  return result;
};

/**
 * Format a metric pair with byte formatting.
 *
 * @param primary - Primary value in bytes
 * @param secondary - Secondary value in bytes
 * @param primaryKey - Key for primary value (default: 'avg')
 * @param secondaryKey - Key for secondary value (default: 'max')
 * @returns Formatted object or null
 */
export const formatBytesMetricPair = (
  primary: number | undefined,
  secondary: number | undefined,
  primaryKey: string = 'avg',
  secondaryKey: string = 'max'
): MetricPairResult | null => {
  if (primary === undefined && secondary === undefined) {
    return null;
  }
  const result: MetricPairResult = {};
  result[primaryKey] = formatBytes(primary) ?? 'N/A';
  result[secondaryKey] = formatBytes(secondary) ?? 'N/A';
  return result;
};

/**
 * Format latency metrics, converting from seconds to milliseconds.
 *
 * @param avgSeconds - Average latency in seconds
 * @param maxSeconds - Maximum latency in seconds
 * @returns Formatted object or null
 */
export const formatLatencyMs = (avgSeconds: number | undefined, maxSeconds: number | undefined): MetricPairResult | null => {
  if (avgSeconds === undefined && maxSeconds === undefined) {
    return null;
  }
  return {
    avg: avgSeconds !== undefined ? (avgSeconds * 1000).toFixed(2) : 'N/A',
    max: maxSeconds !== undefined ? (maxSeconds * 1000).toFixed(2) : 'N/A'
  };
};
