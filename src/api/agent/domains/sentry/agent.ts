import { createReactAgent } from '@langchain/langgraph/prebuilt';

import type { DomainAgentOptions } from '@/api/agent/domains/shared/types';
import { getSentrySystemPrompt } from './prompts';
import { createAllTools } from './tools';

/**
 * Creates a Sentry domain agent for investigating errors and crash reports.
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
