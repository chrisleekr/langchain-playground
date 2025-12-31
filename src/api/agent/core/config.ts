import { z } from 'zod';

export const LLMProviderSchema = z.enum(['openai', 'groq', 'ollama', 'bedrock']).default('bedrock');
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

/**
 * Default maximum iterations per domain agent.
 * Prevents a single agent from consuming the entire recursion budget.
 *
 * Formula for per-agent recursion limit: 2 * DEFAULT_AGENT_MAX_ITERATIONS + 1
 * @see https://langchain-ai.github.io/langgraph/concepts/low_level/#recursion-limit
 */
export const DEFAULT_AGENT_MAX_ITERATIONS = 10;

/**
 * Default per-step timeout in milliseconds for external API calls.
 * Ensures all external calls have timeout protection even when not explicitly configured.
 *
 * 30 seconds is chosen as a balance between:
 * - Allowing slow but valid API responses (e.g., complex NRQL queries)
 * - Preventing indefinite hangs that consume the entire timeout budget
 * - Matching typical HTTP client defaults (axios: 0, fetch: none, but 30s is common in enterprise)
 */
export const DEFAULT_STEP_TIMEOUT_MS = 30000;

/**
 * Agent configuration schema with validation constraints.
 * All values have sensible defaults for production use.
 */
export const AgentConfigSchema = z.object({
  /** Maximum agent recursion limit before stopping (prevents infinite loops) */
  recursionLimit: z.number().int().min(1).max(100).default(100),
  /** Maximum tool calls before forcing final response */
  maxToolCalls: z.number().int().min(1).max(100).default(30),
  /** Request timeout in milliseconds */
  timeoutMs: z.number().int().min(1000).max(600000).default(600000),
  /**
   * Per-step timeout in seconds for individual agent/tool operations.
   * Prevents slow API calls from consuming the entire timeout budget.
   * @see https://langchain-ai.github.io/langgraph/how-tos/subgraph-timeouts/
   */
  stepTimeoutSec: z.number().int().min(10).max(300).default(120),
  /** LLM temperature (0 = deterministic, 2 = creative) */
  temperature: z.number().min(0).max(2).default(0),
  /** LLM provider to use */
  provider: LLMProviderSchema,
  /** Optional model override (uses provider default if not specified) */
  model: z.string().min(1).optional(),
  /** Maximum tokens for model output */
  maxTokens: z.number().int().min(100).max(128000).default(60000),
  /** Enable verbose logging for debugging */
  verboseLogging: z.boolean().default(false)
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/** Default agent configuration parsed from schema defaults */
export const defaultConfig: AgentConfig = AgentConfigSchema.parse({});
