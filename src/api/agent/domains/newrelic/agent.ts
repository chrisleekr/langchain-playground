import { createReactAgent } from '@langchain/langgraph/prebuilt';

import type { DomainAgentOptions } from '@/api/agent/domains/shared/types';
import { createAllTools } from './tools';
import { newRelicSystemPrompt } from './prompts';

/**
 * Creates a New Relic domain agent for investigating alerts, logs, and APM data.
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
 * @returns A compiled ReAct agent for New Relic investigations
 */
export const createNewRelicAgent = (options: DomainAgentOptions) => {
  const { model, logger, stepTimeoutMs } = options;

  // Create all New Relic investigation tools with optional step timeout
  const tools = createAllTools({ logger, model, stepTimeoutMs });

  logger.info({ toolCount: tools.length, stepTimeoutMs }, 'Creating New Relic agent with tools');

  // Using createReactAgent (deprecated but required for createSupervisor compatibility)
  return createReactAgent({
    llm: model,
    tools,
    name: 'newrelic_expert',
    prompt: newRelicSystemPrompt
  });
};
