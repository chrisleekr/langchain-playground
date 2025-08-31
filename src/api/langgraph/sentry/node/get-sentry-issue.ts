import { Logger } from 'pino';
import { ChatOllama } from '@langchain/ollama';
import {
  extendStacktraceToSourceCode,
  getSentryIssue,
  getSentryIssueEvents,
  normalizeSentryIssue,
  normalizeSentryIssueEvent
} from '@/libraries/sentry';
import { OverallStateAnnotation } from '../investigate.post';

export const getSentryIssueNode = (_model: ChatOllama, nodeLogger: Logger) => {
  return async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
    const logger = nodeLogger.child({ node: 'get-sentry-issue' });

    const { issueId } = state;

    const issue = await getSentryIssue({ issueId });
    state.projectId = issue.project.id as string;

    const normalizedIssue = normalizeSentryIssue(issue);
    state.issue = normalizedIssue;

    const issueEvents = await getSentryIssueEvents({ issueId });
    const normalizedIssueEvent = issueEvents.length > 0 ? normalizeSentryIssueEvent(issueEvents[0]) : undefined;

    if (issueEvents.length > 0) {
      state.eventId = issueEvents[0].id;
    }
    state.issueEvent = await extendStacktraceToSourceCode(normalizedIssue, normalizedIssueEvent);

    logger.info({ normalizedIssue, normalizedIssueEvent }, 'Normalized issue and issue event');

    return state;
  };
};
