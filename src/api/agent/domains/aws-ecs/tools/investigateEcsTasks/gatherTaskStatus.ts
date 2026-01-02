import type { Logger } from 'pino';

import { describeEcsTasks, type ParsedTaskArn, type DescribeTasksResult } from '@/libraries/aws';
import { withTimeout, getErrorMessage } from '@/api/agent/core';

/**
 * Gather task status for all provided task ARNs.
 *
 * @param taskArns - Array of parsed task ARNs
 * @param logger - Logger instance
 * @param timeoutMs - Timeout for the API call
 * @returns DescribeTasks result with tasks, notFound, and failures
 */
export const gatherTaskStatus = async (
  taskArns: ParsedTaskArn[],
  logger: Logger,
  timeoutMs: number
): Promise<{ result: DescribeTasksResult | null; error: string | null }> => {
  const nodeLogger = logger.child({ function: 'gatherTaskStatus' });

  if (taskArns.length === 0) {
    return {
      result: { tasks: [], notFound: [], failures: [] },
      error: null
    };
  }

  nodeLogger.info({ taskCount: taskArns.length }, 'Gathering task status');

  try {
    const result = await withTimeout(() => describeEcsTasks(taskArns, nodeLogger), timeoutMs, 'describeEcsTasks');

    nodeLogger.info(
      {
        found: result.tasks.length,
        notFound: result.notFound.length,
        failures: result.failures.length
      },
      'Task status gathered'
    );

    return { result, error: null };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    nodeLogger.error({ error: errorMessage }, 'Failed to gather task status');
    return { result: null, error: errorMessage };
  }
};
