import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { StructuredToolInterface } from '@langchain/core/tools';

import type { DomainAgentOptions } from '@/api/agent/domains/shared/types';
import { getResearchSystemPrompt } from './prompts';

/**
 * Options for creating the Research agent.
 * Extends base options with MCP tools.
 */
export interface ResearchAgentOptions extends DomainAgentOptions {
  /** MCP tools for web search, documentation, and Kubernetes */
  mcpTools: StructuredToolInterface[];
}

/**
 * Creates a Research domain agent with access to MCP tools.
 *
 * This agent provides:
 * - Web search via Brave Search MCP
 * - Documentation lookup via Context7 MCP
 * - Kubernetes cluster status via Kubernetes MCP
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
 * @param options - Agent configuration with model, logger, and MCP tools
 * @returns A compiled ReAct agent for research operations
 */
export const createResearchAgent = (options: ResearchAgentOptions) => {
  const { model, logger, mcpTools, stepTimeoutMs } = options;

  logger.info({ toolCount: mcpTools.length, stepTimeoutMs }, 'Creating Research agent with MCP tools');

  // Using createReactAgent (deprecated but required for createSupervisor compatibility)
  return createReactAgent({
    llm: model,
    tools: mcpTools,
    name: 'research_expert',
    prompt: getResearchSystemPrompt()
  });
};
