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
  summary: z.string().describe('Brief overview of what was found'),

  /** Comprehensive investigation summary from newrelic_expert (if any) */
  newRelicSummary: z.string().optional().describe('Comprehensive investigation summary from newrelic_expert (if any)'),

  /** Comprehensive investigation summary from aws_ecs_expert (if any) */
  ecsSummary: z.string().optional().describe('Comprehensive investigation summary from aws_ecs_expert (if any)'),

  /** Comprehensive investigation summary from sentry_expert (if any) */
  sentrySummary: z.string().optional().describe('Comprehensive investigation summary from sentry_expert (if any)'),

  /** Comprehensive investigation summary from research_expert (if any) */
  researchSummary: z.string().optional().describe('Comprehensive investigation summary from research_expert (if any)'),

  /** Root cause if determined */
  rootCause: z.string().optional().describe('Identified root cause if determined'),

  /** Affected services/users (if any) */
  impact: z.string().optional().describe('Affected services/users (if any)'),

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
  summary: z.string().describe('Brief overview of what was found'),
  newRelicSummary: z.string().optional().describe('Comprehensive investigation summary from newrelic_expert (if any)'),
  ecsSummary: z.string().optional().describe('Comprehensive investigation summary from aws_ecs_expert (if any)'),
  sentrySummary: z.string().optional().describe('Comprehensive investigation summary from sentry_expert (if any)'),
  researchSummary: z.string().optional().describe('Comprehensive investigation summary from research_expert (if any)'),
  timeline: z.array(z.string()).optional().describe('Key events and timestamps of the investigation (if any)'),
  rootCause: z.string().optional().describe('Identified root cause (if any)'),
  impact: z.string().optional().describe('Affected services/users (if any)'),
  recommendations: z.array(z.string()).optional().describe('Suggested actions (if any)')
});

/**
 * Tool execution record for observability.
 * Captures each tool invocation with timing and results.
 */
export const ToolExecutionSchema = z.object({
  /** Sequential order of execution */
  order: z.number().describe('Sequential execution order'),
  /** Tool name that was executed */
  toolName: z.string().describe('Name of the tool executed'),
  /** Input parameters passed to the tool */
  input: z.string().describe('Input parameters (JSON string)'),
  /** Output result from the tool */
  output: z.string().describe('Output result from the tool'),
  /** Execution duration in milliseconds */
  durationMs: z.number().describe('Execution duration in milliseconds'),
  /** Whether the tool execution succeeded */
  success: z.boolean().describe('Whether the tool succeeded'),
  /** Error message if the tool failed */
  error: z.string().optional().describe('Error message if failed'),
  /** ISO timestamp when the tool started */
  timestamp: z.string().describe('ISO timestamp of execution start')
});

export type StepCost = z.infer<typeof StepCostSchema>;
export type CostSummary = z.infer<typeof CostSummarySchema>;
export type InvestigationResult = z.infer<typeof InvestigationResultSchema>;
export type InvestigationSummary = z.infer<typeof InvestigationSummarySchema>;
export type ToolExecution = z.infer<typeof ToolExecutionSchema>;
