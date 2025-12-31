import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import type { BaseMessage } from '@langchain/core/messages';
import type { Serialized } from '@langchain/core/load/serializable';
import type { Logger } from 'pino';

import type { AgentConfig } from '@/api/agent/core/config';

/** Maximum length for truncated content in logs */
const MAX_CONTENT_LENGTH = 500;

/**
 * Truncates a string to a maximum length with ellipsis.
 */
const truncate = (str: string, maxLength: number = MAX_CONTENT_LENGTH): string => {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...[truncated]';
};

/**
 * Extracts content from a message for logging.
 */
const getMessageContent = (msg: BaseMessage): string => {
  const content = msg.content;
  if (typeof content === 'string') {
    return truncate(content);
  }
  if (Array.isArray(content)) {
    // Extract text from content blocks
    const texts = content
      .map(block => {
        if (typeof block === 'object' && block !== null && 'text' in block) {
          return (block as { text: string }).text;
        }
        if (typeof block === 'object' && block !== null && 'type' in block) {
          return `[${(block as { type: string }).type}]`;
        }
        return String(block);
      })
      .join(' ');
    return truncate(texts);
  }
  return String(content);
};

/**
 * Tracks tool execution timing and input.
 */
interface ToolTiming {
  startTime: number;
  name: string;
  input: string;
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
   * Logs message count, structure, and content.
   */
  async handleChatModelStart(_llm: Serialized, messages: BaseMessage[][], runId: string): Promise<void> {
    const allMessages = messages.flat();
    const messageCount = allMessages.length;

    // Check for tool calls in messages (both direct and additional_kwargs)
    const hasToolCalls = (msg: BaseMessage): boolean => {
      if ('tool_calls' in msg) {
        const calls = (msg as unknown as { tool_calls?: unknown[] }).tool_calls;
        if (calls && calls.length > 0) return true;
      }
      const additionalCalls = msg.additional_kwargs?.tool_calls as unknown[] | undefined;
      return !!(additionalCalls && additionalCalls.length > 0);
    };

    // Build message summary with content
    const messageSummary = allMessages.map((msg, i) => ({
      index: i,
      type: msg._getType(),
      name: msg.name,
      hasToolCalls: hasToolCalls(msg),
      toolCallId: 'tool_call_id' in msg ? msg.tool_call_id : undefined,
      content: getMessageContent(msg)
    }));

    if (this.config.verboseLogging) {
      this.logger.info({ runId: runId.substring(0, 8), messageCount, messages: messageSummary }, 'Model input');
    } else {
      // Log just the last message (the prompt) at debug level
      const lastMessage = allMessages[allMessages.length - 1];
      this.logger.debug(
        {
          runId: runId.substring(0, 8),
          messageCount,
          lastMessageType: lastMessage?._getType(),
          lastMessageContent: lastMessage ? getMessageContent(lastMessage) : undefined
        },
        'Model input'
      );
    }
  }

  /**
   * Called at the end of an LLM/ChatModel run.
   * Logs tool calls, content, and model output.
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
    let toolCalls: Array<{ name: string; id?: string }> | undefined;
    if (message && 'tool_calls' in message) {
      const calls = (message as { tool_calls?: Array<{ name: string; id?: string }> }).tool_calls;
      if (Array.isArray(calls) && calls.length > 0) {
        toolCalls = calls.map(tc => ({ name: tc.name, id: tc.id }));
      }
    }

    // Extract output content
    let outputContent: string | undefined;
    if (message) {
      outputContent = getMessageContent(message);
    } else if (lastGeneration?.text) {
      outputContent = truncate(lastGeneration.text);
    }

    const hasContent = !!outputContent && outputContent.length > 0;

    this.logger.info(
      {
        runId: runId.substring(0, 8),
        toolCalls: toolCalls?.map(tc => tc.name),
        hasContent,
        output: this.config.verboseLogging ? outputContent : undefined
      },
      'Model output'
    );
  }

  /**
   * Called at the start of a Tool run.
   * Logs tool name and input, records start time for duration tracking.
   */
  async handleToolStart(
    _tool: Serialized,
    input: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    runName?: string
  ): Promise<void> {
    const toolName = runName ?? 'unknown';
    const truncatedInput = truncate(input);

    this.toolTimings.set(runId, {
      startTime: Date.now(),
      name: toolName,
      input: truncatedInput
    });

    if (this.config.verboseLogging) {
      this.logger.info({ tool: toolName, input: truncatedInput }, 'Tool starting');
    }
  }

  /**
   * Called at the end of a Tool run.
   * Logs tool name, execution duration, and output.
   */
  async handleToolEnd(output: unknown, runId: string): Promise<void> {
    const timing = this.toolTimings.get(runId);
    if (timing) {
      const duration = Date.now() - timing.startTime;

      // Serialize and truncate output
      let outputStr: string;
      if (typeof output === 'string') {
        outputStr = truncate(output);
      } else {
        try {
          outputStr = truncate(JSON.stringify(output));
        } catch {
          outputStr = '[unable to serialize]';
        }
      }

      if (this.config.verboseLogging) {
        this.logger.info({ tool: timing.name, duration, input: timing.input, output: outputStr }, 'Tool completed');
      } else {
        this.logger.info({ tool: timing.name, duration }, 'Tool completed');
      }

      this.toolTimings.delete(runId);
    }
  }

  /**
   * Called if a Tool run encounters an error.
   * Logs the error with input and cleans up timing.
   */
  async handleToolError(err: Error, runId: string): Promise<void> {
    const timing = this.toolTimings.get(runId);
    if (timing) {
      const duration = Date.now() - timing.startTime;
      this.logger.error({ tool: timing.name, duration, input: timing.input, error: err.message }, 'Tool failed');
      this.toolTimings.delete(runId);
    }
  }
}
