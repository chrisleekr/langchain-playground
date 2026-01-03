import { createReactAgent } from '@langchain/langgraph/prebuilt';

import type { DomainAgentOptions } from '@/api/agent/domains/shared/types';
import { createAllTools } from './tools';
import { getAwsEcsSystemPrompt } from './prompts';

/**
 * Creates an AWS ECS domain agent for investigating container and task issues.
 *
 * This agent specializes in:
 * - ECS task status and container health
 * - CloudWatch Container Insights metrics
 * - Service deployment events
 * - Historical task event lookup
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
 * @returns A compiled ReAct agent for ECS investigations
 */
export const createAwsEcsAgent = (options: DomainAgentOptions) => {
  const { model, logger, stepTimeoutMs } = options;

  // Create all ECS investigation tools with optional step timeout
  const tools = createAllTools({ logger, model, stepTimeoutMs });

  logger.info({ toolCount: tools.length, stepTimeoutMs }, 'Creating AWS ECS agent with tools');

  // Using createReactAgent (deprecated but required for createSupervisor compatibility)
  // Use dynamic prompt to include current date
  return createReactAgent({
    llm: model,
    tools,
    name: 'aws_ecs_expert',
    prompt: getAwsEcsSystemPrompt()
  });
};
