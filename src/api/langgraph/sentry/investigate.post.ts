import type { FastifyRequest, FastifyReply } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { getChatOllama, getRequestLogger, sendResponse } from '@/libraries';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { SentryEventSourceMapDebug, SentryIssue, SentryIssueEventNormalized } from '@/libraries/sentry/types';
import { getSentryIssueNode } from './node/get-sentry-issue';
import { summarizeSentryRootCauseNode } from './node/summarize-sentry-root-cause';

export const OverallStateAnnotation = Annotation.Root({
  issueId: Annotation<string>,
  projectId: Annotation<string>,
  eventId: Annotation<string | undefined>,
  issue: Annotation<SentryIssue | undefined>,
  issueEvent: Annotation<SentryIssueEventNormalized | undefined>,
  eventSourceMapDebug: Annotation<SentryEventSourceMapDebug>,
  investigationSummary: Annotation<string>
});

export default function sentryInvestigatePost() {
  return async (
    request: FastifyRequest<{
      Body: {
        issueId: string;
      };
    }>,
    reply: FastifyReply
  ): Promise<void> => {
    const logger = getRequestLogger(request.log);

    const { issueId } = request.body;

    const model = getChatOllama(logger);

    const graph = new StateGraph(OverallStateAnnotation)
      .addNode('get-sentry-issue', getSentryIssueNode(model, logger))
      .addNode('summarize-sentry-root-cause', summarizeSentryRootCauseNode(model, logger))
      .addEdge(START, 'get-sentry-issue')
      .addEdge('get-sentry-issue', 'summarize-sentry-root-cause')
      .addEdge('summarize-sentry-root-cause', END)
      .compile();

    const result = await graph.invoke({ issueId });

    await sendResponse(reply, new ServiceResponse(ResponseStatus.Success, 'OK', { ...result }, StatusCodes.OK));
  };
}
