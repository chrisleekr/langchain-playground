import type { Logger } from 'pino';
import { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand, type ResultField } from '@aws-sdk/client-cloudwatch-logs';

import { getInvestigateCredentials, getEcsEventLogGroup } from './credentials';
import type { HistoricalTaskEvent } from './types';

/**
 * Options for querying historical task events.
 */
export interface HistoricalTaskQueryOptions {
  /** AWS region */
  region: string;
  /** ECS task ID (not full ARN) */
  taskId: string;
  /** ECS cluster name */
  clusterName: string;
  /** Log group name (optional, defaults to config value) */
  logGroupName?: string;
  /** Start time for the query */
  startTime: Date;
  /** End time for the query */
  endTime: Date;
}

/**
 * Cache of CloudWatch Logs clients by region.
 * Reused for connection pooling and keep-alive.
 *
 * Note: In concurrent scenarios, multiple clients may be created for the same region
 * before caching completes. This is acceptable as AWS SDK clients are lightweight
 * and the cache stabilizes after initial requests.
 *
 * @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-reusing-connections.html
 */
const cloudWatchLogsClientCache = new Map<string, CloudWatchLogsClient>();

/**
 * Get or create a cached CloudWatch Logs client for a region.
 *
 * Uses synchronous get-then-set pattern to minimize (but not eliminate) race conditions.
 * Client creation is synchronous, so the window for duplicate creation is minimal.
 *
 * @param region - AWS region
 * @returns Configured CloudWatch Logs client
 */
const getCloudWatchLogsClient = (region: string): CloudWatchLogsClient => {
  const existingClient = cloudWatchLogsClientCache.get(region);
  if (existingClient) {
    return existingClient;
  }

  // Create new client and cache immediately (before any async operations)
  const newClient = new CloudWatchLogsClient({
    region,
    credentials: getInvestigateCredentials()
  });
  cloudWatchLogsClientCache.set(region, newClient);
  return newClient;
};

/**
 * Wait for query to complete with timeout.
 *
 * @param client - CloudWatch Logs client
 * @param queryId - Query ID to poll
 * @param maxWaitMs - Maximum wait time in milliseconds
 * @param pollIntervalMs - Poll interval in milliseconds
 * @returns Query results
 */
const waitForQueryResults = async (
  client: CloudWatchLogsClient,
  queryId: string,
  maxWaitMs: number = 30000,
  pollIntervalMs: number = 1000
): Promise<ResultField[][]> => {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const command = new GetQueryResultsCommand({ queryId });
    const response = await client.send(command);

    if (response.status === 'Complete') {
      return response.results ?? [];
    }

    if (response.status === 'Failed' || response.status === 'Cancelled') {
      throw new Error(`Query ${response.status}`);
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error('Query timed out');
};

/**
 * Parse a result row into a HistoricalTaskEvent.
 */
const parseResultRow = (row: ResultField[]): HistoricalTaskEvent | null => {
  const getValue = (field: string): string | undefined => {
    return row.find(f => f.field === field)?.value;
  };

  const timestampStr = getValue('@timestamp');
  const message = getValue('@message');

  if (!timestampStr || !message) {
    return null;
  }

  try {
    // Parse the message as JSON (ECS task state change events are JSON)
    const parsed = JSON.parse(message);
    const detail = parsed.detail ?? parsed;

    return {
      timestamp: new Date(timestampStr),
      taskArn: detail.taskArn ?? '',
      lastStatus: detail.lastStatus ?? 'UNKNOWN',
      desiredStatus: detail.desiredStatus ?? 'UNKNOWN',
      stoppedReason: detail.stoppedReason,
      stopCode: detail.stopCode,
      clusterArn: detail.clusterArn
    };
  } catch {
    // If not JSON, return basic info
    return {
      timestamp: new Date(timestampStr),
      taskArn: '',
      lastStatus: 'UNKNOWN',
      desiredStatus: 'UNKNOWN'
    };
  }
};

/**
 * Query CloudWatch Logs for historical ECS task events.
 *
 * Useful when DescribeTasks returns no results (task stopped > 1 hour ago).
 * Requires EventBridge rule forwarding ECS task state changes to CloudWatch Logs.
 *
 * @param options - Query options
 * @param logger - Logger instance
 * @returns Array of historical task events
 */
export const queryHistoricalTaskEvents = async (options: HistoricalTaskQueryOptions, logger: Logger): Promise<HistoricalTaskEvent[]> => {
  const { region, taskId, clusterName, startTime, endTime, logGroupName } = options;

  const nodeLogger = logger.child({ function: 'queryHistoricalTaskEvents' });
  const logGroup = logGroupName ?? getEcsEventLogGroup();

  nodeLogger.debug({ region, taskId, clusterName, logGroup }, 'Querying historical task events');

  const client = getCloudWatchLogsClient(region);

  // CloudWatch Logs Insights query for ECS task state changes
  const queryString = `
    fields @timestamp, @message
    | filter @message like /${taskId}/
    | sort @timestamp desc
    | limit 100
  `;

  try {
    const startCommand = new StartQueryCommand({
      logGroupName: logGroup,
      startTime: Math.floor(startTime.getTime() / 1000),
      endTime: Math.floor(endTime.getTime() / 1000),
      queryString
    });

    const startResponse = await client.send(startCommand);
    const queryId = startResponse.queryId;

    if (!queryId) {
      throw new Error('Failed to start query - no query ID returned');
    }

    nodeLogger.debug({ queryId }, 'Query started');

    const results = await waitForQueryResults(client, queryId);

    // Parse results
    const events: HistoricalTaskEvent[] = [];
    for (const row of results) {
      const event = parseResultRow(row);
      if (event && (event.taskArn.includes(taskId) || event.taskArn === '')) {
        events.push(event);
      }
    }

    nodeLogger.info({ taskId, eventCount: events.length }, 'Historical task events retrieved');
    return events;
  } catch (error) {
    // Log group may not exist if EventBridge rule is not set up
    if (error instanceof Error && error.name === 'ResourceNotFoundException') {
      nodeLogger.warn({ logGroup }, 'Log group not found - EventBridge rule may not be configured');
      return [];
    }

    nodeLogger.error({ error, taskId }, 'Failed to query historical task events');
    throw error;
  }
};
