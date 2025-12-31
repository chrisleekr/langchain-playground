import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import type { BaseMessage } from '@langchain/core/messages';
import type { Serialized } from '@langchain/core/load/serializable';
import type { Logger } from 'pino';

import type { AgentConfig } from '@/api/agent/core/config';

/**
 * Tracks tool execution timing.
 */
interface ToolTiming {
  startTime: number;
  name: string;
}

/**
 * Callback handler for agent observability and monitoring.
 * Logs model calls, tool executions, and their durations.
 *
 * This handler works with any LangChain/LangGraph graph by being passed
 * in the `callbacks` config option.
 *
 * IMPORTANT: This handler is designed for **single-use per request**. Create a new
 * instance for each request to ensure accurate per-request observability.
 * The handler accumulates tool timing state and should NOT be reused across requests.
 *
 * @example
 * ```typescript
 * // Create a new handler for each request
 * const observabilityHandler = new ObservabilityCallbackHandler(logger, config);
 *
 * const result = await supervisor.invoke(
 *   { messages: [new HumanMessage(query)] },
 *   { callbacks: [observabilityHandler] }
 * );
 * ```
 *
 * @see https://js.langchain.com/docs/concepts/callbacks/
 */
export class ObservabilityCallbackHandler extends BaseCallbackHandler {
  name = 'ObservabilityCallbackHandler';

  private toolTimings: Map<string, ToolTiming> = new Map();

  constructor(
    private logger: Logger,
    private config: AgentConfig
  ) {
    super();
  }

  /**
   * Called at the start of a Chat Model run.
   * Logs message count when verbose logging is enabled.
   */
  async handleChatModelStart(_llm: Serialized, messages: BaseMessage[][], runId: string): Promise<void> {
    if (this.config.verboseLogging) {
      const messageCount = messages.reduce((acc, batch) => acc + batch.length, 0);
      this.logger.info({ runId: runId.substring(0, 8), messageCount }, 'Before model call');
    }
  }

  /**
   * Called at the end of an LLM/ChatModel run.
   * Logs tool calls and content presence.
   */
  async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    // Extract tool calls from the last generation if available
    const lastGeneration = output.generations[0]?.[0];

    // ChatGeneration has a 'message' property with potential tool_calls
    const message =
      lastGeneration && typeof lastGeneration === 'object' && 'message' in lastGeneration
        ? (lastGeneration as { message: BaseMessage }).message
        : undefined;

    // Check for tool calls in the message (AIMessage has tool_calls)
    let toolCalls: string[] | undefined;
    if (message && 'tool_calls' in message) {
      const calls = (message as { tool_calls?: Array<{ name: string }> }).tool_calls;
      if (Array.isArray(calls)) {
        toolCalls = calls.map(tc => tc.name);
      }
    }

    const hasContent = !!(message?.content || lastGeneration?.text);

    this.logger.info(
      {
        runId: runId.substring(0, 8),
        toolCalls,
        hasContent
      },
      'Model response'
    );
  }

  /**
   * Called at the start of a Tool run.
   * Records start time for duration tracking.
   */
  async handleToolStart(
    _tool: Serialized,
    _input: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    runName?: string
  ): Promise<void> {
    this.toolTimings.set(runId, {
      startTime: Date.now(),
      name: runName ?? 'unknown'
    });
  }

  /**
   * Called at the end of a Tool run.
   * Logs tool name and execution duration.
   */
  async handleToolEnd(_output: unknown, runId: string): Promise<void> {
    const timing = this.toolTimings.get(runId);
    if (timing) {
      const duration = Date.now() - timing.startTime;
      this.logger.info({ tool: timing.name, duration }, 'Tool executed');
      this.toolTimings.delete(runId);
    }
  }

  /**
   * Called if a Tool run encounters an error.
   * Logs the error and cleans up timing.
   */
  async handleToolError(err: Error, runId: string): Promise<void> {
    const timing = this.toolTimings.get(runId);
    if (timing) {
      const duration = Date.now() - timing.startTime;
      this.logger.error({ tool: timing.name, duration, error: err.message }, 'Tool failed');
      this.toolTimings.delete(runId);
    }
  }
}
