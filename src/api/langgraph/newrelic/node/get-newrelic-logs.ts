import config from 'config';
import { Logger } from 'pino';
import YAML from 'yaml';
import { z } from 'zod';
import { RunnableSequence } from '@langchain/core/runnables';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { ChatOllama } from '@langchain/ollama';
import {
  executeNRQLQuery,
  getNewRelicAlert,
  getNewRelicIssues,
  getNewRelicIncidents,
  normalizeLogs,
  getTraceIds,
  normalizeContextData
} from '@/libraries/newrelic';
import { removeThinkTag } from '@/libraries/langchain/utils';
import { OverallStateAnnotation } from '../investigate.post';

const extractLogNRQLQuery = PromptTemplate.fromTemplate(`
<system>
Generate a New Relic Query Language (NRQL) query to retrieve the specific log messages related to the alert incident described in the JSON data below. The goal is to get the raw log details for root cause analysis.
</system>

<contextual_information>
{context_data}
</contextual_information>

<instructions>
1. Select Log Details: Modify the SELECT statement from the original query. Instead of SELECT COUNT(*), use SELECT * to retrieve the full log entries.
2. Incorporate Original Filters: The generated query must include all the WHERE clause conditions from the original nrqlCondition.nrql.query.
3. Target Affected Services: Add a condition to the WHERE clause to specifically filter for the services listed
4. Define the Time Window: Set the time window for the query using the issues.createdAt, aggregationWindow, and aggregationDelay fields from the contextual_information.
  - Calculate the start time (SINCE) as: createdAt - aggregationWindow - aggregationDelay
  - Calculate the end time (UNTIL) as: createdAt + aggregationWindow + aggregationDelay
  - Ensure the timestamps are in epoch format (milliseconds) and directly usable in the NRQL query.
  - Do not add units (like "SECONDS" or "MINUTES") after the timestamps — just use the computed numeric values.
5. Maximize Results: Append LIMIT MAX to the end of the query to ensure you retrieve the maximum number of relevant logs within the defined limits.
</instructions>

<rules>
- Do not include 'entityName'
</rules>

{format_instructions}
`);

const extractTraceLogsNRQLQuery = PromptTemplate.fromTemplate(`
<system>
Generate a New Relic Query Language (NRQL) query to retrieve the specific log messages related to the trace ids described in the JSON data below. The goal is to get the raw log details for root cause analysis.
</system>

<contextual_information>
{context_data}
</contextual_information>

<alert_nrql_query>
{alert_nrql_query}
</alert_nrql_query>

<trace_ids>
{trace_ids}
</trace_ids>

<instructions>
1. If trace_ids is empty, then create a NRQL query based on the alert_nrql_query.
2. If trace_ids is not empty, then create a NRQL query based on the trace_ids.
  - Trace IDs: Add a condition to the WHERE clause
3. Define the Time Window: Use the timestamps from the nrql_query object. The query must start at 'SINCE' (i.e. 1753551042090) and end at 'UNTIL' (i.e. 1753595093874).
4. Maximize Results: Append LIMIT MAX to the end of the query to ensure you retrieve the maximum number of relevant logs within the defined limits.
5. Sorting Results: Append ORDER BY timestamp ASC to the end of the query to ensure you retrieve the orders in ascending order.
6. Do not add additional conditions.
7. Final query: It should look like this. Do not use this example as output.
\`\`\`
SELECT * FROM Log WHERE trace.id IN ('0821473abcdef95aa8623018cc123456') SINCE 1753551042090 UNTIL 1753595093874 LIMIT 50 ORDER BY timestamp ASC
\`\`\`
</instructions>

{format_instructions}
`);

