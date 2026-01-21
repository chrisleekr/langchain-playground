import type { Logger } from 'pino';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { MemorySaver } from '@langchain/langgraph';
import { createSupervisor } from '@langchain/langgraph-supervisor';

import {
  createNewRelicAgent,
  createSentryAgent,
  createResearchAgent,
  createAwsEcsAgent,
  createAwsRdsAgent,
  createCodeResearchAgent,
  filterChunkhoundTools,
  type CompiledDomainAgent
} from '@/api/agent/domains';
import { DEFAULT_AGENT_MAX_ITERATIONS, InvestigationSummarySchema } from '@/api/agent/core';
import { supervisorSystemPrompt } from './prompts';

/**
 * Options for creating the investigation supervisor.
 */
export interface InvestigationSupervisorOptions {
  /** LLM model instance for the supervisor */
  model: BaseChatModel;
  /** Logger instance for structured logging */
  logger: Logger;
  /** Optional: Enable New Relic agent (default: true) */
  enableNewRelic?: boolean;
  /** Optional: Enable Sentry agent (default: true) */
  enableSentry?: boolean;
  /** Optional: Enable Research agent with MCP tools (default: true) */
  enableResearch?: boolean;
  /** Optional: Enable AWS ECS agent (default: true) */
  enableAwsEcs?: boolean;
  /** Optional: Enable AWS RDS agent (default: true) */
  enableAwsRds?: boolean;
  /**
   * Optional: Enable Code Research agent with ChunkHound MCP tools (default: true)
   * Requires ChunkHound MCP server to be running and chunkhound.enabled=true in config
   * @see https://chunkhound.github.io/
   */
  enableCodeResearch?: boolean;
  /** MCP tools for the research agent (required if enableResearch is true) */
  mcpTools?: StructuredToolInterface[];
  /** Max iterations per domain agent (default: 10) */
  maxAgentIterations?: number;
  /**
   * Per-step timeout in milliseconds for external API calls.
   * Prevents slow external API calls from consuming the entire timeout budget.
   */
  stepTimeoutMs?: number;
}

/**
 * Creates an investigation supervisor that coordinates domain-specific agents.
 *
 * The supervisor uses LangGraph's supervisor pattern to:
 * 1. Receive investigation requests
 * 2. Delegate to appropriate domain agents (New Relic, Sentry, etc.)
 * 3. Synthesize findings from multiple agents
 * 4. Return a unified investigation report
 *
 * API Compatibility Note (2025-12):
 * - Domain agents use deprecated `createReactAgent` from `@langchain/langgraph/prebuilt`
 * - The newer `createAgent` from `langchain` package returns `AgentGraph` which is
 *   NOT compatible with `createSupervisor` (requires `CompiledStateGraph`)
 * - State type mismatch: AgentGraph uses `BaseMessage[]` vs CompiledStateGraph's
 *   `BinaryOperatorAggregate<BaseMessage[], Messages>`
 * - Continue using `createReactAgent` until LangGraph ecosystem aligns these APIs
 *
 * @see https://docs.langchain.com/oss/javascript/langgraph/overview
 * @see https://github.com/langchain-ai/langgraphjs/tree/main/libs/langgraph-supervisor
 *
 * @param options - Configuration options for the supervisor
 * @returns A compiled LangGraph workflow for investigation
 */
