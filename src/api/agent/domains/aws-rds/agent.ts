import { createReactAgent } from '@langchain/langgraph/prebuilt';

import type { DomainAgentOptions } from '@/api/agent/domains/shared/types';
import { createAllTools } from './tools';
import { getAwsRdsSystemPrompt } from './prompts';

/**
 * Creates an AWS RDS domain agent for investigating Aurora PostgreSQL database issues.
 *
 * This agent specializes in:
 * - RDS instance status and cluster membership
 * - CloudWatch metrics (CPU, Memory, Connections, IOPS, Latency, Deadlocks)
 * - Performance Insights Top SQL analysis
 * - Cluster-to-instance resolution for comprehensive investigation
 *
 * Uses `createReactAgent` from `@langchain/langgraph/prebuilt` for compatibility
 * with `createSupervisor` from `@langchain/langgraph-supervisor`.
 *
 * Note: The newer `createAgent` from `langchain` package returns `AgentGraph`
 * which is NOT compatible with `createSupervisor` (requires `CompiledStateGraph`).
 * Continue using `createReactAgent` until the LangGraph ecosystem aligns these APIs.
 *
 * @see https://github.com/langchain-ai/langgraphjs/tree/main/libs/langgraph-supervisor
 *
 * @param options - Agent configuration with model and logger
 * @returns A compiled ReAct agent for RDS investigations
 */
export const createAwsRdsAgent = (options: DomainAgentOptions) => {
  const { model, logger, stepTimeoutMs } = options;

  // Create all RDS investigation tools with optional step timeout
  const tools = createAllTools({ logger, model, stepTimeoutMs });

  logger.info({ toolCount: tools.length, stepTimeoutMs }, 'Creating AWS RDS agent with tools');

  // Using createReactAgent (deprecated but required for createSupervisor compatibility)
  // Use dynamic prompt to include current date
  return createReactAgent({
    llm: model,
    tools,
    name: 'aws_rds_expert',
    prompt: getAwsRdsSystemPrompt()
  });
};
