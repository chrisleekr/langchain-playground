import type { Logger } from 'pino';

import { queryPerformanceInsightsSummary, type RdsInstanceInfo, type RdsPerformanceInsightsSummary } from '@/libraries/aws';
import { withTimeoutAbortable, getErrorMessage } from '@/api/agent/core';

import type { InvestigationTimeRange } from './types';
import { PERFORMANCE_INSIGHTS } from '../../constants';

/**
 * Result of gathering Top SQL for a single instance.
 */
export interface InstanceTopSQLResult {
  /** Instance identifier */
  instanceIdentifier: string;
  /** Performance Insights summary (null if unavailable) */
  performanceInsights: RdsPerformanceInsightsSummary | null;
  /** Error message if Top SQL couldn't be retrieved */
  error: string | null;
}

/**
 * Gather Top SQL queries from Performance Insights for RDS instances.
 *
 * Queries Performance Insights in parallel for all instances.
 * Only queries instances that have Performance Insights enabled.
 *
 * @param instances - Array of resolved RDS instances
 * @param logger - Logger instance
 * @param timeoutMs - Timeout per API call
 * @param topN - Maximum number of SQL queries per instance
 * @param timeRange - Optional explicit time range (defaults to last 1 hour)
 * @returns Map of instance identifier to Top SQL result
 */
export const gatherTopSQLQueries = async (
  instances: RdsInstanceInfo[],
  logger: Logger,
  timeoutMs: number,
  topN: number = PERFORMANCE_INSIGHTS.DEFAULT_TOP_N,
  timeRange?: InvestigationTimeRange
): Promise<Map<string, InstanceTopSQLResult>> => {
  const nodeLogger = logger.child({ function: 'gatherTopSQLQueries', instanceCount: instances.length, topN });

  const results = new Map<string, InstanceTopSQLResult>();

  if (instances.length === 0) {
    return results;
  }

  // Determine time range (shorter for Top SQL - typically 1 hour)
  const hasExplicitTimeRange = !!timeRange;
  const endTime = timeRange?.endTime ?? new Date();
  const startTime = timeRange?.startTime ?? new Date(endTime.getTime() - PERFORMANCE_INSIGHTS.DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000);

  // Count instances with PI enabled
  const piEnabledCount = instances.filter(i => i.performanceInsightsEnabled).length;

  nodeLogger.info(
    {
      hasExplicitTimeRange,
      lookbackHours: hasExplicitTimeRange ? undefined : PERFORMANCE_INSIGHTS.DEFAULT_LOOKBACK_HOURS,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      piEnabledCount,
      piDisabledCount: instances.length - piEnabledCount
    },
    'Gathering Top SQL queries from Performance Insights'
  );

  // Query all instances in parallel
  const promises = instances.map(async instance => {
    const { instanceIdentifier, instanceArn, dbiResourceId, region, performanceInsightsEnabled } = instance;

    try {
      const performanceInsights = await withTimeoutAbortable(
        signal =>
          queryPerformanceInsightsSummary(
            { instanceArn, dbiResourceId, region, startTime, endTime, topN, abortSignal: signal },
            performanceInsightsEnabled ?? false,
            nodeLogger
          ),
        timeoutMs,
        `queryPerformanceInsights:${instanceIdentifier}`
      );

      // Log errors returned from PI query (e.g., DbiResourceId mismatch after instance recreation)
      if (performanceInsights.error) {
        nodeLogger.warn({ instanceIdentifier, error: performanceInsights.error }, 'Performance Insights query returned error');
      }

      return {
        instanceIdentifier,
        performanceInsights,
        error: performanceInsights.error ?? null
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      nodeLogger.warn({ instanceIdentifier, error: errorMessage }, 'Failed to get Performance Insights data');

      return {
        instanceIdentifier,
        performanceInsights: null,
        error: errorMessage
      };
    }
  });

  const settledResults = await Promise.allSettled(promises);

  // Process results - errors are caught inside async function, so rejected promises are very rare
  // (only programming errors would cause rejection)
  for (const settled of settledResults) {
    if (settled.status === 'fulfilled') {
      results.set(settled.value.instanceIdentifier, settled.value);
    } else {
      // Log rejected promises for debugging - should not happen in normal operation
      nodeLogger.warn(
        { reason: settled.reason instanceof Error ? settled.reason.message : String(settled.reason) },
        'Top SQL promise rejected unexpectedly'
      );
    }
  }

  // Categorize results for accurate logging
  const resultValues = Array.from(results.values());
  const withTopSQL = resultValues.filter(r => r.performanceInsights !== null && r.performanceInsights.topSQLQueries.length > 0).length;
  const withErrors = resultValues.filter(r => r.error !== null).length;
  const noQueriesFound = resultValues.filter(
    r => r.performanceInsights !== null && r.performanceInsights.topSQLQueries.length === 0 && r.error === null
  ).length;

  nodeLogger.info(
    {
      instancesQueried: instances.length,
      instancesWithTopSQL: withTopSQL,
      instancesWithNoQueries: noQueriesFound,
      instancesWithErrors: withErrors
    },
    'Top SQL queries gathered'
  );

  return results;
};
