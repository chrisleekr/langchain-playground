import type { Logger } from 'pino';
import { HumanMessage } from '@langchain/core/messages';
import { GraphRecursionError } from '@langchain/langgraph';
import { randomUUID } from 'node:crypto';

import type { AgentConfig } from '@/api/agent/core/config';
import type { CostSummary, InvestigationSummary } from '@/api/agent/core/schema';
import { DEFAULT_AGENT_MAX_ITERATIONS, getModel, createTimeoutPromise, InvestigationSummarySchema } from '@/api/agent/core';
import { createInvestigationSupervisor } from '@/api/agent/supervisor';
import { CostTrackingCallbackHandler, ObservabilityCallbackHandler } from '@/api/agent/domains/shared/callbacks';
import { getMCPTools } from '@/libraries/mcp';

/**
 * Options for running an investigation.
 */
export interface InvestigateOptions {
  /** The investigation query */
  query: string;
  /** Agent configuration with limits and settings */
  config: AgentConfig;
  /** Logger instance for structured logging */
  logger: Logger;
  /** Optional: Enable New Relic agent (default: true) */
  enableNewRelic?: boolean;
  /** Optional: Enable Sentry agent (default: true) */
  enableSentry?: boolean;
  /** Optional: Enable Research agent with MCP tools (default: true) */
  enableResearch?: boolean;
}

/**
 * Result of an investigation.
 */
export interface InvestigateResult {
  /** The original query that was investigated */
  query: string;
  /** Raw summary of the investigation findings from the supervisor */
  rawSummary: string;
  /** Structured investigation summary for programmatic access */
  structuredSummary: InvestigationSummary;
  /** Number of messages in the conversation */
  messageCount: number;
  /** Duration of the investigation in milliseconds */
  durationMs: number;
  /** Optional cost summary for the investigation */
  costSummary?: CostSummary;
}

/**
 * Runs an investigation using the multi-agent supervisor architecture.
 *
 * This service encapsulates the investigation logic and can be called from:
 * - API endpoints (investigate.post.ts)
 * - CLI scripts (testAgent.ts)
 *
 * Architecture:
 * - Supervisor: Coordinates domain agents based on the investigation request
 * - New Relic Agent: Specializes in alerts, logs, and APM data
 * - Sentry Agent: Specializes in error tracking and crash reports
 *
 * Observability:
 * Uses LangChain callback handlers for monitoring and cost tracking:
 * - `ObservabilityCallbackHandler`: Logs model calls, tool executions, and durations
 * - `CostTrackingCallbackHandler`: Tracks token usage and calculates costs
 *
 * This approach works with the supervisor architecture since callbacks are passed through
 * the invoke config, unlike middleware which requires `createAgent` from the `langchain` package.
 *
 * @see https://langchain-ai.github.io/langgraphjs/agents/multi-agent/
 * @see https://js.langchain.com/docs/concepts/callbacks/
 *
 * @param options - Investigation options
 * @returns Investigation result with summary, message count, duration, and cost summary
 * @throws {Error} If investigation times out or fails
 */
