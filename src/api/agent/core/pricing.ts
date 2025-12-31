import Decimal from 'decimal.js';

import type { LLMProvider } from './config';

/**
 * Pricing per 1M tokens in USD.
 * Uses string values to preserve precision when converted to Decimal.
 */
interface ModelPricing {
  /** Cost per 1M input tokens in USD */
  inputPer1M: string;
  /** Cost per 1M output tokens in USD */
  outputPer1M: string;
}

/**
 * Model pricing lookup table.
 * Note: Prices as of December 2025 - update these periodically.
 *
 * @see https://openai.com/pricing
 * @see https://groq.com/pricing
 * @see https://aws.amazon.com/bedrock/pricing/
 */
const PRICING: Record<string, ModelPricing> = {
  // OpenAI
  'gpt-5.2': { inputPer1M: '1.75', outputPer1M: '14' },

  // Groq - https://console.groq.com/docs/model/qwen/qwen3-32b
  'qwen3-32b': { inputPer1M: '0.29', outputPer1M: '0.59' },

  // AWS Bedrock (Claude models) - $5/1M input, $25/1M output
  'us.anthropic.claude-opus-4-5-20251101-v1:0': { inputPer1M: '5', outputPer1M: '25' },

  // Ollama (local, no cost)
  ollama: { inputPer1M: '0', outputPer1M: '0' }
};

/** Fallback pricing for unknown models (zero cost) */
const DEFAULT_PRICING: ModelPricing = { inputPer1M: '0', outputPer1M: '0' };

/**
 * Retrieves pricing information for a given model and provider.
 *
 * @param model - The model name to look up
 * @param provider - The LLM provider
 * @returns ModelPricing with input and output costs per 1M tokens
 */
export const getModelPricing = (model: string, provider: LLMProvider): ModelPricing => {
  // For Ollama, always return 0 cost (local inference)
  if (provider === 'ollama') {
    return PRICING['ollama'] ?? DEFAULT_PRICING;
  }

  return PRICING[model] ?? DEFAULT_PRICING;
};

/**
 * Calculates the cost of an LLM call based on token usage.
 * Uses Decimal.js for precise financial calculations to avoid
 * floating-point precision issues.
 *
 * @param inputTokens - Number of input/prompt tokens
 * @param outputTokens - Number of output/completion tokens
 * @param model - The model name used
 * @param provider - The LLM provider
 * @returns Total cost in USD as a number
 */
export const calculateCost = (inputTokens: number, outputTokens: number, model: string, provider: LLMProvider): number => {
  const pricing = getModelPricing(model, provider);

  const inputCost = new Decimal(inputTokens).dividedBy(1_000_000).times(pricing.inputPer1M);
  const outputCost = new Decimal(outputTokens).dividedBy(1_000_000).times(pricing.outputPer1M);

  return inputCost.plus(outputCost).toNumber();
};
