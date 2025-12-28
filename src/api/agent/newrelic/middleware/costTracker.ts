import { createMiddleware, AIMessage, type AgentMiddleware } from 'langchain';
import type { Logger } from 'pino';
import appConfig from 'config';

import type { AgentConfig, LLMProvider } from '../config';
import { calculateCost } from '../pricing';
import type { StepCost, CostSummary } from '../schema';

/**
 * Interface for accessing cost tracking data.
 * Returned alongside the middleware from createCostTrackerMiddleware.
 */
export interface CostTracker {
  /** Get all recorded step costs */
  getSteps(): StepCost[];
  /** Get aggregated cost summary */
  getSummary(): CostSummary;
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
 * Creates a middleware that tracks token usage and calculates costs.
 * Only counts usage when AIMessage.usage_metadata is available.
 *
 * @see https://js.langchain.com/docs/how_to/chat_token_usage_tracking/
 */
export const createCostTrackerMiddleware = (logger: Logger, config: AgentConfig): { middleware: AgentMiddleware; tracker: CostTracker } => {
  const steps: StepCost[] = [];
  let stepCounter = 0;
  const model = resolveModelName(config);
  const provider = config.provider;

  const middleware = createMiddleware({
    name: 'CostTracker',
    afterModel: state => {
      const lastMessage = state.messages.at(-1);

      // Only track if usage_metadata is available
      if (lastMessage instanceof AIMessage && lastMessage.usage_metadata) {
        stepCounter++;
        const { input_tokens = 0, output_tokens = 0, total_tokens = 0 } = lastMessage.usage_metadata;

        // Determine step name based on what the agent decided to do
        // Note: These tokens are from the agent's LLM call, not the tool execution
        const toolCalls = lastMessage.tool_calls?.map(tc => tc.name) ?? [];
        const stepName = toolCalls.length > 0 ? `step-${stepCounter}: call(${toolCalls.join(', ')})` : `step-${stepCounter}: final-response`;

        const cost = calculateCost(input_tokens, output_tokens, model, provider);

        const stepCost: StepCost = {
          step: stepName,
          inputTokens: input_tokens,
          outputTokens: output_tokens,
          totalTokens: total_tokens,
          cost
        };

        steps.push(stepCost);

        logger.info({ step: stepName, inputTokens: input_tokens, outputTokens: output_tokens, cost: cost.toFixed(6) }, 'Token usage recorded');
      }

      // Return undefined to pass through state unchanged
      return undefined;
    }
  });

  const tracker: CostTracker = {
    getSteps: () => steps,
    getSummary: (): CostSummary => {
      const totalInputTokens = steps.reduce((acc, s) => acc + s.inputTokens, 0);
      const totalOutputTokens = steps.reduce((acc, s) => acc + s.outputTokens, 0);
      const totalTokens = steps.reduce((acc, s) => acc + s.totalTokens, 0);
      const totalCost = steps.reduce((acc, s) => acc + s.cost, 0);

      return {
        steps,
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
        totalCost,
        model,
        provider
      };
    }
  };

  return { middleware, tracker };
};
