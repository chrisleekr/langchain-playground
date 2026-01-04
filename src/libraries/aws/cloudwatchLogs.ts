import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  type ResultField,
} from '@aws-sdk/client-cloudwatch-logs';

import { AwsClientCache, buildAwsClientConfig } from './clientManager';

/**
 * Cache of CloudWatch Logs clients by region.
 *
 * Uses AwsClientCache for proper lifecycle management.
 *
 * @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-reusing-connections.html
 */
const cloudWatchLogsClientCache = new AwsClientCache<CloudWatchLogsClient>(
  region => new CloudWatchLogsClient(buildAwsClientConfig(region))
);

/**
 * Get or create a cached CloudWatch Logs client for a region.
 *
 * @param region - AWS region
 * @returns Configured CloudWatch Logs client
 */
export const getCloudWatchLogsClient = (region: string): CloudWatchLogsClient =>
  cloudWatchLogsClientCache.getClient(region);

/**
 * Clear all cached CloudWatch Logs clients.
 *
 * Call during graceful shutdown to clean up resources.
 */
export const clearCloudWatchLogsClientCache = (): void => cloudWatchLogsClientCache.clear();

/**
 * Parameters for running a CloudWatch Logs Insights query.
 */
export interface LogsInsightsQueryParams {
  /** AWS region */
  region: string;
  /** Log group name to query */
  logGroupName: string;
  /** CloudWatch Logs Insights query string */
  queryString: string;
  /** Start time for the query */
  startTime: Date;
  /** End time for the query */
  endTime: Date;
  /** Maximum wait time in milliseconds (default: 30000) */
  maxWaitMs?: number;
  /** Poll interval in milliseconds (default: 1000) */
  pollIntervalMs?: number;
}

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
 * Run a CloudWatch Logs Insights query and wait for results.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html
 *
 * @param params - Query parameters
 * @returns Array of result rows (each row is an array of field/value pairs)
 */
export const runLogsInsightsQuery = async (params: LogsInsightsQueryParams): Promise<ResultField[][]> => {
  const { region, logGroupName, queryString, startTime, endTime, maxWaitMs = 30000, pollIntervalMs = 1000 } = params;

  const client = getCloudWatchLogsClient(region);

  const startCommand = new StartQueryCommand({
    logGroupName,
    startTime: Math.floor(startTime.getTime() / 1000),
    endTime: Math.floor(endTime.getTime() / 1000),
    queryString
  });

  const startResponse = await client.send(startCommand);
  const queryId = startResponse.queryId;

  if (!queryId) {
    throw new Error('Failed to start query - no query ID returned');
  }

  return waitForQueryResults(client, queryId, maxWaitMs, pollIntervalMs);
};

/**
 * Helper to extract a field value from a result row.
 *
 * @param row - Result row from Logs Insights query
 * @param field - Field name to extract
 * @returns Field value or undefined
 */
export const getFieldValue = (row: ResultField[], field: string): string | undefined => {
  return row.find(f => f.field === field)?.value;
};
