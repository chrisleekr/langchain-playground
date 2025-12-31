import type { Logger } from 'pino';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import { createGetSentryIssueTool } from './getSentryIssue';
import { createGetSentryEventsTool } from './getSentryEvents';
import { createAnalyzeSentryErrorTool } from './analyzeSentryError';

/**
 * Options for creating Sentry investigation tools.
 */
export interface SentryToolFactoryOptions {
  /** Logger instance for structured logging */
  logger: Logger;
  /** LLM model instance for analysis tools */
  model: BaseChatModel;
  /**
   * Optional per-step timeout in milliseconds for external API calls.
   * Prevents slow Sentry API calls from consuming the entire timeout budget.
   */
  stepTimeoutMs?: number;
}

/**
 * Creates all Sentry investigation tools for the domain agent.
 * Tools are divided into two categories:
 * 1. Data-fetching tools: Execute API calls without LLM inference
 * 2. LLM-powered tools: Use the model to analyze data
 *
 * @param options - Factory options with logger and model
 * @returns Array of structured tools for Sentry investigation
 */
export const createAllTools = (options: SentryToolFactoryOptions) => {
  const { logger, model, stepTimeoutMs } = options;

  return [
    // Data-fetching tools: Execute API calls without LLM inference
    createGetSentryIssueTool({ logger, stepTimeoutMs }),
    createGetSentryEventsTool({ logger, stepTimeoutMs }),

    // LLM-powered tools: Use the model to analyze error data
    createAnalyzeSentryErrorTool({ logger, model, stepTimeoutMs })
  ];
};
