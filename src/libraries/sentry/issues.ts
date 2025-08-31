import config from 'config';
import { GetSentryIssueArgs, SentryIssue } from './types';
import { normalizeObject, removeNullOrEmpty } from './utils';
import { logger } from '../logger';
import { sentryApiUrl } from '.';

// https://docs.sentry.io/api/events/retrieve-an-issue/
export const getSentryIssue = async ({ issueId }: GetSentryIssueArgs): Promise<SentryIssue> => {
  const sentryLogger = logger.child({ function: 'getSentryIssue' });

  const url = `${sentryApiUrl}/organizations/${config.get<string>('sentry.organizationSlug')}/issues/${issueId}/`;
  sentryLogger.info({ url }, 'Fetching Sentry issue');
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.get<string>('sentry.authToken')}`
    }
  });

  if (!response.ok) {
    logger.error(
      {
        issueId,
        status: response.status,
        statusText: response.statusText
      },
      `Failed to fetch Sentry issue`
    );
    throw new Error(`Failed to fetch Sentry issue: ${response.statusText}`);
  }

  const data = await response.json();

  sentryLogger.info('Sentry issue fetched');

  return data;
};

/**
 * Normalize Sentry issue by removing unnecessary data
 *
 *
 * @param issue - The Sentry issue to normalize
 * @returns The normalized Sentry issue
 */
export const normalizeSentryIssue = (issue: SentryIssue): SentryIssue => {
  const removeKeyPaths = [
    'substatus',
    'isPublic',
    'platform',
    'metadata.in_app_frame_mix',
    'metadata.severity_reason',
    'metadata.initial_priority',
    'metadata.sdk',
    'numComments',
    'isBookmarked',
    'isSubscribed',
    'hasSeen',
    'issueType',
    'issueCategory',
    'isUnhandled',
    'count',
    'seenBy',
    'participants',
    'firstSeen',
    'firstRelease',
    'lastRelease.status',
    'lastRelease.versionInfo',
    'lastRelease.dateCreated',
    'lastRelease.newGroups',
    'lastRelease.commitCount',
    'lastRelease.lastDeploy',
    'lastRelease.projects',
    'lastRelease.id',
    'lastRelease.shortVersion',
    'lastRelease.deployCount',
    'lastRelease.firstEvent',
    'lastRelease.lastEvent',
    'lastRelease.userAgent',
    'tags',
    'activity',
    'openPeriods',
    'userReportCount',
    'stats'
  ];

  const normalizedIssue = normalizeObject(removeKeyPaths, issue as unknown as Record<string, unknown>);

  return removeNullOrEmpty(normalizedIssue) as SentryIssue;
};