export const investigate = async (options: InvestigateOptions): Promise<InvestigateResult> => {
  const { query, config, logger, enableNewRelic = true, enableSentry = true, enableResearch = true } = options;

  const startTime = Date.now();

  logger.info({ query: query.substring(0, 100), config }, 'Starting multi-agent investigation');

  // Initialize model based on provider
  const model = getModel(config, logger);

  // Load MCP tools for research agent if enabled
  let mcpTools: Awaited<ReturnType<typeof getMCPTools>> = [];
  if (enableResearch) {
    try {
      mcpTools = await getMCPTools(logger);
      logger.info({ mcpToolCount: mcpTools.length }, 'MCP tools loaded for research agent');
    } catch (err) {
      logger.warn({ err }, 'Failed to load MCP tools, research agent will be disabled');
    }
  }

  // Convert stepTimeoutSec to milliseconds for tool-level timeouts
  const stepTimeoutMs = config.stepTimeoutSec * 1000;

  // Create the investigation supervisor with domain agents
  const supervisor = createInvestigationSupervisor({
    model,
    logger,
    enableNewRelic,
    enableSentry,
    enableResearch,
    mcpTools,
    stepTimeoutMs
  });

  // Create callback handlers for observability and cost tracking
  const observabilityHandler = new ObservabilityCallbackHandler(logger, config);
  const costHandler = new CostTrackingCallbackHandler(logger, config);

  logger.info('Investigation supervisor created, starting investigation...');

  // Calculate recursion limit for multi-agent supervisor.
  //
  // LangGraph counts "supersteps" (node executions) toward the recursion limit.
  // The supervisor pattern requires enough budget for:
  //
  // 1. Per-agent budget: 2 * maxIterations + 4 supersteps per agent
  //    - ReAct pattern uses 2 supersteps per iteration (LLM call → tool execution)
  //    - Plus 4 supersteps for handoff overhead:
  //      * 1 for supervisor → agent handoff
  //      * 1 for agent → supervisor return
  //      * 2 for supervisor processing (routing decision + result handling)
  //    - With DEFAULT_AGENT_MAX_ITERATIONS=10: 2*10+4 = 24 supersteps per agent
  //
  // 2. Supervisor iterations: 2 * min(maxToolCalls, 10) supersteps
  //    - Supervisor rarely needs many iterations (just routing + synthesis)
  //    - Capped at 10 because supervisor delegates work, doesn't execute tools directly
  //    - 2x multiplier follows ReAct pattern (decision + handoff per iteration)
  //
  // 3. Buffer of 5 supersteps for edge cases:
  //    - Agent returning partial results requiring re-delegation
  //    - Error recovery paths that add extra supersteps
  //    - Synthesis requiring additional LLM calls
  //
  // Example with 3 agents: (3 * 24) + (2 * 10) + 5 = 97 supersteps
  //
  // @see https://langchain-ai.github.io/langgraph/concepts/low_level/#recursion-limit
  const enabledAgentCount = [enableNewRelic, enableSentry, enableResearch && mcpTools.length > 0].filter(Boolean).length;
  const agentOverhead = enabledAgentCount * (2 * DEFAULT_AGENT_MAX_ITERATIONS + 4);
  const supervisorIterations = 2 * Math.min(config.maxToolCalls, 10);
  const buffer = 5;
  const recursionLimit = config.recursionLimit ?? agentOverhead + supervisorIterations + buffer;

  // Generate unique thread ID for checkpointer
  // Each investigation gets its own conversation thread
  const threadId = randomUUID();

  // Create timeout with cleanup to prevent memory leaks
  const timeout = createTimeoutPromise(config.timeoutMs);

  logger.debug({ recursionLimit, threadId, enabledAgentCount }, 'Invoking supervisor');

  // Execute supervisor with timeout protection, recursion limit, and callback handlers
  let result;
  try {
    result = await Promise.race([
      supervisor.invoke(
        { messages: [new HumanMessage(query)] },
        {
          callbacks: [observabilityHandler, costHandler],
          recursionLimit,
          // Thread ID for checkpointer state persistence
          configurable: { thread_id: threadId }
        }
      ),
      timeout.promise
    ]);
  } catch (error) {
    if (error instanceof GraphRecursionError) {
      logger.warn({ recursionLimit }, 'Investigation stopped due to recursion limit');
      throw new Error(`Investigation exceeded maximum iterations (${recursionLimit}). Consider increasing recursionLimit.`);
    }
    throw error;
  } finally {
    // Always clear timeout to prevent memory leaks
    timeout.clear();
  }

  // Extract the final response from the supervisor
  const messages = result.messages ?? [];
  if (messages.length === 0) {
    throw new Error('Investigation supervisor returned no messages');
  }

  const lastMessage = messages[messages.length - 1];
  const rawSummary = typeof lastMessage?.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage?.content ?? 'No content available');

  // Get structured summary from responseFormat (set in supervisor configuration)
  // The supervisor automatically extracts structured output after the agent loop
  // @see https://langchain-ai.github.io/langgraphjs/agents/structured-output/
  let structuredSummary: InvestigationSummary;

  // When responseFormat is configured, the result includes structuredResponse
  // Cast to access this field since TypeScript types may not include it
  const resultWithStructured = result as typeof result & { structuredResponse?: unknown };

  if (resultWithStructured.structuredResponse) {
    // Validate the structured response against the schema
    structuredSummary = InvestigationSummarySchema.parse(resultWithStructured.structuredResponse);
    logger.info('Structured summary extracted via responseFormat');
  } else {
    // Fallback: parse from raw summary if structuredResponse is not available
    logger.warn('No structuredResponse in result, using raw summary fallback');

    const MAX_FALLBACK_LENGTH = 1000;
    const truncated = rawSummary.length > MAX_FALLBACK_LENGTH;

    if (truncated) {
      logger.warn(
        { originalLength: rawSummary.length, truncatedTo: MAX_FALLBACK_LENGTH },
        'Raw summary truncated for structured fallback (full content in rawSummary)'
      );
    }

    structuredSummary = {
      summary: truncated ? `${rawSummary.substring(0, MAX_FALLBACK_LENGTH - 3)}...` : rawSummary
    };
  }

  const durationMs = Date.now() - startTime;

  // Get cost summary from the callback handler
  const costSummary = costHandler.getSummary();

  logger.info(
    {
      query: query.substring(0, 50),
      summary: structuredSummary.summary,
      messageCount: messages.length,
      durationMs,
      totalCost: costSummary.totalCost.toFixed(6),
      totalTokens: costSummary.totalTokens
    },
    'Investigation complete with structured summary'
  );

  return {
    query,
    rawSummary,
    structuredSummary,
    messageCount: messages.length,
    durationMs,
    costSummary
  };
};
