import { createReactAgent } from '@langchain/langgraph/prebuilt';

import type { DomainAgentOptions } from '@/api/agent/domains/shared/types';
import { createAllTools } from './tools';
import { getNewRelicSystemPrompt } from './prompts';

/**
 * Creates a New Relic domain agent for investigating alerts, logs, and APM data.
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
 * @returns A compiled ReAct agent for New Relic investigations
 */
export const createNewRelicAgent = (options: DomainAgentOptions) => {
  const { model, logger, stepTimeoutMs } = options;

  // Create all New Relic investigation tools with optional step timeout
  const tools = createAllTools({ logger, model, stepTimeoutMs });

  logger.info({ toolCount: tools.length, stepTimeoutMs }, 'Creating New Relic agent with tools');

  // Using createReactAgent (deprecated but required for createSupervisor compatibility)
  // Use dynamic prompt to include current date
  return createReactAgent({
    llm: model,
    tools,
    name: 'newrelic_expert',
    prompt: getNewRelicSystemPrompt()
  });
};
