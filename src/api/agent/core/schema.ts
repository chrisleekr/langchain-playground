import { z } from 'zod';

/**
 * Investigation summary schema for developer triage.
 * Designed for developer triage with essential fields for quick decision-making.
 *
 * Used as `responseFormat` in the supervisor to ensure structured output.
 * @see https://docs.langchain.com/oss/javascript/langchain/structured-output
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

export type InvestigationSummary = z.infer<typeof InvestigationSummarySchema>;

/**
 * LLM call trace step with duration, cost, and agent context.
 */
export const LLMCallStepSchema = z.object({
  type: z.literal('llm_call'),
  order: z.number().describe('Sequential execution order'),
  timestamp: z.string().describe('ISO timestamp when the call started'),
  durationMs: z.number().describe('LLM call duration in milliseconds'),
  agent: z.string().optional().describe('Domain agent name (e.g., newrelic_expert, supervisor)'),
  inputTokens: z.number().describe('Input/prompt tokens'),
  outputTokens: z.number().describe('Output/completion tokens'),
  totalTokens: z.number().describe('Total tokens'),
  cost: z.number().describe('Estimated cost in USD'),
  toolCallsDecided: z.array(z.string()).optional().describe('Tools the LLM decided to invoke')
});

/**
 * Tool execution trace step with duration and agent context.
 */
export const ToolExecutionStepSchema = z.object({
  type: z.literal('tool_execution'),
  order: z.number().describe('Sequential execution order'),
  timestamp: z.string().describe('ISO timestamp when execution started'),
  durationMs: z.number().describe('Execution duration in milliseconds'),
  agent: z.string().optional().describe('Domain agent that invoked this tool'),
  toolName: z.string().describe('Name of the tool executed'),
  success: z.boolean().describe('Whether the tool succeeded'),
  error: z.string().optional().describe('Error message if failed')
});

/**
 * Unified trace step (discriminated union).
 */
export const TraceStepSchema = z.discriminatedUnion('type', [LLMCallStepSchema, ToolExecutionStepSchema]);

/**
 * Summary of investigation trace metrics.
 */
export const TraceSummarySchema = z.object({
  totalDurationMs: z.number().describe('Total investigation duration'),
  llmCallCount: z.number().describe('Number of LLM calls'),
  toolExecutionCount: z.number().describe('Number of tool executions'),
  totalTokens: z.number().describe('Total tokens used'),
  totalCost: z.number().describe('Total estimated cost in USD'),
  model: z.string().describe('Primary model used'),
  provider: z.string().describe('LLM provider')
});

/**
 * Complete investigation trace with all steps and summary.
 * Used by ObservabilityHandler to provide unified tracing output.
 */
export const InvestigationTraceSchema = z.object({
  steps: z.array(TraceStepSchema).describe('Chronologically ordered trace steps'),
  summary: TraceSummarySchema
});

export type LLMCallStep = z.infer<typeof LLMCallStepSchema>;
export type ToolExecutionStep = z.infer<typeof ToolExecutionStepSchema>;
export type TraceStep = z.infer<typeof TraceStepSchema>;
export type TraceSummary = z.infer<typeof TraceSummarySchema>;
export type InvestigationTrace = z.infer<typeof InvestigationTraceSchema>;
