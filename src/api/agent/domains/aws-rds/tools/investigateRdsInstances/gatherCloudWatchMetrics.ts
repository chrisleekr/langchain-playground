import type { Logger } from 'pino';

import { queryRdsCloudWatchMetrics, type RdsInstanceInfo, type RdsMetricsSummary } from '@/libraries/aws';
import { withTimeoutAbortable, getErrorMessage } from '@/api/agent/core';

import type { InvestigationTimeRange } from './types';
import { CLOUDWATCH_METRICS } from '../../constants';

/**
 * Result of gathering metrics for a single instance.
 */
export interface InstanceMetricsResult {
  /** Instance identifier */
  instanceIdentifier: string;
  /** Metrics summary (null if unavailable) */
  metrics: RdsMetricsSummary | null;
  /** Error message if metrics couldn't be retrieved */
  error: string | null;
}

/**
 * Gather CloudWatch metrics for RDS instances.
 *
 * Queries metrics in parallel for all instances.
 *
 * @param instances - Array of resolved RDS instances
 * @param logger - Logger instance
 * @param timeoutMs - Timeout per API call
 * @param timeRange - Optional explicit time range (defaults to last 24 hours)
 * @returns Map of instance identifier to metrics result
 */
export const gatherCloudWatchMetrics = async (
  instances: RdsInstanceInfo[],
  logger: Logger,
  timeoutMs: number,
  timeRange?: InvestigationTimeRange
): Promise<Map<string, InstanceMetricsResult>> => {
  const nodeLogger = logger.child({ function: 'gatherCloudWatchMetrics', instanceCount: instances.length });

  const results = new Map<string, InstanceMetricsResult>();

  if (instances.length === 0) {
    return results;
  }

  // Determine time range
  const hasExplicitTimeRange = !!timeRange;
  const endTime = timeRange?.endTime ?? new Date();
  const startTime = timeRange?.startTime ?? new Date(endTime.getTime() - CLOUDWATCH_METRICS.DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000);

  nodeLogger.info(
    {
      hasExplicitTimeRange,
      lookbackHours: hasExplicitTimeRange ? undefined : CLOUDWATCH_METRICS.DEFAULT_LOOKBACK_HOURS,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    },
    'Gathering CloudWatch metrics'
  );

  // Query all instances in parallel
  const promises = instances.map(async instance => {
    const { instanceIdentifier, region } = instance;

    try {
      const metrics = await withTimeoutAbortable(
        signal => queryRdsCloudWatchMetrics({ instanceIdentifier, region, startTime, endTime, abortSignal: signal }, nodeLogger),
        timeoutMs,
        `queryRdsCloudWatchMetrics:${instanceIdentifier}`
      );

      return {
        instanceIdentifier,
        metrics,
        error: null
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      nodeLogger.warn({ instanceIdentifier, error: errorMessage }, 'Failed to get CloudWatch metrics');

      return {
        instanceIdentifier,
        metrics: null,
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
        'Metrics promise rejected unexpectedly'
      );
    }
  }

  const successCount = Array.from(results.values()).filter(r => r.metrics !== null).length;
  nodeLogger.info(
    {
      instancesQueried: instances.length,
      instancesWithMetrics: successCount,
      instancesWithErrors: instances.length - successCount
    },
    'CloudWatch metrics gathered'
  );

  return results;
};
