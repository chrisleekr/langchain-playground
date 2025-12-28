import type { Logger } from 'pino';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import { createGetInvestigationContextTool } from './getInvestigationContext';
import { createFetchAndProcessLogsTool } from './fetchAndProcessLogs';
import { createGenerateLogNRQLQueryTool } from './generateLogNRQLQuery';
import { createGenerateTraceLogsQueryTool } from './generateTraceLogsQuery';
import { createAnalyzeLogsTool } from './analyzeLogs';

/**
 * Options for creating New Relic investigation tools.
 */
export interface ToolFactoryOptions {
  /** Logger instance for structured logging */
  logger: Logger;
  /** LLM model instance for inference-based tools */
  model: BaseChatModel;
}

/**
 * Creates all New Relic investigation tools for the agent.
 * Tools are divided into two categories:
 * 1. Data-fetching tools: Execute API calls without LLM inference
 * 2. LLM-powered tools: Use the model to generate queries or analyze data
 *
 * @param options - Factory options with logger and model
 * @returns Array of structured tools for New Relic investigation
 */
export const createAllTools = (options: ToolFactoryOptions) => {
  const { logger, model } = options;

  return [
    // Data-fetching tools: Execute API calls without LLM inference,
    // keeping token costs low for data retrieval operations
    createGetInvestigationContextTool({ logger }),
    createFetchAndProcessLogsTool({ logger }),

    // LLM-powered tools: Use the model to generate queries or analyze data,
    // requiring the model instance for inference
    createGenerateLogNRQLQueryTool({ logger, model }),
    createGenerateTraceLogsQueryTool({ logger, model }),
    createAnalyzeLogsTool({ logger, model })
  ];
};

export type { ToolOptions, LLMToolOptions } from './types';
