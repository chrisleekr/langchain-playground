import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import type { BaseMessage } from '@langchain/core/messages';
import type { Serialized } from '@langchain/core/load/serializable';
import type { Logger } from 'pino';
import appConfig from 'config';

import type { AgentConfig, LLMProvider } from '@/api/agent/core/config';
import { calculateCost } from '@/api/agent/core/pricing';
import type { TraceStep, InvestigationTrace, LLMCallStep, ToolExecutionStep } from '@/api/agent/core/schema';

/**
 * Token usage structure from LLM providers.
 * Different providers may use different field names.
 */
interface TokenUsage {
  /** OpenAI-style field names */
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** Anthropic/Bedrock-style field names (snake_case) */
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  /** Bedrock Converse-style field names (camelCase) */
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Tracks LLM call start time and agent context.
 */
interface LLMTiming {
  startTime: number;
  agent?: string;
}

/**
 * Tracks tool execution start time and metadata.
 */
interface ToolTiming {
  startTime: number;
  name: string;
  agent?: string;
  timestamp: string;
}

/**
 * Observability handler that combines tracing and cost tracking.
 *
 * Produces a single chronological trace with:
 * - LLM calls: duration, tokens, cost, agent context, tool calls decided
 * - Tool executions: duration, success/failure, agent context
 *
 * IMPORTANT: This handler is designed for **single-use per request**. Create a new
 * instance for each request to ensure accurate per-request tracking.
 * The handler accumulates state and should NOT be reused across requests.
 *
 * @example
 * ```typescript
 * const tracer = new ObservabilityHandler(logger, config);
 * const result = await supervisor.invoke(
 *   { messages: [new HumanMessage(query)] },
 *   { callbacks: [tracer] }
 * );
 * const trace = tracer.getTrace();
 * ```
 *
 * @see https://docs.langchain.com/oss/javascript/langchain/observability
 */
export class ObservabilityHandler extends BaseCallbackHandler {
  name = 'ObservabilityHandler';

  private steps: TraceStep[] = [];
  private stepCounter = 0;

  // LLM call tracking
  private llmStartTimes: Map<string, LLMTiming> = new Map();

  // Tool execution tracking
  private toolTimings: Map<string, ToolTiming> = new Map();

  private model: string;
  private provider: LLMProvider;

  constructor(
    private logger: Logger,
    private config: AgentConfig
  ) {
    super();
    this.model = this.resolveModelName();
    this.provider = config.provider;
  }

  // LLM Call Tracking

  /**
   * Called at the start of a Chat Model run.
   * Records start time and extracts agent context from LangGraph metadata.
   */
  async handleChatModelStart(
    _llm: Serialized,
    _messages: BaseMessage[][],
    runId: string,
    _parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Extract agent name from LangGraph metadata
    const agent = metadata?.langgraph_node as string | undefined;

    this.llmStartTimes.set(runId, {
      startTime: Date.now(),
      agent
    });

    this.logger.info({ runId: runId.substring(0, 8), agent }, 'LLM call starting');
  }

  /**
   * Called at the end of an LLM/ChatModel run.
   * Extracts token usage, calculates cost, and records the LLM call step.
   */
  async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    const timing = this.llmStartTimes.get(runId);
    if (!timing) return;

    const durationMs = Date.now() - timing.startTime;
    this.stepCounter++;

    // Extract token usage from multiple sources
    const tokenUsage = this.extractTokenUsage(output);
    const inputTokens = tokenUsage?.inputTokens ?? 0;
    const outputTokens = tokenUsage?.outputTokens ?? 0;
    const totalTokens = inputTokens + outputTokens;
    const cost = calculateCost(inputTokens, outputTokens, this.model, this.provider);

    // Extract tool calls decided
    const toolCallsDecided = this.extractToolCalls(output);

