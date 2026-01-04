import type { Logger } from 'pino';
import { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand, type ResultField } from '@aws-sdk/client-cloudwatch-logs';

import { getInvestigateCredentials, getEcsEventLogGroup } from './credentials';
import type { HistoricalTaskEvent, ContainerMetricsSummary } from './types';

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
 * Options for querying Container Insights performance logs.
 *
 * Uses server-side aggregation to compute avg/max/min metrics efficiently.
 * This queries the `/aws/ecs/containerinsights/{cluster}/performance` log group
 * which contains task-level metrics even in standard Container Insights mode.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights-view-metrics.html
 */
export interface ContainerInsightsLogsOptions {
  /** AWS region */
  region: string;
  /** ECS cluster name */
  clusterName: string;
  /** ECS task ID (not full ARN) */
  taskId: string;
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

/**
 * Aggregated metrics result from CloudWatch Logs Insights stats query.
 *
 * Utilization percentages are calculated per data point BEFORE aggregation,
 * ensuring accurate max/min values (not max utilized / max reserved which could
 * come from different timestamps).
 */
interface AggregatedMetricsResult {
  avgCpuUtilizationPercent: number;
  maxCpuUtilizationPercent: number;
  minCpuUtilizationPercent: number;
  avgMemoryUtilizationPercent: number;
  maxMemoryUtilizationPercent: number;
  minMemoryUtilizationPercent: number;
  dataPointCount: number;
  firstTimestamp: Date;
  lastTimestamp: Date;
}

/**
 * Parse aggregated metrics result from CloudWatch Logs Insights stats query.
 *
 * Expects utilization percentages that were calculated per-point in the query.
 */
const parseAggregatedResult = (row: ResultField[]): AggregatedMetricsResult | null => {
  const getValue = (field: string): string | undefined => {
    return row.find(f => f.field === field)?.value;
  };

  const dataPointCount = getValue('dataPointCount');
  if (!dataPointCount || parseInt(dataPointCount, 10) === 0) {
    return null;
  }

  const firstTimestampStr = getValue('firstTimestamp');
  const lastTimestampStr = getValue('lastTimestamp');

  // Round to 2 decimal places for cleaner output
  const round2 = (val: number): number => Math.round(val * 100) / 100;

  return {
    avgCpuUtilizationPercent: round2(parseFloat(getValue('avgCpuUtilizationPercent') ?? '0')),
    maxCpuUtilizationPercent: round2(parseFloat(getValue('maxCpuUtilizationPercent') ?? '0')),
    minCpuUtilizationPercent: round2(parseFloat(getValue('minCpuUtilizationPercent') ?? '0')),
    avgMemoryUtilizationPercent: round2(parseFloat(getValue('avgMemoryUtilizationPercent') ?? '0')),
    maxMemoryUtilizationPercent: round2(parseFloat(getValue('maxMemoryUtilizationPercent') ?? '0')),
    minMemoryUtilizationPercent: round2(parseFloat(getValue('minMemoryUtilizationPercent') ?? '0')),
    dataPointCount: parseInt(dataPointCount, 10),
    firstTimestamp: firstTimestampStr ? new Date(firstTimestampStr) : new Date(),
    lastTimestamp: lastTimestampStr ? new Date(lastTimestampStr) : new Date()
  };
};

/**
 * Query Container Insights performance logs for ECS task metrics.
 *
 * Uses CloudWatch Logs Insights server-side aggregation to compute metrics
 * efficiently - returns only summary values, not raw data points.
 *
 * This works with standard Container Insights mode (not just enhanced observability).
 * Queries the `/aws/ecs/containerinsights/{cluster}/performance` log group.
 *
 * @param options - Query options including time range
 * @param logger - Logger instance
 * @returns Container metrics summary, or null if no data
 */
export const queryContainerInsightsLogs = async (options: ContainerInsightsLogsOptions, logger: Logger): Promise<ContainerMetricsSummary | null> => {
  const { region, clusterName, taskId, startTime, endTime } = options;

  const nodeLogger = logger.child({ function: 'queryContainerInsightsLogs' });
  const logGroup = `/aws/ecs/containerinsights/${clusterName}/performance`;

  nodeLogger.debug(
    { region, clusterName, taskId, logGroup, startTime: startTime.toISOString(), endTime: endTime.toISOString() },
    'Querying Container Insights performance logs with server-side aggregation'
  );

  const client = getCloudWatchLogsClient(region);

  // CloudWatch Logs Insights query with server-side aggregation
  // IMPORTANT: Calculate utilization percentage PER DATA POINT before aggregating.
  // This ensures max/min utilization values are accurate (not max utilized / max reserved
  // which could come from different timestamps).
  const queryString = `
    fields CpuReserved, CpuUtilized, MemoryReserved, MemoryUtilized
    | filter ispresent(TaskId) and TaskId like /${taskId}/ and Type = "Task"
    | stats
        avg(CpuUtilized / CpuReserved * 100) as avgCpuUtilizationPercent,
        max(CpuUtilized / CpuReserved * 100) as maxCpuUtilizationPercent,
        min(CpuUtilized / CpuReserved * 100) as minCpuUtilizationPercent,
        avg(MemoryUtilized / MemoryReserved * 100) as avgMemoryUtilizationPercent,
        max(MemoryUtilized / MemoryReserved * 100) as maxMemoryUtilizationPercent,
        min(MemoryUtilized / MemoryReserved * 100) as minMemoryUtilizationPercent,
        count(*) as dataPointCount,
        min(@timestamp) as firstTimestamp,
        max(@timestamp) as lastTimestamp
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

    nodeLogger.debug({ queryId }, 'Container Insights aggregation query started');

    const results = await waitForQueryResults(client, queryId);

    if (results.length === 0) {
      nodeLogger.info({ taskId, logGroup }, 'No Container Insights data found');
      return null;
    }

    // Parse the single aggregated result row
    const aggregated = parseAggregatedResult(results[0] ?? []);

    if (!aggregated) {
      nodeLogger.info({ taskId, logGroup }, 'No valid aggregated data');
      return null;
    }

    // Utilization percentages already calculated per-point in the query
    const metrics: ContainerMetricsSummary = {
      taskId,
      clusterName,
      region,
      dataPointCount: aggregated.dataPointCount,
      firstTimestamp: aggregated.firstTimestamp,
      lastTimestamp: aggregated.lastTimestamp,
      avgCpuUtilizationPercent: aggregated.avgCpuUtilizationPercent,
      maxCpuUtilizationPercent: aggregated.maxCpuUtilizationPercent,
      minCpuUtilizationPercent: aggregated.minCpuUtilizationPercent,
      avgMemoryUtilizationPercent: aggregated.avgMemoryUtilizationPercent,
      maxMemoryUtilizationPercent: aggregated.maxMemoryUtilizationPercent,
      minMemoryUtilizationPercent: aggregated.minMemoryUtilizationPercent
    };

    nodeLogger.info(
      {
        taskId,
        dataPointCount: metrics.dataPointCount,
        timeRange: `${metrics.firstTimestamp.toISOString()} - ${metrics.lastTimestamp.toISOString()}`,
        avgCpu: metrics.avgCpuUtilizationPercent,
        maxCpu: metrics.maxCpuUtilizationPercent,
        avgMemory: metrics.avgMemoryUtilizationPercent,
        maxMemory: metrics.maxMemoryUtilizationPercent
      },
      'Container Insights metrics retrieved (server-side aggregation)'
    );

    return metrics;
  } catch (error) {
    // Log group may not exist if Container Insights is not enabled
    if (error instanceof Error && error.name === 'ResourceNotFoundException') {
      nodeLogger.warn({ logGroup }, 'Container Insights log group not found - Container Insights may not be enabled');
      return null;
    }

    nodeLogger.error({ error, taskId }, 'Failed to query Container Insights logs');
    throw error;
  }
};
