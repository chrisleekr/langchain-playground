import config from 'config';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import { executeNRQLQuery, normalizeLogs, getTraceIds } from '@/libraries/newrelic';
import { withTimeout, getErrorMessage } from '@/api/agent/core';

import type { DomainToolOptions } from '@/api/agent/domains/shared/types';

/**
 * Composite tool that executes NRQL and processes results in one call.
 * Replaces: execute_nrql_query + normalize_logs + filter_logs_by_type + extract_trace_ids
 */
export const createFetchAndProcessLogsTool = ({ logger, stepTimeoutMs }: DomainToolOptions) => {
  return tool(
    async ({ nrqlQuery }) => {
      const nodeLogger = logger.child({ tool: 'fetch_and_process_logs' });
      nodeLogger.info({ query: nrqlQuery, stepTimeoutMs }, 'Executing NRQL and processing logs');

      try {
        // Execute NRQL query with timeout protection
        const rawLogs = stepTimeoutMs
          ? await withTimeout(() => executeNRQLQuery({ query: nrqlQuery }), stepTimeoutMs, 'executeNRQLQuery')
          : await executeNRQLQuery({ query: nrqlQuery });
        nodeLogger.debug({ rawCount: rawLogs.length }, 'Raw logs fetched');

        const normalizedLogs = normalizeLogs(rawLogs);
        nodeLogger.debug({ normalizedCount: normalizedLogs.length }, 'Logs normalized');

        // Envoy proxy logs contain request flow metadata (duration, response codes).
        // Service logs contain application-level errors and stack traces.
        // Separating them enables targeted analysis in the analyze_logs tool.
        const urlProperties = config.get<string[]>('newrelic.urlLogs.properties') || [];
        const envoyLogs = normalizedLogs.filter((log: Record<string, unknown>) => log.container_name === 'envoy');
        const serviceLogs = normalizedLogs.filter((log: Record<string, unknown>) => log.container_name !== 'envoy');
        const urlLogs = normalizedLogs.filter((log: Record<string, unknown>) => urlProperties.some(prop => log[prop]));

        const traceIds = getTraceIds(normalizedLogs);

        nodeLogger.info(
          {
            total: normalizedLogs.length,
            envoy: envoyLogs.length,
            service: serviceLogs.length,
            url: urlLogs.length,
            traces: traceIds.length
          },
          'Logs processed'
        );

        return JSON.stringify({
          normalizedLogs,
          envoyLogs,
          serviceLogs,
          urlLogs,
          traceIds,
          summary: {
            totalLogs: normalizedLogs.length,
            envoyCount: envoyLogs.length,
            serviceCount: serviceLogs.length,
            urlCount: urlLogs.length,
            traceIdCount: traceIds.length
          }
        });
      } catch (error) {
        const message = getErrorMessage(error);
        nodeLogger.error({ error: message, query: nrqlQuery }, 'Failed to fetch and process logs');
        return JSON.stringify({ error: message, normalizedLogs: [], envoyLogs: [], serviceLogs: [], urlLogs: [], traceIds: [], summary: null });
      }
    },
    {
      name: 'fetch_and_process_logs',
      description:
        'Execute a NRQL query and automatically normalize, filter (envoy/service/url), and extract trace IDs. Returns processed logs ready for analysis.',
      schema: z.object({
        nrqlQuery: z.string().describe('The NRQL query to execute')
      })
    }
  );
};
