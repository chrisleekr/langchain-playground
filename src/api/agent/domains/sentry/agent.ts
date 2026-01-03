import { createReactAgent } from '@langchain/langgraph/prebuilt';

import type { DomainAgentOptions } from '@/api/agent/domains/shared/types';
import { getSentrySystemPrompt } from './prompts';
import { createAllTools } from './tools';

/**
 * Creates a Sentry domain agent for investigating errors and crash reports.
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
 * @returns A compiled ReAct agent for Sentry investigations
 */
export const createSentryAgent = (options: DomainAgentOptions) => {
  const { model, logger, stepTimeoutMs } = options;

  // Create all Sentry investigation tools with optional step timeout
  const tools = createAllTools({ logger, model, stepTimeoutMs });

  logger.info({ toolCount: tools.length, stepTimeoutMs }, 'Creating Sentry agent with tools');

  // Using createReactAgent (deprecated but required for createSupervisor compatibility)
  return createReactAgent({
    llm: model,
    tools,
    name: 'sentry_expert',
    prompt: getSentrySystemPrompt()
  });
};
