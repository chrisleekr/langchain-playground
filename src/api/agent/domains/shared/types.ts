import type { Logger } from 'pino';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { createReactAgent } from '@langchain/langgraph/prebuilt';

/**
 * Type alias for a compiled domain agent returned by createReactAgent.
 * Used for type-safe agent arrays in the supervisor.
 *
 * @see https://langchain-ai.github.io/langgraphjs/agents/multi-agent/
 */
export type CompiledDomainAgent = ReturnType<typeof createReactAgent>;

/**
 * Common options for creating domain-specific agents and tools.
 *
 * API Compatibility Note (2025-12):
 * - For supervisor-based multi-agent architectures, domain agents use
 *   deprecated `createReactAgent` from `@langchain/langgraph/prebuilt`
 * - The newer `createAgent` from `langchain` is NOT compatible with
 *   `createSupervisor` due to state type mismatch (AgentGraph vs CompiledStateGraph)
 * - Continue using `createReactAgent` until the LangGraph ecosystem aligns these APIs
 */
export interface DomainAgentOptions {
  /** LLM model instance for agent reasoning */
  model: BaseChatModel;
  /** Logger instance for structured logging */
  logger: Logger;
  /**
   * Optional per-step timeout in milliseconds for external API calls.
   * Prevents slow external API calls from consuming the entire timeout budget.
   * Passed to tool factories for wrapping external calls with `withTimeout()`.
   */
  stepTimeoutMs?: number;
}

/**
 * Options for creating domain-specific tools.
 */
export interface DomainToolOptions {
  /** Logger instance for structured logging */
  logger: Logger;
  /**
   * Optional per-step timeout in milliseconds.
   * Prevents slow external API calls from consuming the entire timeout budget.
   * Use with `withTimeout()` utility to wrap external calls.
   */
  stepTimeoutMs?: number;
}

/**
 * Options for creating LLM-powered tools that require model inference.
 */
export interface LLMToolOptions extends DomainToolOptions {
  /** LLM model instance for tool inference */
  model: BaseChatModel;
}
