import type { LLMToolOptions } from '@/api/agent/domains/shared/types';
import { createGetInvestigationContextTool } from './getInvestigationContext';
import { createFetchAndProcessLogsTool } from './fetchAndProcessLogs';
import { createGenerateLogNRQLQueryTool } from './generateLogNRQLQuery';
import { createGenerateTraceLogsQueryTool } from './generateTraceLogsQuery';
import { createAnalyzeLogsTool } from './analyzeLogs';

/**
 * Creates all New Relic investigation tools for the agent.
 * Tools are divided into two categories:
 * 1. Data-fetching tools: Execute API calls without LLM inference
 * 2. LLM-powered tools: Use the model to generate queries or analyze data
 *
 * @param options - Tool options with logger, model, and optional step timeout
 * @returns Array of structured tools for New Relic investigation
 */
export const createAllTools = (options: LLMToolOptions) => {
  const { logger, model, stepTimeoutMs } = options;

  return [
    // Data-fetching tools: Execute API calls without LLM inference,
    // keeping token costs low for data retrieval operations
    createGetInvestigationContextTool({ logger, stepTimeoutMs }),
    createFetchAndProcessLogsTool({ logger, stepTimeoutMs }),

    // LLM-powered tools: Use the model to generate queries or analyze data,
    // requiring the model instance for inference
    createGenerateLogNRQLQueryTool({ logger, model, stepTimeoutMs }),
    createGenerateTraceLogsQueryTool({ logger, model, stepTimeoutMs }),
    createAnalyzeLogsTool({ logger, model, stepTimeoutMs })
  ];
};
