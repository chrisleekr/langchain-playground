import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';
import type { Logger } from 'pino';
import appConfig from 'config';

import type { AgentConfig, LLMProvider } from '@/api/agent/core/config';
import { calculateCost } from '@/api/agent/core/pricing';
import type { StepCost, CostSummary } from '@/api/agent/core/schema';

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
 * Resolves the actual model name from the application config based on provider.
 */
const resolveModelName = (agentConfig: AgentConfig): string => {
  // Use explicit model if provided
  if (agentConfig.model) {
    return agentConfig.model;
  }

  // Otherwise, get from application config based on provider
  const providerConfigMap: Record<LLMProvider, string> = {
    openai: 'openai.model',
    groq: 'groq.model',
    ollama: 'ollama.model',
    bedrock: 'aws.bedrock.model'
  };

  const configPath = providerConfigMap[agentConfig.provider];
  return appConfig.get<string>(configPath) || 'unknown';
};

/**
 * Callback handler that tracks token usage and calculates costs for LLM calls.
 *
 * This handler works with any LangChain/LangGraph graph by being passed
 * in the `callbacks` config option. It tracks each LLM call and aggregates
 * token usage and costs.
 *
 * IMPORTANT: This handler is designed for **single-use per request**. Create a new
 * instance for each request to ensure accurate per-request cost tracking.
 * The handler accumulates state and should NOT be reused across requests.
 *
 * @example
 * ```typescript
 * // Create a new handler for each request
 * const costHandler = new CostTrackingCallbackHandler(logger, config);
 *
 * const result = await supervisor.invoke(
 *   { messages: [new HumanMessage(query)] },
 *   { callbacks: [costHandler] }
 * );
 *
 * const costSummary = costHandler.getSummary();
 * ```
 *
 * @see https://js.langchain.com/docs/concepts/callbacks/
 * @see https://js.langchain.com/docs/how_to/chat_token_usage_tracking/
 */
export class CostTrackingCallbackHandler extends BaseCallbackHandler {
  name = 'CostTrackingCallbackHandler';

  private steps: StepCost[] = [];
  private stepCounter = 0;
  private model: string;
  private provider: LLMProvider;

  constructor(
    private logger: Logger,
    config: AgentConfig
  ) {
    super();
    this.model = resolveModelName(config);
    this.provider = config.provider;
  }

  /**
   * Called at the end of an LLM/ChatModel run.
   * Extracts token usage from llmOutput or message's usage_metadata.
   *
   * @param output - The LLMResult containing generations and llmOutput
   * @param runId - Unique run identifier
   */
  async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    this.stepCounter++;

    // Try to extract token usage from multiple sources:
    // 1. llmOutput (OpenAI, some Anthropic)
    // 2. Message's usage_metadata (Bedrock, newer LangChain providers)
    let tokenUsage = this.extractTokenUsage(output.llmOutput);

    // If not in llmOutput, check the message's usage_metadata (ChatGeneration)
    if (!tokenUsage) {
      const lastGeneration = output.generations[0]?.[0];
      if (lastGeneration && 'message' in lastGeneration) {
        const message = lastGeneration.message as { usage_metadata?: TokenUsage };
        if (message.usage_metadata) {
          tokenUsage = message.usage_metadata;
          this.logger.debug({ runId: runId.substring(0, 8) }, 'Token usage found in message.usage_metadata');
        }
      }
    }

    if (tokenUsage) {
      // Handle all naming conventions: promptTokens (OpenAI), input_tokens (Anthropic), inputTokens (Bedrock)
      const inputTokens = tokenUsage.promptTokens ?? tokenUsage.input_tokens ?? tokenUsage.inputTokens ?? 0;
      const outputTokens = tokenUsage.completionTokens ?? tokenUsage.output_tokens ?? tokenUsage.outputTokens ?? 0;
      const totalTokens = tokenUsage.totalTokens ?? tokenUsage.total_tokens ?? inputTokens + outputTokens;

      const cost = calculateCost(inputTokens, outputTokens, this.model, this.provider);

      const stepCost: StepCost = {
        step: `llm-call-${this.stepCounter}`,
        inputTokens,
        outputTokens,
        totalTokens,
        cost
      };

      this.steps.push(stepCost);

      this.logger.info(
        { runId: runId.substring(0, 8), step: this.stepCounter, inputTokens, outputTokens, cost: cost.toFixed(6) },
        'Token usage recorded via callback'
      );
    } else {
      this.logger.debug({ runId: runId.substring(0, 8), step: this.stepCounter, hasLlmOutput: !!output.llmOutput }, 'No token usage found');
    }
  }

  /**
   * Extracts token usage from various provider-specific llmOutput formats.
   */
  private extractTokenUsage(llmOutput: Record<string, unknown> | undefined): TokenUsage | null {
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
   * Get all recorded step costs.
   */
  getSteps(): StepCost[] {
    return this.steps;
  }

  /**
   * Get aggregated cost summary.
   */
  getSummary(): CostSummary {
    const totalInputTokens = this.steps.reduce((acc, s) => acc + s.inputTokens, 0);
    const totalOutputTokens = this.steps.reduce((acc, s) => acc + s.outputTokens, 0);
    const totalTokens = this.steps.reduce((acc, s) => acc + s.totalTokens, 0);
    const totalCost = this.steps.reduce((acc, s) => acc + s.cost, 0);

    return {
      steps: this.steps,
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalCost,
      model: this.model,
      provider: this.provider
    };
  }
}
