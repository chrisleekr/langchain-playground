import type { Logger } from 'pino';

import { queryHistoricalTaskEvents, type HistoricalTaskEvent, type ParsedTaskArn } from '@/libraries/aws';
import { withTimeout, getErrorMessage } from '@/api/agent/core';

/**
 * Historical events result for a single task.
 */
export interface TaskHistoricalResult {
  taskId: string;
  events: HistoricalTaskEvent[];
  error: string | null;
}

/**
 * Gather historical events for tasks not found via DescribeTasks.
 *
 * Queries CloudWatch Logs Insights for ECS task state change events.
 * Useful for tasks stopped > 1 hour ago (not available in DescribeTasks).
 * Requires EventBridge rule forwarding ECS task state changes to CloudWatch Logs.
 *
 * @param notFoundArns - Parsed task ARNs not found in DescribeTasks
 * @param logger - Logger instance
 * @param timeoutMs - Timeout per API call
 * @param lookbackHours - Hours to look back for events (default: 24)
 * @returns Map of taskId → historical events result
 */
export const gatherHistoricalEvents = async (
  notFoundArns: ParsedTaskArn[],
  logger: Logger,
  timeoutMs: number,
  lookbackHours: number = 24
): Promise<Map<string, TaskHistoricalResult>> => {
  const nodeLogger = logger.child({ function: 'gatherHistoricalEvents' });

  const results = new Map<string, TaskHistoricalResult>();

  if (notFoundArns.length === 0) {
    return results;
  }

  nodeLogger.info({ taskCount: notFoundArns.length, lookbackHours }, 'Gathering historical events for not-found tasks');

  // Calculate time range based on lookbackHours
  const now = new Date();
  const startTime = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
  const endTime = now;

  // Process historical queries in parallel
  const promises = notFoundArns.map(async parsed => {
    const { taskId, region, clusterName } = parsed;

    try {
      const events = await withTimeout(
        () =>
          queryHistoricalTaskEvents(
            {
              region,
              clusterName,
              taskId,
              startTime,
              endTime
            },
            nodeLogger
          ),
        Math.max(timeoutMs, 60000), // At least 60s for Logs Insights
        `queryHistoricalTaskEvents:${taskId}`
      );

      return {
        taskId,
        events,
        error: null
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      nodeLogger.warn({ taskId, error: errorMessage }, 'Failed to get historical events');

      return {
        taskId,
        events: [] as HistoricalTaskEvent[],
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
        'Historical events promise rejected unexpectedly'
      );
    }
  }

  const successCount = Array.from(results.values()).filter(r => r.events.length > 0).length;
  nodeLogger.info(
    {
      tasksQueried: notFoundArns.length,
      tasksWithEvents: successCount,
      tasksWithErrors: Array.from(results.values()).filter(r => r.error !== null).length
    },
    'Historical events gathered'
  );

  return results;
};
