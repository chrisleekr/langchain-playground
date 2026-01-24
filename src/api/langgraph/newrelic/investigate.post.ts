import type { FastifyRequest, FastifyReply } from 'fastify';
import { StatusCodes } from 'http-status-codes';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import { getChatOllama, getRequestLogger, sendResponse } from '@/libraries';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import {
  NewRelicGraphQLDataActorAccountAiIssuesIssuesIssuesIssue,
  NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidentsIncident,
  NewRelicGraphQLDataActorAccountAlertsNRQLCondition
} from '@/libraries/newrelic';
import { getNewRelicLogsNode } from './node/get-newrelic-logs';
import { findNewRelicRootCauseNode } from './node/find-newrelic-root-cause';

export const OverallStateAnnotation = Annotation.Root({
  issueId: Annotation<string>,
  issues: Annotation<NewRelicGraphQLDataActorAccountAiIssuesIssuesIssuesIssue[]>,
  incidents: Annotation<NewRelicGraphQLDataActorAccountAiIssuesIssuesIncidentsIncident[]>,
  alertNRQLCondition: Annotation<NewRelicGraphQLDataActorAccountAlertsNRQLCondition | null>,
  alertNRQLQuery: Annotation<string>,
  logs: Annotation<Record<string, unknown>[]>,
  traceIds: Annotation<string[]>,
  envoyLogs: Annotation<Record<string, unknown>[]>,
  serviceLogs: Annotation<Record<string, unknown>[]>,
  urlLogs: Annotation<Record<string, unknown>[]>,
  envoyTimeline: Annotation<string>,
  serviceErrorLogs: Annotation<string>,
  relevantURLs: Annotation<string>,
  investigationSummary: Annotation<string>
});

export default function newRelicInvestigatePost() {
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
      .addNode('get-newrelic-logs', getNewRelicLogsNode(model, logger))
      .addNode('find-newrelic-root-cause', findNewRelicRootCauseNode(model, logger))
      .addEdge(START, 'get-newrelic-logs')
      .addEdge('get-newrelic-logs', 'find-newrelic-root-cause')
      .addEdge('find-newrelic-root-cause', END)
      .compile();

    logger.info({ issueId }, 'Investigating issue');

    const result = await graph.invoke({ issueId });

    await sendResponse(
      reply,
      new ServiceResponse(
        ResponseStatus.Success,
        'OK',
        {
          investigationSummary: result.investigationSummary
        },
        StatusCodes.OK
      )
    );
  };
}
