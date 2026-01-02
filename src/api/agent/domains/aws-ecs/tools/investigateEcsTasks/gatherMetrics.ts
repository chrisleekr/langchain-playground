import type { Logger } from 'pino';

import { getContainerInsightsMetrics, type ContainerMetrics, type ParsedTaskArn } from '@/libraries/aws';
import { withTimeout, getErrorMessage } from '@/api/agent/core';

/**
 * Metrics result for a single task.
 */
export interface TaskMetricsResult {
  taskId: string;
  metrics: ContainerMetrics | null;
  error: string | null;
}

/**
 * Gather Container Insights metrics for all tasks.
 * Uses current time as center with configurable window.
 *
 * @param taskArns - Array of parsed task ARNs
 * @param logger - Logger instance
 * @param timeoutMs - Timeout per API call
 * @param windowMinutes - Time window in minutes (default: 5)
 * @returns Map of taskId to metrics result
 */
export const gatherMetrics = async (
  taskArns: ParsedTaskArn[],
  logger: Logger,
  timeoutMs: number,
  windowMinutes: number = 5
): Promise<Map<string, TaskMetricsResult>> => {
  const nodeLogger = logger.child({ function: 'gatherMetrics' });

  const results = new Map<string, TaskMetricsResult>();

  if (taskArns.length === 0) {
    return results;
  }

  nodeLogger.info({ taskCount: taskArns.length, windowMinutes }, 'Gathering Container Insights metrics');

  // Use current time as center (CloudWatch gracefully returns no data for future times)
  const centerTime = new Date();

  // Process metrics in parallel
  const promises = taskArns.map(async parsed => {
    const { taskId, region, clusterName } = parsed;

    try {
      const metrics = await withTimeout(
        () =>
          getContainerInsightsMetrics(
            {
              region,
              clusterName,
              taskId,
              centerTime,
              windowMinutes
            },
            nodeLogger
          ),
        timeoutMs,
        `getContainerInsightsMetrics:${taskId}`
      );

      return {
        taskId,
        metrics,
        error: null
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      nodeLogger.warn({ taskId, error: errorMessage }, 'Failed to get metrics');

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
