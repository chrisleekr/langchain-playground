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
 * Why `createReactAgent` instead of `createAgent`:
 * - `createReactAgent` is marked deprecated in favor of `createAgent` from `langchain`
 * - However, `createAgent.graph` (AgentGraph) is NOT compatible with `createSupervisor`
 *   which requires `CompiledStateGraph` with specific state annotations
 * - The LangGraph ecosystem hasn't yet aligned these APIs for multi-agent patterns
 * - Continue using `createReactAgent` until `@langchain/langgraph-supervisor` is updated
 *
 * Tested: 2025-12 - Migration to `createAgent` fails with state type incompatibility
 *
 * @see https://langchain-ai.github.io/langgraphjs/agents/multi-agent/
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
