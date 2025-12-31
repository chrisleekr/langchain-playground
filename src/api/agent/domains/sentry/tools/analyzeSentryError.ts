import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import type { Logger } from 'pino';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

import type { LLMToolOptions } from '@/api/agent/domains/shared/types';

/**
 * Schema for the analyzeSentryError tool input.
 */
const analyzeSentryErrorSchema = z.object({
  issueData: z.string().describe('JSON string of the normalized Sentry issue data'),
  eventData: z.string().describe('JSON string of the Sentry event data with stack trace'),
  context: z.string().optional().describe('Additional context about the error or application')
});

/**
 * Analysis prompt template for Sentry error analysis.
 */
const analysisPrompt = ChatPromptTemplate.fromTemplate(`You are an expert error analyst specializing in identifying root causes of software errors.

Analyze the following Sentry error data and provide a detailed root cause analysis.

## Issue Data
{issueData}

## Event Data (with stack trace)
{eventData}

{contextSection}

## Your Analysis Should Include:
1. **Error Summary**: Brief description of the error
2. **Root Cause**: The underlying cause of the error
3. **Affected Code**: Key files, functions, or lines involved
4. **Impact Assessment**: Severity and potential user impact
5. **Recommendations**: Specific steps to fix and prevent recurrence

Provide your analysis in a structured format.`);

/**
 * Creates a tool for analyzing Sentry errors using LLM.
 * This tool uses the LLM to analyze error data and provide root cause analysis.
 *
 * @param options - Tool options with logger and model
 * @returns A LangChain tool for analyzing Sentry errors
 */
export const createAnalyzeSentryErrorTool = (options: LLMToolOptions) => {
  const { logger: parentLogger, model } = options;
  const logger: Logger = parentLogger.child({ tool: 'analyze_sentry_error' });

  return tool(
    async ({ issueData, eventData, context }) => {
      logger.info('Analyzing Sentry error');

      const contextSection = context ? `## Additional Context\n${context}` : '';

      const chain = analysisPrompt.pipe(model as BaseChatModel).pipe(new StringOutputParser());

      const analysis = await chain.invoke({
        issueData,
        eventData,
        contextSection
      });

      logger.info('Sentry error analysis complete');

      return analysis;
    },
    {
      name: 'analyze_sentry_error',
      description:
        'Analyzes Sentry error data using AI to identify root cause, affected code, and provide recommendations. Requires issue data and event data as JSON strings.',
      schema: analyzeSentryErrorSchema
    }
  );
};
