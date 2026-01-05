import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import type { Logger } from 'pino';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

import {
  getSentryIssue,
  getSentryIssueEvents,
  normalizeSentryIssue,
  normalizeSentryIssueEvent,
  extendStacktraceToSourceCode
} from '@/libraries/sentry';
import type { LLMToolOptions } from '@/api/agent/domains/shared/types';
import { getErrorMessage, withTimeout, DEFAULT_STEP_TIMEOUT_MS } from '@/api/agent/core';
import { createToolSuccess, createToolError } from '@/api/agent/domains/shared/toolResponse';

/**
 * Tool name constant to avoid magic strings.
 */
const TOOL_NAME = 'investigate_and_analyze_sentry_issue' as const;

/**
 * Schema for the combined investigate and analyze tool input.
 */
const investigateAndAnalyzeSchema = z.object({
  issueId: z.string().describe('The Sentry issue ID to investigate'),
  includeSourceCode: z.boolean().optional().default(true).describe('Whether to include source code in stack traces'),
  context: z.string().optional().describe('Additional context about the error or application')
});

/**
 * Analysis prompt template for Sentry error analysis.
 */
const analysisPromptTemplate =
  ChatPromptTemplate.fromTemplate(`You are an expert error analyst specializing in identifying root causes of software errors.

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
 * Creates a combined tool that investigates a Sentry issue AND analyzes it in one call.
 *
 * This replaces the separate get_sentry_issue + get_sentry_events + analyze_sentry_error tools,
 * keeping raw Sentry API data internal to reduce token usage when passing to other agents.
 *
 * Returns only:
 * - analysis: LLM-generated root cause analysis
 * - summary: Issue metadata (title, status, etc.)
 */
export const createInvestigateAndAnalyzeSentryIssueTool = (options: LLMToolOptions) => {
  const { logger: parentLogger, model, stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS } = options;
  const logger: Logger = parentLogger.child({ tool: TOOL_NAME });

  return tool(
    async ({ issueId, includeSourceCode, context }) => {
      const startTime = Date.now();
      logger.info({ issueId, includeSourceCode }, 'Starting Sentry issue investigation and analysis');

      try {
        // Step 1: Fetch issue details
        const issue = await withTimeout(() => getSentryIssue({ issueId }), stepTimeoutMs, 'getSentryIssue');
        const normalizedIssue = normalizeSentryIssue(issue);
        logger.info({ issueId, title: normalizedIssue.title }, 'Sentry issue fetched');

        // Step 2: Fetch issue events with stack traces
        const issueEvents = await withTimeout(() => getSentryIssueEvents({ issueId }), stepTimeoutMs, 'getSentryIssueEvents');

        if (issueEvents.length === 0) {
          logger.info({ issueId }, 'No events found for issue');
          return createToolSuccess({
            analysis: 'No events found for this issue. Unable to perform stack trace analysis.',
            summary: {
              issueId,
              title: normalizedIssue.title,
              status: normalizedIssue.status,
              level: normalizedIssue.level,
              platform: normalizedIssue.platform,
              eventCount: 0
            },
            investigatedAt: new Date().toISOString(),
            durationMs: Date.now() - startTime
          });
        }

        const latestEvent = issueEvents[0];
        let normalizedEvent = normalizeSentryIssueEvent(latestEvent);

        if (!normalizedEvent) {
          logger.warn({ issueId, eventId: latestEvent.id }, 'Failed to normalize event data');
          return createToolError(TOOL_NAME, 'Failed to normalize event data');
        }

        // Step 3: Extend with source code if requested
        if (includeSourceCode) {
          const extendedEvent = await withTimeout(
            () => extendStacktraceToSourceCode(normalizedIssue, normalizedEvent),
            stepTimeoutMs,
            'extendStacktraceToSourceCode'
          );
          normalizedEvent = extendedEvent ?? normalizedEvent;
        }

        logger.info({ issueId, eventId: latestEvent.id, eventCount: issueEvents.length }, 'Sentry events fetched');

        // Step 4: Analyze with LLM (raw data stays internal)
        // Encoding strategy: Compact JSON for Sentry data
        // Reason: Issue and event objects are deeply nested (stacktraces, contexts, tags),
        // making TOON less efficient than compact JSON for these structures
        const contextSection = context ? `## Additional Context\n${context}` : '';
        const chain = analysisPromptTemplate.pipe(model).pipe(new StringOutputParser());

        const analysis = await withTimeout(
          () =>
            chain.invoke({
              issueData: JSON.stringify(normalizedIssue),
              eventData: JSON.stringify(normalizedEvent),
              contextSection
            }),
          stepTimeoutMs * 2, // Give more time for LLM analysis
          'analyzeSentryError'
        );

        const duration = Date.now() - startTime;
        logger.info({ issueId, duration }, 'Sentry issue investigation and analysis complete');

        // Return only the analysis and summary - raw data stays internal
        return createToolSuccess({
          analysis,
          summary: {
            issueId,
            title: normalizedIssue.title,
            status: normalizedIssue.status,
            level: normalizedIssue.level,
            platform: normalizedIssue.platform,
            firstSeen: normalizedIssue.firstSeen,
            lastSeen: normalizedIssue.lastSeen,
            count: normalizedIssue.count,
            userCount: normalizedIssue.userCount,
            eventCount: issueEvents.length
          },
          investigatedAt: new Date().toISOString(),
          durationMs: duration
        });
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error({ issueId, error: errorMessage }, 'Failed to investigate and analyze Sentry issue');
        return createToolError(TOOL_NAME, errorMessage, {
          doNotRetry: true,
          suggestedAction: 'Investigation failed. Check Sentry API credentials and issue ID.'
        });
      }
    },
    {
      name: TOOL_NAME,
      description:
        'Comprehensive Sentry issue investigation and analysis in one call. ' +
        'Fetches issue details, events with stack traces (and source code), then analyzes with AI. ' +
        'Returns only the analysis summary - raw Sentry data stays internal to reduce token usage.',
      schema: investigateAndAnalyzeSchema
    }
  );
};
