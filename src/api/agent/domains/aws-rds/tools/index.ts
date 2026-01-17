import type { Logger } from 'pino';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import { createInvestigateAndAnalyzeRdsInstancesTool } from './investigateAndAnalyzeRdsInstances';

/**
 * Options for creating AWS RDS investigation tools.
 */
export interface AwsRdsToolFactoryOptions {
  /** Logger instance for structured logging */
  logger: Logger;
  /** LLM model instance for analysis tools */
  model: BaseChatModel;
  /**
   * Optional per-step timeout in milliseconds for external API calls.
   * Prevents slow AWS API calls from consuming the entire timeout budget.
   */
  stepTimeoutMs?: number;
}

/**
 * Creates all AWS RDS investigation tools for the domain agent.
 *
 * Tools:
 * 1. investigate_and_analyze_rds_instances - Combined data gathering AND analysis in one call
 *
 * The combined tool keeps raw AWS API data internal and returns only the
 * analysis summary, reducing token usage when supervisor passes context to other agents.
 *
 * @param options - Factory options with logger and model
 * @returns Array of structured tools for RDS investigation
 */
export const createAllTools = (options: AwsRdsToolFactoryOptions) => {
  const { logger, model, stepTimeoutMs } = options;

  return [
    // Combined investigation + analysis tool
    // Keeps raw AWS data internal, returns only analysis summary
    createInvestigateAndAnalyzeRdsInstancesTool({ logger, model, stepTimeoutMs })
  ];
};
