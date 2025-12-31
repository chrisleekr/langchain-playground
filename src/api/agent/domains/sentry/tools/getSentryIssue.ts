import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import type { Logger } from 'pino';

import { getSentryIssue, normalizeSentryIssue } from '@/libraries/sentry';
import type { DomainToolOptions } from '@/api/agent/domains/shared/types';
import { getErrorMessage, withTimeout, DEFAULT_STEP_TIMEOUT_MS } from '@/api/agent/core';
import { createToolSuccess, createToolError } from '@/api/agent/domains/shared/toolResponse';

/**
 * Schema for the getSentryIssue tool input.
 */
const getSentryIssueSchema = z.object({
  issueId: z.string().describe('The Sentry issue ID to retrieve')
});

/**
 * Creates a tool for fetching Sentry issue details.
 * This tool retrieves and normalizes a Sentry issue by its ID.
 *
 * @param options - Tool options with logger
 * @returns A LangChain tool for fetching Sentry issues
 */
export const createGetSentryIssueTool = (options: DomainToolOptions) => {
  const { logger: parentLogger, stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS } = options;
  const logger: Logger = parentLogger.child({ tool: 'get_sentry_issue' });

  return tool(
    async ({ issueId }) => {
      logger.info({ issueId }, 'Fetching Sentry issue');

      try {
        // Wrap external API call with timeout to prevent slow calls from blocking
        const issue = await withTimeout(() => getSentryIssue({ issueId }), stepTimeoutMs, 'getSentryIssue');
        const normalizedIssue = normalizeSentryIssue(issue);

        logger.info({ issueId, title: normalizedIssue.title }, 'Sentry issue fetched');

        return createToolSuccess(normalizedIssue);
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error({ issueId, error: errorMessage }, 'Failed to fetch Sentry issue');
        return createToolError('get_sentry_issue', errorMessage);
      }
    },
    {
      name: 'get_sentry_issue',
      description: 'Retrieves a Sentry issue by its ID and returns normalized issue details including title, status, assignee, and metadata.',
      schema: getSentryIssueSchema
    }
  );
};
