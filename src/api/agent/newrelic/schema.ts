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

export const InvestigationResultSchema = z.object({
  issueId: z.string().describe('The New Relic issue ID investigated'),

  envoyTimeline: z.string().describe('Request flow timeline from envoy logs'),
  serviceErrors: z.string().describe('Service error analysis'),
  relevantURLs: z.array(z.string()).describe('URLs extracted from logs'),
  traceIds: z.array(z.string()).describe('Trace IDs found in logs'),

  webSearchResults: z.string().optional().describe('Findings from Brave search'),
  documentationLinks: z.array(z.string()).optional().describe('Relevant docs from Context7'),
  infrastructureStatus: z.string().optional().describe('K8s status if checked'),

  summary: z.string().describe('Comprehensive investigation summary'),
  rootCause: z.string().optional().describe('Identified root cause if determined'),
  recommendations: z.array(z.string()).describe('Suggested remediation actions'),

  costSummary: CostSummarySchema.optional().describe('Token usage and cost breakdown')
});

export type StepCost = z.infer<typeof StepCostSchema>;
export type CostSummary = z.infer<typeof CostSummarySchema>;
export type InvestigationResult = z.infer<typeof InvestigationResultSchema>;
