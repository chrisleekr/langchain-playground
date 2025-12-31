import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import type { Logger } from 'pino';

import {
  getSentryIssueEvents,
  normalizeSentryIssueEvent,
  extendStacktraceToSourceCode,
  normalizeSentryIssue,
  getSentryIssue
} from '@/libraries/sentry';
import type { DomainToolOptions } from '@/api/agent/domains/shared/types';
import { getErrorMessage, withTimeout, DEFAULT_STEP_TIMEOUT_MS } from '@/api/agent/core';
import { createToolSuccess, createToolError } from '@/api/agent/domains/shared/toolResponse';

/**
 * Schema for the getSentryEvents tool input.
 */
const getSentryEventsSchema = z.object({
  issueId: z.string().describe('The Sentry issue ID to retrieve events for'),
  includeSourceCode: z.boolean().optional().default(true).describe('Whether to include source code in stack traces')
});

/**
 * Creates a tool for fetching Sentry issue events with stack traces.
 * This tool retrieves events for a Sentry issue, including full stack traces with source code.
 *
 * @param options - Tool options with logger
 * @returns A LangChain tool for fetching Sentry issue events
 */
export const createGetSentryEventsTool = (options: DomainToolOptions) => {
  const { logger: parentLogger, stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS } = options;
  const logger: Logger = parentLogger.child({ tool: 'get_sentry_events' });

  return tool(
    async ({ issueId, includeSourceCode }) => {
      logger.info({ issueId, includeSourceCode }, 'Fetching Sentry issue events');

      try {
        // Wrap external API calls with timeout to prevent slow calls from blocking
        const issueEvents = await withTimeout(() => getSentryIssueEvents({ issueId }), stepTimeoutMs, 'getSentryIssueEvents');

        if (issueEvents.length === 0) {
          logger.info({ issueId }, 'No events found for issue');
          return createToolSuccess({ message: 'No events found for this issue', events: [] });
        }

        const latestEvent = issueEvents[0];
        const normalizedEvent = normalizeSentryIssueEvent(latestEvent);

        // Handle case where normalization fails
        if (!normalizedEvent) {
          logger.warn({ issueId, eventId: latestEvent.id }, 'Failed to normalize event data');
          return createToolError('get_sentry_events', 'Failed to normalize event data');
        }

        let result: object = normalizedEvent;

        if (includeSourceCode) {
          // Get the issue to extend stack traces with source code
          // Wrap external API calls with timeout
          const issue = await withTimeout(() => getSentryIssue({ issueId }), stepTimeoutMs, 'getSentryIssue');
          const normalizedIssue = normalizeSentryIssue(issue);
          const extendedEvent = await withTimeout(
            () => extendStacktraceToSourceCode(normalizedIssue, normalizedEvent),
            stepTimeoutMs,
            'extendStacktraceToSourceCode'
          );
          result = extendedEvent ?? normalizedEvent;
        }

        logger.info({ issueId, eventId: latestEvent.id, eventCount: issueEvents.length }, 'Sentry events fetched');

        return createToolSuccess({
          eventId: latestEvent.id,
          totalEvents: issueEvents.length,
          latestEvent: result
        });
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error({ issueId, error: errorMessage }, 'Failed to fetch Sentry events');
        return createToolError('get_sentry_events', errorMessage);
      }
    },
    {
      name: 'get_sentry_events',
      description: 'Retrieves events for a Sentry issue including stack traces with source code. Returns the latest event with full error details.',
      schema: getSentryEventsSchema
    }
  );
};
