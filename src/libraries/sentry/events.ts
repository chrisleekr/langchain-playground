import config from 'config';
import {
  GetSentryIssueEventArgs,
  SentryIssueEvent,
  SentryIssueEventNormalized,
  SentryIssueEventEntryDataException,
  SentryIssueEventEntryFrame,
  SentryIssueEventEntryDataRequest
} from './types';
import { normalizeObject, removeNullOrEmpty } from './utils';
import { logger } from '../logger';
import { sentryApiUrl } from '.';

// https://docs.sentry.io/api/events/retrieve-an-issue-event/
export const getSentryIssueEvents = async ({ issueId }: GetSentryIssueEventArgs): Promise<SentryIssueEvent[]> => {
  const sentryLogger = logger.child({ function: 'getSentryIssueEvents' });
  const url = `${sentryApiUrl}/organizations/${config.get<string>('sentry.organizationSlug')}/issues/${issueId}/events/?full=true`;
  sentryLogger.info({ url }, 'Fetching Sentry issue events');
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
      `Failed to fetch Sentry issue events`
    );
    throw new Error(`Failed to fetch Sentry issue events: ${response.statusText}`);
  }

  const data = await response.json();
  sentryLogger.info('Sentry issue events fetched');
  return data;
};

export const normalizeSentryIssueEvent = (issueEvent: SentryIssueEvent): SentryIssueEventNormalized => {
  let stacktrace: SentryIssueEventNormalized['stacktrace'] = [];
  let requestInformation: SentryIssueEventNormalized['requestInformation'] = {
    url: null,
    headers: []
  };

  for (const entry of issueEvent.entries) {
    if ('type' in entry) {
      switch (entry.type) {
        case 'exception':
          const rawStacktrace = (entry.data as SentryIssueEventEntryDataException).values[0].stacktrace;

          if (
            rawStacktrace === null ||
            rawStacktrace?.frames === undefined ||
            rawStacktrace?.frames === null ||
            rawStacktrace?.frames?.length === 0
          ) {
            continue;
          }

          stacktrace = rawStacktrace.frames.map((frame: SentryIssueEventEntryFrame) => {
            return {
              compiledFile: {
                fileName: frame.filename,
                function: frame.function,
                lineNo: frame.lineNo,
                colNo: frame.colNo,
                context: frame.context?.map(([linNo, value]) => `${linNo}: ${value.replace(/\n/g, '')}`) || null
              },
              sourceFile: {
                remoteLink: null,
                function: null,
                lineNo: null,
                colNo: null,
                context: null
              }
            };
          });

          break;
        case 'request':
          const requestData = entry.data as SentryIssueEventEntryDataRequest;
          requestInformation = {
            url: requestData.url,
            headers: requestData.headers
          };
          break;
        default:
          break;
      }
    }
  }

  const user: SentryIssueEventNormalized['user'] = {
    id: issueEvent.user.id,
    email: issueEvent.user.email,
    geo: {
      country_code: issueEvent.user.geo?.country_code || null,
      city: issueEvent.user.geo?.city || null,
      region: issueEvent.user.geo?.region || null
    }
  };

  const deviceInformation: SentryIssueEventNormalized['deviceInformation'] = {
    browser: {
      browser: issueEvent.contexts?.browser?.browser as string | null,
      name: issueEvent.contexts?.browser?.name as string | null,
      version: issueEvent.contexts?.browser?.version as string | null,
      type: issueEvent.contexts?.browser?.type as string | null
    },
    os: {
      os: issueEvent.contexts?.os?.os as string | null,
      name: issueEvent.contexts?.os?.name as string | null,
      version: issueEvent.contexts?.os?.version as string | null,
      type: issueEvent.contexts?.os?.type as string | null
    }
  };

  const tags: SentryIssueEventNormalized['tags'] = issueEvent.tags.map((tag: Record<string, string>) => {
    if (['brand', 'environment', 'url', 'user_agent'].includes(tag.key)) {
      return {
        [tag.key]: tag.value
      };
    }

    return {}; // Return empty object, it will be cleaned later.
  });

  const removeContextKeyPaths = ['componentStack'];
  const additionInformation = normalizeObject(removeContextKeyPaths, issueEvent.context || {});

  const normalizedIssueEvent: SentryIssueEventNormalized = {
    title: issueEvent.title,
    location: issueEvent.location,
    user,
    platform: issueEvent.platform,
    additionInformation,
    requestInformation,
    deviceInformation,
    tags,
    stacktrace
  };

  return removeNullOrEmpty(normalizedIssueEvent) as SentryIssueEventNormalized;
};
