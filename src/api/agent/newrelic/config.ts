import { z } from 'zod';

export const LLMProviderSchema = z.enum(['openai', 'groq', 'ollama', 'bedrock']).default('bedrock');
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

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
