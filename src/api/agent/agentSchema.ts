import { Type } from '@sinclair/typebox';

/**
 * Request schema for POST /agent/investigate
 * Validates freeform text input and optional configuration overrides.
 */
export const PostAgentInvestigate = Type.Object({
  /** Freeform text describing what to investigate */
  query: Type.String({
    minLength: 1,
    maxLength: 10000,
    description:
      'Issue or incident describing what to investigate. For best LLM performance, keep queries concise (ideally under ~2000 characters), as very long inputs may be truncated or lead to degraded results.'
  }),
  /** Optional configuration overrides */
  config: Type.Optional(
    Type.Object({
      /** Maximum agent iterations (1-100) */
      recursionLimit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
      /** Maximum tool calls (1-100) */
      maxToolCalls: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
      /** Request timeout in ms (1000-600000) */
      timeoutMs: Type.Optional(Type.Number({ minimum: 1000, maximum: 600000 })),
      /** LLM temperature (0-2) */
      temperature: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
      /** LLM provider */
      provider: Type.Optional(Type.Union([Type.Literal('openai'), Type.Literal('groq'), Type.Literal('ollama'), Type.Literal('bedrock')])),
      /** Model override */
      model: Type.Optional(Type.String({ minLength: 1 })),
      /** Maximum output tokens (100-128000) */
      maxTokens: Type.Optional(Type.Number({ minimum: 100, maximum: 128000 })),
      /** Enable verbose logging */
      verboseLogging: Type.Optional(Type.Boolean())
    })
  )
});
