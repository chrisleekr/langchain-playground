import type { Logger } from 'pino';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import { createInvestigateAndAnalyzeEcsTasksTool } from './investigateAndAnalyzeEcsTasks';

/**
 * Options for creating AWS ECS investigation tools.
 */
export interface AwsEcsToolFactoryOptions {
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
 * Creates all AWS ECS investigation tools for the domain agent.
 *
 * Tools:
 * 1. investigate_and_analyze_ecs_tasks - Combined data gathering AND analysis in one call
 *
 * The combined tool keeps raw AWS API data internal and returns only the
 * analysis summary, reducing token usage when supervisor passes context to other agents.
 *
 * Note: ARN parsing is NOT a tool - it's done at the supervisor level
 * before handing off to this agent.
 *
 * @param options - Factory options with logger and model
 * @returns Array of structured tools for ECS investigation
 */
export const createAllTools = (options: AwsEcsToolFactoryOptions) => {
  const { logger, model, stepTimeoutMs } = options;

  return [
    // Combined investigation + analysis tool
    // Keeps raw AWS data internal, returns only analysis summary
    createInvestigateAndAnalyzeEcsTasksTool({ logger, model, stepTimeoutMs })
  ];
};