export const createInvestigationSupervisor = (options: InvestigationSupervisorOptions) => {
  const {
    model,
    logger,
    enableNewRelic = true,
    enableSentry = true,
    enableResearch = true,
    enableAwsEcs = true,
    enableAwsRds = true,
    enableCodeResearch = true,
    mcpTools = [],
    maxAgentIterations = DEFAULT_AGENT_MAX_ITERATIONS,
    stepTimeoutMs
  } = options;

  // Calculate per-agent recursion limit based on ReAct pattern
  // Each iteration = 2 supersteps (model + tool), plus 1 for final response
  const agentRecursionLimit = 2 * maxAgentIterations + 1;

  // Create domain-specific agents with bounded loop protection
  const agents: CompiledDomainAgent[] = [];

  if (enableNewRelic) {
    logger.info({ maxIterations: maxAgentIterations, stepTimeoutMs }, 'Creating New Relic agent');
    const newRelicAgent = createNewRelicAgent({ model, logger, stepTimeoutMs }).withConfig({
      recursionLimit: agentRecursionLimit
    });
    agents.push(newRelicAgent);
  }

  if (enableSentry) {
    logger.info({ maxIterations: maxAgentIterations, stepTimeoutMs }, 'Creating Sentry agent');
    const sentryAgent = createSentryAgent({ model, logger, stepTimeoutMs }).withConfig({
      recursionLimit: agentRecursionLimit
    });
    agents.push(sentryAgent);
  }

  if (enableResearch && mcpTools.length > 0) {
    logger.info({ mcpToolCount: mcpTools.length, maxIterations: maxAgentIterations, stepTimeoutMs }, 'Creating Research agent with MCP tools');
    const researchAgent = createResearchAgent({ model, logger, mcpTools, stepTimeoutMs }).withConfig({
      recursionLimit: agentRecursionLimit
    });
    agents.push(researchAgent);
  } else if (enableResearch && mcpTools.length === 0) {
    logger.warn('Research agent skipped: no MCP tools provided');
  }

  if (enableAwsEcs) {
    logger.info({ maxIterations: maxAgentIterations, stepTimeoutMs }, 'Creating AWS ECS agent');
    const awsEcsAgent = createAwsEcsAgent({ model, logger, stepTimeoutMs }).withConfig({
      recursionLimit: agentRecursionLimit
    });
    agents.push(awsEcsAgent);
  }

  if (enableAwsRds) {
    logger.info({ maxIterations: maxAgentIterations, stepTimeoutMs }, 'Creating AWS RDS agent');
    const awsRdsAgent = createAwsRdsAgent({ model, logger, stepTimeoutMs }).withConfig({
      recursionLimit: agentRecursionLimit
    });
    agents.push(awsRdsAgent);
  }

  // Code Research agent uses ChunkHound MCP tools (filtered from all MCP tools)
  if (enableCodeResearch && mcpTools.length > 0) {
    const chunkhoundTools = filterChunkhoundTools(mcpTools);
    if (chunkhoundTools.length > 0) {
      logger.info(
        { chunkhoundToolCount: chunkhoundTools.length, maxIterations: maxAgentIterations, stepTimeoutMs },
        'Creating Code Research agent with ChunkHound tools'
      );
      const codeResearchAgent = createCodeResearchAgent({
        model,
        logger,
        chunkhoundTools,
        stepTimeoutMs
      }).withConfig({
        recursionLimit: agentRecursionLimit
      });
      agents.push(codeResearchAgent);
    } else {
      logger.info('Code Research agent skipped: no ChunkHound tools found in MCP tools');
    }
  } else if (enableCodeResearch && mcpTools.length === 0) {
    logger.info('Code Research agent skipped: no MCP tools provided');
  }

  if (agents.length === 0) {
    throw new Error('At least one domain agent must be enabled');
  }

  logger.info({ agentCount: agents.length, agentRecursionLimit }, 'Creating investigation supervisor');

  // Create the supervisor workflow with explicit configuration
  const supervisor = createSupervisor({
    agents,
    llm: model,
    prompt: supervisorSystemPrompt,
    // Not gonna use `full_history` to include full agent message history for better context synthesis because it's too costly.
    // Instead, I'll use `last_message` to include only the last message from each agent.
    outputMode: 'last_message',
    // Omit handoff messages for cleaner conversation history
    addHandoffBackMessages: false,
    // Structured output format for the final investigation summary
    // This ensures the supervisor returns a consistent response format
    // @see https://docs.langchain.com/oss/javascript/langchain/structured-output
    responseFormat: InvestigationSummarySchema
  });

  // Compile with in-memory checkpointer for state persistence
  // @see https://docs.langchain.com/oss/javascript/langgraph/persistence
  const checkpointer = new MemorySaver();
  return supervisor.compile({ checkpointer });
};
