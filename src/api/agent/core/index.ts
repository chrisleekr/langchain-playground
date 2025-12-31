// Configuration
export {
  AgentConfigSchema,
  defaultConfig,
  LLMProviderSchema,
  DEFAULT_AGENT_MAX_ITERATIONS,
  DEFAULT_STEP_TIMEOUT_MS,
  type AgentConfig,
  type LLMProvider
} from './config';

// Utilities
export { getModel, getErrorMessage, createTimeoutPromise, withTimeout, TimeoutError, type TimeoutPromiseResult } from './utils';

// Pricing
export { calculateCost, getModelPricing } from './pricing';

// Schemas
export {
  StepCostSchema,
  CostSummarySchema,
  InvestigationResultSchema,
  InvestigationSummarySchema,
  type StepCost,
  type CostSummary,
  type InvestigationResult,
  type InvestigationSummary
} from './schema';

// Callbacks (for observability and cost tracking in supervisor/multi-agent architectures)
export { CostTrackingCallbackHandler, ObservabilityCallbackHandler } from '@/api/agent/domains/shared/callbacks';

// Prompts
export { investigationSystemPrompt } from './prompts';