    const step: LLMCallStep = {
      type: 'llm_call',
      order: this.stepCounter,
      timestamp: new Date(timing.startTime).toISOString(),
      durationMs,
      agent: timing.agent,
      inputTokens,
      outputTokens,
      totalTokens,
      cost,
      toolCallsDecided: toolCallsDecided.length > 0 ? toolCallsDecided : undefined
    };

    this.steps.push(step);
    this.llmStartTimes.delete(runId);

    this.logger.info(
      {
        order: step.order,
        agent: step.agent,
        durationMs,
        tokens: totalTokens,
        cost: cost.toFixed(6),
        toolCalls: toolCallsDecided.length > 0 ? toolCallsDecided : undefined
      },
      'LLM call completed'
    );
  }

  // ============================================================================
  // Tool Execution Tracking
  // ============================================================================

  /**
   * Called at the start of a Tool run.
   * Records start time and extracts agent context from LangGraph metadata.
   */
  async handleToolStart(
    _tool: Serialized,
    _input: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string
  ): Promise<void> {
    const toolName = runName ?? 'unknown';
    const agent = metadata?.langgraph_node as string | undefined;

    this.toolTimings.set(runId, {
      startTime: Date.now(),
      name: toolName,
      agent,
      timestamp: new Date().toISOString()
    });

    this.logger.info({ tool: toolName, agent }, 'Tool starting');
  }

  /**
   * Called at the end of a Tool run.
   * Records the tool execution step with duration and success status.
   */
  async handleToolEnd(_output: unknown, runId: string): Promise<void> {
    const timing = this.toolTimings.get(runId);
    if (!timing) return;

    const durationMs = Date.now() - timing.startTime;
    this.stepCounter++;

    const step: ToolExecutionStep = {
      type: 'tool_execution',
      order: this.stepCounter,
      timestamp: timing.timestamp,
      durationMs,
      agent: timing.agent,
      toolName: timing.name,
      success: true
    };

    this.steps.push(step);
    this.toolTimings.delete(runId);

    this.logger.info({ order: step.order, tool: timing.name, agent: timing.agent, durationMs }, 'Tool completed');
  }

  /**
   * Called if a Tool run encounters an error.
   * Records the tool execution step with failure status and error message.
   */
  async handleToolError(err: Error, runId: string): Promise<void> {
    const timing = this.toolTimings.get(runId);
    if (!timing) return;

    const durationMs = Date.now() - timing.startTime;
    this.stepCounter++;

    const step: ToolExecutionStep = {
      type: 'tool_execution',
      order: this.stepCounter,
      timestamp: timing.timestamp,
      durationMs,
      agent: timing.agent,
      toolName: timing.name,
      success: false,
      error: err.message
    };

    this.steps.push(step);
    this.toolTimings.delete(runId);

    this.logger.error({ order: step.order, tool: timing.name, agent: timing.agent, durationMs, error: err.message }, 'Tool failed');
  }

  // Trace Output

  /**
   * Get the complete investigation trace with all steps and summary.
   * Steps are sorted chronologically by timestamp.
   */
  getTrace(): InvestigationTrace {
    // Sort steps by timestamp for chronological order
    const sortedSteps = [...this.steps].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const llmSteps = sortedSteps.filter((s): s is LLMCallStep => s.type === 'llm_call');
    const toolSteps = sortedSteps.filter((s): s is ToolExecutionStep => s.type === 'tool_execution');

    const totalTokens = llmSteps.reduce((sum, s) => sum + s.totalTokens, 0);
    const totalCost = llmSteps.reduce((sum, s) => sum + s.cost, 0);

    // Calculate total duration from first to last step
    let totalDurationMs = 0;
    if (sortedSteps.length > 0) {
      const firstTimestamp = new Date(sortedSteps[0].timestamp).getTime();
      const lastStep = sortedSteps[sortedSteps.length - 1];
      const lastTimestamp = new Date(lastStep.timestamp).getTime() + lastStep.durationMs;
      totalDurationMs = lastTimestamp - firstTimestamp;
    }

    return {
      steps: sortedSteps,
      summary: {
        totalDurationMs,
        llmCallCount: llmSteps.length,
        toolExecutionCount: toolSteps.length,
        totalTokens,
        totalCost,
        model: this.model,
        provider: this.provider
      }
    };
  }

