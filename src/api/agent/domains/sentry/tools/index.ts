import type { Logger } from 'pino';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import { createInvestigateAndAnalyzeSentryIssueTool } from './investigateAndAnalyzeSentryIssue';

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
 *
 * Tools:
 * 1. investigate_and_analyze_sentry_issue - Combined data gathering AND analysis in one call
 *
 * The combined tool keeps raw Sentry API data internal and returns only the
 * analysis summary, reducing token usage when supervisor passes context to other agents.
 *
 * @param options - Factory options with logger and model
 * @returns Array of structured tools for Sentry investigation
 */
export const createAllTools = (options: SentryToolFactoryOptions) => {
  const { logger, model, stepTimeoutMs } = options;

  return [
    // Combined investigation + analysis tool
    // Keeps raw Sentry data internal, returns only analysis summary
    createInvestigateAndAnalyzeSentryIssueTool({ logger, model, stepTimeoutMs })
  ];
};
