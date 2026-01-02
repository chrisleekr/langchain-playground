import type { LLMToolOptions } from '@/api/agent/domains/shared/types';
import { createGetInvestigationContextTool } from './getInvestigationContext';
import { createGenerateLogNRQLQueryTool } from './generateLogNRQLQuery';
import { createGenerateTraceLogsQueryTool } from './generateTraceLogsQuery';
import { createFetchAndAnalyzeLogsTool } from './fetchAndAnalyzeLogs';

/**
 * Creates all New Relic investigation tools for the agent.
 *
 * Tool categories:
 * 1. Context-fetching: Execute API calls without LLM inference
 * 2. Query generation: Use LLM to generate NRQL queries
 * 3. Fetch + Analyze: Combined tool that fetches logs and analyzes in one step
 *
 * The fetch_and_analyze_logs tool combines the previous fetch_and_process_logs
 * and analyze_logs tools, keeping raw log data internal to reduce token usage
 * when passing context to other domain agents.
 *
 * @param options - Tool options with logger, model, and optional step timeout
 * @returns Array of structured tools for New Relic investigation
 */
export const createAllTools = (options: LLMToolOptions) => {
  const { logger, model, stepTimeoutMs } = options;

  return [
    // Context-fetching: Execute API calls without LLM inference
    createGetInvestigationContextTool({ logger, stepTimeoutMs }),

    // Query generation: Use LLM to generate NRQL queries
    createGenerateLogNRQLQueryTool({ logger, model, stepTimeoutMs }),
    createGenerateTraceLogsQueryTool({ logger, model, stepTimeoutMs }),

    // Combined fetch + analyze: Keeps raw logs internal, returns only analysis
    // This reduces token usage when supervisor passes context to other agents
    createFetchAndAnalyzeLogsTool({ logger, model, stepTimeoutMs })
  ];
};