  // Helper Methods

  /**
   * Resolves the actual model name from the application config based on provider.
   */
  private resolveModelName(): string {
    // Use explicit model if provided
    if (this.config.model) {
      return this.config.model;
    }

    // Otherwise, get from application config based on provider
    const providerConfigMap: Record<LLMProvider, string> = {
      openai: 'openai.model',
      groq: 'groq.model',
      ollama: 'ollama.model',
      bedrock: 'aws.bedrock.model'
    };

    const configPath = providerConfigMap[this.config.provider];
    return appConfig.get<string>(configPath) || 'unknown';
  }

  /**
   * Extracts token usage from LLM output.
   * Handles multiple provider formats (OpenAI, Anthropic, Bedrock).
   */
  private extractTokenUsage(output: LLMResult): { inputTokens: number; outputTokens: number } | null {
    // Try llmOutput first
    let tokenUsage = this.extractTokenUsageFromLLMOutput(output.llmOutput);

    // If not in llmOutput, check the message's usage_metadata (ChatGeneration)
    if (!tokenUsage) {
      const lastGeneration = output.generations[0]?.[0];
      if (lastGeneration && 'message' in lastGeneration) {
        const message = lastGeneration.message as { usage_metadata?: TokenUsage };
        if (message.usage_metadata) {
          tokenUsage = message.usage_metadata;
        }
      }
    }

    if (!tokenUsage) {
      return null;
    }

    // Handle all naming conventions: promptTokens (OpenAI), input_tokens (Anthropic), inputTokens (Bedrock)
    const inputTokens = tokenUsage.promptTokens ?? tokenUsage.input_tokens ?? tokenUsage.inputTokens ?? 0;
    const outputTokens = tokenUsage.completionTokens ?? tokenUsage.output_tokens ?? tokenUsage.outputTokens ?? 0;

    return { inputTokens, outputTokens };
  }

  /**
   * Extracts token usage from various provider-specific llmOutput formats.
   */
  private extractTokenUsageFromLLMOutput(llmOutput: Record<string, unknown> | undefined): TokenUsage | null {
    if (!llmOutput) {
      return null;
    }

    // OpenAI format: { tokenUsage: { promptTokens, completionTokens, totalTokens } }
    if (llmOutput['tokenUsage'] && typeof llmOutput['tokenUsage'] === 'object') {
      return llmOutput['tokenUsage'] as TokenUsage;
    }

    // Anthropic/general format: { usage: { input_tokens, output_tokens } }
    if (llmOutput['usage'] && typeof llmOutput['usage'] === 'object') {
      return llmOutput['usage'] as TokenUsage;
    }

    // Bedrock format: direct fields
    if ('inputTokens' in llmOutput || 'input_tokens' in llmOutput) {
      return {
        input_tokens: (llmOutput['inputTokens'] as number | undefined) ?? (llmOutput['input_tokens'] as number),
        output_tokens: (llmOutput['outputTokens'] as number | undefined) ?? (llmOutput['output_tokens'] as number),
        total_tokens: (llmOutput['totalTokens'] as number | undefined) ?? (llmOutput['total_tokens'] as number)
      };
    }

    return null;
  }

  /**
   * Extracts tool call names from LLM output.
   * Used to track which tools the LLM decided to invoke.
   */
  private extractToolCalls(output: LLMResult): string[] {
    const lastGeneration = output.generations[0]?.[0];
    if (!lastGeneration || !('message' in lastGeneration)) {
      return [];
    }

    const message = lastGeneration.message as { tool_calls?: Array<{ name: string }> };
    if (!message.tool_calls || !Array.isArray(message.tool_calls)) {
      return [];
    }

    return message.tool_calls.map(tc => tc.name);
  }
}
