import { createReactAgent } from '@langchain/langgraph/prebuilt';
import type { StructuredToolInterface } from '@langchain/core/tools';

import type { DomainAgentOptions } from '@/api/agent/domains/shared/types';
import { getCodeResearchSystemPrompt } from './prompts';

/**
 * Options for creating the Code Research agent.
 * Extends base options with ChunkHound MCP tools.
 */
export interface CodeResearchAgentOptions extends DomainAgentOptions {
  /** ChunkHound MCP tools for code search and research */
  chunkhoundTools: StructuredToolInterface[];
}

/**
 * Creates a Code Research domain agent with access to ChunkHound MCP tools.
 *
 * This agent provides:
 * - Semantic code search via ChunkHound
 * - Regex-based pattern matching for exact symbol lookups
 * - Deep multi-file architecture analysis
 *
 * Uses `createReactAgent` from `@langchain/langgraph/prebuilt` for compatibility
 * with `createSupervisor` from `@langchain/langgraph-supervisor`.
 *
 * Note: The newer `createAgent` from `langchain` package returns `AgentGraph`
 * which is NOT compatible with `createSupervisor` (requires `CompiledStateGraph`).
 * Continue using `createReactAgent` until the LangGraph ecosystem aligns these APIs.
 *
 * @see https://github.com/langchain-ai/langgraphjs/tree/main/libs/langgraph-supervisor
 * @see https://chunkhound.github.io/
 *
 * @param options - Agent configuration with model, logger, and ChunkHound tools
 * @returns A compiled ReAct agent for code research operations
 */
export const createCodeResearchAgent = (options: CodeResearchAgentOptions) => {
  const { model, logger, chunkhoundTools, stepTimeoutMs } = options;

  logger.info({ toolCount: chunkhoundTools.length, stepTimeoutMs }, 'Creating Code Research agent with ChunkHound tools');

  // Using createReactAgent (deprecated but required for createSupervisor compatibility)
  return createReactAgent({
    llm: model,
    tools: chunkhoundTools,
    name: 'code_research_expert',
    prompt: getCodeResearchSystemPrompt()
  });
};

/**
 * Filters MCP tools to only include ChunkHound tools.
 * ChunkHound tools are prefixed with 'mcp__chunkhound__' (double underscores).
 *
 * The MCP client uses the naming pattern: mcp__<serverName>__<toolName>
 * due to MultiServerMCPClient configuration with prefixToolNameWithServerName
 * and additionalToolNamePrefix options.
 *
 * @param allMcpTools - All MCP tools from the client
 * @returns Only ChunkHound-specific tools
 */
export const filterChunkhoundTools = (allMcpTools: StructuredToolInterface[]): StructuredToolInterface[] => {
  return allMcpTools.filter(tool => tool.name.startsWith('mcp__chunkhound__'));
};
