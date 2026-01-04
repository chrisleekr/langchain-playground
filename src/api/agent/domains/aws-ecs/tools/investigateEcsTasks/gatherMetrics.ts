import type { Logger } from 'pino';

import { queryContainerInsightsLogs, type ContainerMetricsSummary, type ParsedTaskArn, type EcsTaskInfo } from '@/libraries/aws';
import { withTimeout, getErrorMessage } from '@/api/agent/core';

/**
 * Metrics result for a single task.
 */
export interface TaskMetricsResult {
  taskId: string;
  metrics: ContainerMetricsSummary | null;
  error: string | null;
}

/**
 * Time range options for metrics gathering.
 * If not provided, defaults to a window around current time.
 */
export interface MetricsTimeRange {
  /** Start time for the query */
  startTime: Date;
  /** End time for the query */
  endTime: Date;
}

/** Default lookback period in hours when no explicit time range is provided */
const DEFAULT_LOOKBACK_HOURS = 24;

/**
 * Gather Container Insights metrics for all tasks using CloudWatch Logs Insights.
 *
 * Uses server-side aggregation to compute avg/max/min metrics efficiently.
 * This queries the `/aws/ecs/containerinsights/{cluster}/performance` log group,
 * which works with standard Container Insights mode (not just enhanced observability).
 *
 * Time range behavior:
 * 1. Explicit timeRange: Use startTime/endTime directly (e.g., from New Relic alert context)
 * 2. No timeRange (default): Queries last 24 hours
 *
 * @param taskArns - Array of parsed task ARNs
 * @param _taskInfoMap - Map of taskId to EcsTaskInfo (unused, reserved for future use)
 * @param logger - Logger instance
 * @param timeoutMs - Timeout per API call
 * @param timeRange - Optional explicit time range
 * @returns Map of taskId to metrics result
 */
export const gatherMetrics = async (
  taskArns: ParsedTaskArn[],
  _taskInfoMap: Map<string, EcsTaskInfo>,
  logger: Logger,
  timeoutMs: number,
  timeRange?: MetricsTimeRange
): Promise<Map<string, TaskMetricsResult>> => {
  const nodeLogger = logger.child({ function: 'gatherMetrics' });

  const results = new Map<string, TaskMetricsResult>();

  if (taskArns.length === 0) {
    return results;
  }

  // Determine time range:
  // - Explicit timeRange: use provided range
  // - No timeRange: use last 24 hours
  const hasExplicitTimeRange = !!timeRange;
  const endTime = timeRange?.endTime ?? new Date();
  const startTime = timeRange?.startTime ?? new Date(endTime.getTime() - DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000);

  nodeLogger.info(
    {
      taskCount: taskArns.length,
      hasExplicitTimeRange,
      lookbackHours: hasExplicitTimeRange ? undefined : DEFAULT_LOOKBACK_HOURS,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    },
    'Gathering Container Insights metrics (server-side aggregation)'
  );

  // Process metrics in parallel
  const promises = taskArns.map(async parsed => {
    const { taskId, region, clusterName } = parsed;

    try {
      const metrics = await withTimeout(
        () =>
          queryContainerInsightsLogs(
            {
              region,
              clusterName,
              taskId,
              startTime,
              endTime
            },
            nodeLogger
          ),
        timeoutMs,
        `queryContainerInsightsLogs:${taskId}`
      );

      return {
        taskId,
        metrics,
        error: null
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      nodeLogger.warn({ taskId, error: errorMessage }, 'Failed to get metrics from logs');

      return {
        taskId,
        metrics: null,
        error: errorMessage
      };
    }
  });

  const settledResults = await Promise.allSettled(promises);

  for (const settled of settledResults) {
    if (settled.status === 'fulfilled') {
      results.set(settled.value.taskId, settled.value);
    } else {
      // Log rejected promises for debugging
      nodeLogger.warn(
        { reason: settled.reason instanceof Error ? settled.reason.message : String(settled.reason) },
        'Metrics promise rejected unexpectedly'
      );
    }
  }

  const successCount = Array.from(results.values()).filter(r => r.metrics !== null).length;
  nodeLogger.info(
    {
      tasksQueried: taskArns.length,
      tasksWithMetrics: successCount,
      tasksWithErrors: taskArns.length - successCount
    },
    'Metrics gathered'
  );

  return results;
};
