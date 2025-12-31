import { z } from 'zod';

export const StepCostSchema = z.object({
  step: z.string().describe('Agent LLM call step (e.g., call(tool_name) or final-response)'),
  inputTokens: z.number().describe('Input/prompt tokens used by the agent'),
  outputTokens: z.number().describe('Output/completion tokens used by the agent'),
  totalTokens: z.number().describe('Total tokens used by the agent'),
  cost: z.number().describe('Estimated cost in USD')
});

export const CostSummarySchema = z.object({
  steps: z.array(StepCostSchema).describe('Cost breakdown per agent LLM call'),
  totalInputTokens: z.number().describe('Total input tokens across all steps'),
  totalOutputTokens: z.number().describe('Total output tokens across all steps'),
  totalTokens: z.number().describe('Total tokens across all steps'),
  totalCost: z.number().describe('Total estimated cost in USD'),
  model: z.string().describe('Model used for the investigation'),
  provider: z.string().describe('LLM provider used')
});

/**
 * Generic investigation result schema.
 * Domain-specific results extend from this base structure.
 */
export const InvestigationResultSchema = z.object({
  /** The original query that was investigated */
  query: z.string().describe('The original investigation query'),

  /** High-level summary of findings */
  summary: z.string().describe('Comprehensive investigation summary'),

  /** Root cause if determined */
  rootCause: z.string().optional().describe('Identified root cause if determined'),

  /** Actionable recommendations */
  recommendations: z.array(z.string()).describe('Suggested remediation actions'),

  /** Domains that contributed to the investigation */
  domains: z.array(z.string()).describe('Domain agents that participated in the investigation'),

  /** Cost summary for the investigation */
  costSummary: CostSummarySchema.optional().describe('Token usage and cost breakdown')
});

/**
 * Investigation summary schema for developer triage.
 * Designed for developer triage with essential fields for quick decision-making.
 *
 * Used as `responseFormat` in the supervisor to ensure structured output.
 * @see https://langchain-ai.github.io/langgraphjs/agents/structured-output/
 */
export const InvestigationSummarySchema = z.object({
  summary: z.string().describe('Comprehensive investigation summary'),
  rootCause: z.string().optional().describe('Identified root cause'),
  impact: z.string().optional().describe('Affected services/users'),
  recommendations: z.array(z.string()).optional().describe('Suggested actions')
});

export type StepCost = z.infer<typeof StepCostSchema>;
export type CostSummary = z.infer<typeof CostSummarySchema>;
export type InvestigationResult = z.infer<typeof InvestigationResultSchema>;
export type InvestigationSummary = z.infer<typeof InvestigationSummarySchema>;