export const getNewRelicLogsNode = (model: ChatOllama, nodeLogger: Logger) => {
  return async (state: typeof OverallStateAnnotation.State): Promise<typeof OverallStateAnnotation.State> => {
    const logger = nodeLogger.child({ node: 'get-newrelic-logs' });

    logger.info({ state }, 'OverallStateAnnotation.State');

    const { issueId } = state;

    // Get issues, incidents, alerts from New Relic
    const issues = await getNewRelicIssues({ issueIds: [issueId] });
    const incidents = await getNewRelicIncidents({ incidentIds: issues[0].incidentIds });
    const alertNRQLCondition = await getNewRelicAlert({ alertId: incidents[0].conditionFamilyId });

    // Convert issues, incidents, alertNRQLCondition to Text
    const contextData = YAML.stringify({
      issues: normalizeContextData(issues as unknown as Record<string, unknown>[]),
      incidents: normalizeContextData(incidents as unknown as Record<string, unknown>[]),
      alertNRQLCondition: normalizeContextData([alertNRQLCondition as unknown as Record<string, unknown>])
    });

    // Generate NRQL query based on the context data
    const extractLogNRQLQueryParser = StructuredOutputParser.fromZodSchema(z.object({ nrqlQuery: z.string() }));
    const extractLogInvokeParams = {
      context_data: contextData,
      format_instructions: extractLogNRQLQueryParser.getFormatInstructions()
    };
    logger.info({ compiledPrompt: await extractLogNRQLQuery.format(extractLogInvokeParams) }, 'Compiled extract log NRQL query prompt');
    const extractLogNRQLQueryChain = RunnableSequence.from([extractLogNRQLQuery, model, removeThinkTag, extractLogNRQLQueryParser]);
    const nrqlQueryResult = await extractLogNRQLQueryChain.invoke(extractLogInvokeParams);
    const nrqlQuery = nrqlQueryResult.nrqlQuery;
    logger.info({ nrqlQuery }, 'Extracted NRQL query');
    const logs = await executeNRQLQuery({ query: nrqlQuery });
    const cleanedLogs = normalizeLogs(logs);
    const traceIds = getTraceIds(cleanedLogs);

    // Get logs from trace ids
    const traceLogsNRQLQueryParser = StructuredOutputParser.fromZodSchema(z.object({ nrqlQuery: z.string() }));
    const traceLogsInvokeParams = {
      context_data: contextData,
      // Only get the first 1 trace ids to reduce the number of logs to analyze
      trace_ids: traceIds.slice(0, 1).join(','),
      alert_nrql_query: nrqlQuery,
      format_instructions: traceLogsNRQLQueryParser.getFormatInstructions()
    };
    logger.info({ compiledPrompt: await extractTraceLogsNRQLQuery.format(traceLogsInvokeParams) }, 'Compiled extract trace logs NRQL query prompt');
    const extractTraceLogsNRQLQueryChain = RunnableSequence.from([extractTraceLogsNRQLQuery, model, removeThinkTag, traceLogsNRQLQueryParser]);
    const traceLogsNRQLQueryResult = await extractTraceLogsNRQLQueryChain.invoke(traceLogsInvokeParams);
    const traceLogsNRQLQuery = traceLogsNRQLQueryResult.nrqlQuery;
    logger.info({ traceLogsNRQLQuery }, 'Extracted trace logs NRQL query');
    const traceLogs = await executeNRQLQuery({ query: traceLogsNRQLQuery });
    const normalizedLogs = normalizeLogs(traceLogs);

    return {
      ...state,
      issues,
      incidents,
      alertNRQLCondition,
      alertNRQLQuery: nrqlQuery,
      logs: cleanedLogs,
      traceIds,
      // Filter out envoy logs for generating request timeline
      envoyLogs: normalizedLogs
        .filter(
          log => log.container_name === 'envoy' && config.get<string[]>('newrelic.envoyLogs.excludeServices').includes(log.svc as string) === false
        )
        .map(log => ({
          timestampFormatted: log.timestampFormatted,
          timestamp: log.timestamp,
          direction: (log.upstreamCluster as string).startsWith('cds_ingress') ? 'ingress' : 'egress',
          svc: log.svc,
          containerName: log.container_name,
          duration: log.duration,
          responseCode: log.responseCode,
          message: log.message,
          userAgent: log.userAgent
        })),
      // Filter out envoy logs for generating service error logs
      serviceLogs: normalizedLogs.filter(log => log.container_name !== 'envoy'),
      // Filter out logs that have url related properties
      urlLogs: normalizedLogs.filter(log => {
        const properties = config.get<string[]>('newrelic.urlLogs.properties') || [];
        return properties.some(property => log[property as keyof typeof log]);
      })
    };
  };
};
