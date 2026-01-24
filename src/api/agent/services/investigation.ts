import type { Logger } from 'pino';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage } from '@langchain/core/messages';
import { GraphRecursionError } from '@langchain/langgraph';
import { randomUUID } from 'node:crypto';

import type { AgentConfig } from '@/api/agent/core/config';
import type { InvestigationSummary, InvestigationTrace } from '@/api/agent/core/schema';
import { DEFAULT_AGENT_MAX_ITERATIONS, getModel, createTimeoutPromise, InvestigationSummarySchema } from '@/api/agent/core';
import { createInvestigationSupervisor } from '@/api/agent/supervisor';
import { ObservabilityHandler } from '@/api/agent/domains/shared/callbacks';
import { getMCPTools } from '@/libraries/mcp';

/**
 * Agent name to summary field mapping.
 * Used to extract raw agent outputs from conversation history.
 */
const AGENT_NAME_TO_FIELD: Record<string, keyof AgentOutputs> = {
  aws_rds_expert: 'rdsSummary',
  aws_ecs_expert: 'ecsSummary',
  newrelic_expert: 'newRelicSummary',
  sentry_expert: 'sentrySummary',
  research_expert: 'researchSummary'
};

/**
 * Raw outputs extracted from agent messages.
 */
interface AgentOutputs {
  rdsSummary?: string;
  ecsSummary?: string;
  newRelicSummary?: string;
  sentrySummary?: string;
  researchSummary?: string;
}

/**
 * Extracts raw agent outputs from conversation history.
 *
 * The supervisor stores agent responses in the message history. By extracting
 * these directly, we preserve the full detailed output instead of using the
 * supervisor's re-summarized version.
 *
 * @param messages - Conversation history from supervisor
 * @param logger - Logger instance for debugging
 * @returns Raw outputs from each agent
 */
const extractAgentOutputs = (messages: BaseMessage[], logger: Logger): AgentOutputs => {
  const outputs: AgentOutputs = {};

  for (const message of messages) {
    // Agent messages have a 'name' field identifying the source
    const name = (message as { name?: string }).name;
    if (!name) continue;

    if (!Object.hasOwn(AGENT_NAME_TO_FIELD, name)) continue;
    // eslint-disable-next-line security/detect-object-injection -- Validated with Object.hasOwn above
    const field = AGENT_NAME_TO_FIELD[name];

    const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

    // Store the agent's raw output (last message from each agent wins)
    // eslint-disable-next-line security/detect-object-injection -- Field validated from constant lookup
    outputs[field] = content;
    logger.debug({ agent: name, contentLength: content.length }, 'Extracted agent output');
  }

  return outputs;
};

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
  /** Optional: Enable AWS ECS agent (default: true) */
  enableAwsEcs?: boolean;
  /** Optional: Enable AWS RDS agent (default: true) */
  enableAwsRds?: boolean;
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
  /** Tracing timeline with LLM calls, tool executions, and cost data */
  trace: InvestigationTrace;
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
 * Uses `ObservabilityHandler` for tracing and cost tracking:
 * - Tracks LLM calls with duration, tokens, cost, and agent context
 * - Tracks tool executions with duration, success/failure, and agent context
 * - Produces a chronological trace timeline for debugging
 *
 * This approach works with the supervisor architecture since callbacks are passed through
 * the invoke config, unlike middleware which requires `createAgent` from the `langchain` package.
 *
 * @see https://github.com/langchain-ai/langgraphjs/tree/main/libs/langgraph-supervisor
 * @see https://docs.langchain.com/oss/javascript/langchain/observability
 *
 * @param options - Investigation options
 * @returns Investigation result with summary, message count, duration, and trace
 * @throws {Error} If investigation times out or fails
 */
export const investigate = async (options: InvestigateOptions): Promise<InvestigateResult> => {
  const {
    query,
    config,
    logger,
    enableNewRelic = true,
    enableSentry = true,
    enableResearch = true,
    enableAwsEcs = true,
    enableAwsRds = true
  } = options;

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
    enableAwsEcs,
    enableAwsRds,
    mcpTools,
    stepTimeoutMs
  });

  // Create unified observability handler for tracing and cost tracking
  const tracer = new ObservabilityHandler(logger, config);

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
  // @see https://docs.langchain.com/oss/javascript/langgraph/graph-api#recursion-limit
  const enabledAgentCount = [enableNewRelic, enableSentry, enableResearch && mcpTools.length > 0, enableAwsEcs, enableAwsRds].filter(Boolean).length;
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
          callbacks: [tracer],
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

  // Extract raw agent outputs from conversation history.
  // This preserves the full detailed output from each agent instead of using
  // the supervisor's re-summarized version (which loses detail).
  const agentOutputs = extractAgentOutputs(messages, logger);
  logger.info(
    {
      extractedAgents: Object.keys(agentOutputs).length,
      agents: Object.keys(agentOutputs)
    },
    'Agent outputs extracted from message history'
  );

  // Get structured summary from responseFormat (set in supervisor configuration)
  // The supervisor automatically extracts structured output after the agent loop
  // @see https://docs.langchain.com/oss/javascript/langchain/structured-output
  let structuredSummary: InvestigationSummary;

  // When responseFormat is configured, the result includes structuredResponse
  // Cast to access this field since TypeScript types may not include it
  const resultWithStructured = result as typeof result & { structuredResponse?: unknown };

  if (resultWithStructured.structuredResponse) {
    // Validate the structured response against the schema
    const supervisorSummary = InvestigationSummarySchema.parse(resultWithStructured.structuredResponse);
    logger.info('Structured summary extracted via responseFormat');

    // Merge: Use supervisor's non-agent fields + raw agent outputs (full detail)
    // This bypasses the supervisor's re-summarization of agent outputs
    structuredSummary = {
      ...supervisorSummary,
      // Override agent summaries with raw outputs (preserves full detail)
      rdsSummary: agentOutputs.rdsSummary ?? supervisorSummary.rdsSummary,
      ecsSummary: agentOutputs.ecsSummary ?? supervisorSummary.ecsSummary,
      newRelicSummary: agentOutputs.newRelicSummary ?? supervisorSummary.newRelicSummary,
      sentrySummary: agentOutputs.sentrySummary ?? supervisorSummary.sentrySummary,
      researchSummary: agentOutputs.researchSummary ?? supervisorSummary.researchSummary
    };
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
      summary: truncated ? `${rawSummary.substring(0, MAX_FALLBACK_LENGTH - 3)}...` : rawSummary,
      // Include raw agent outputs even in fallback mode
      ...agentOutputs
    };
  }

  const durationMs = Date.now() - startTime;

  // Get trace from the observability handler
  const trace = tracer.getTrace();

  logger.info(
    {
      query: query.substring(0, 50),
      summary: structuredSummary.summary,
      structuredSummary,
      messageCount: messages.length,
      durationMs,
      trace
    },
    'Investigation complete'
  );

  return {
    query,
    rawSummary,
    structuredSummary,
    messageCount: messages.length,
    durationMs,
    trace
  };
};
