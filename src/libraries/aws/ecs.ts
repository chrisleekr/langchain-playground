import type { Logger } from 'pino';
import { ECSClient, DescribeTasksCommand, DescribeServicesCommand, type Task, type Container } from '@aws-sdk/client-ecs';
import { ResourceNotFoundException } from '@aws-sdk/client-cloudwatch-logs';

import { getEcsEventLogGroup } from './credentials';
import { AwsClientCache, buildAwsClientConfig } from './clientManager';
import { runLogsInsightsQuery, getFieldValue } from './cloudwatchLogs';
import type { ParsedTaskArn, EcsTaskInfo, ContainerInfo, EcsServiceEvent, HistoricalTaskEvent, ContainerMetricsSummary } from './types';

/**
 * Regular expression for parsing ECS task ARN.
 * Format: arn:aws:ecs:{region}:{accountId}:task/{clusterName}/{taskId}
 */
const TASK_ARN_REGEX = /^arn:aws:ecs:([^:]+):(\d+):task\/([^/]+)\/([a-zA-Z0-9-]+)$/;

/**
 * Regular expression for extracting ECS task ARNs from text.
 */
const TASK_ARN_EXTRACT_REGEX = /arn:aws:ecs:[^:]+:\d+:task\/[^/]+\/[a-zA-Z0-9-]+/g;

/** Max tasks per DescribeTasks call to reduce information overload */
const DESCRIBE_TASKS_BATCH_SIZE = 50;

/**
 * Cache of ECS clients by region.
 *
 * Uses AwsClientCache for proper lifecycle management.
 *
 * @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-reusing-connections.html
 */
const ecsClientCache = new AwsClientCache<ECSClient>(region => new ECSClient(buildAwsClientConfig(region)));

/**
 * Parse an ECS task ARN into its components.
 *
 * @param arn - Full ECS task ARN string
 * @returns Parsed ARN components or null if invalid format
 */
export const parseTaskArn = (arn: string): ParsedTaskArn | null => {
  const match = arn.match(TASK_ARN_REGEX);
  if (!match) {
    return null;
  }

  const [, region, accountId, clusterName, taskId] = match;
  if (!region || !accountId || !clusterName || !taskId) {
    return null;
  }

  return {
    region,
    accountId,
    clusterName,
    taskId,
    fullArn: arn
  };
};

/**
 * Extract ECS task ARNs from freeform text (e.g., user query).
 *
 * @param text - Freeform text that may contain ECS task ARNs
 * @returns Array of parsed task ARNs (deduplicated)
 */
export const extractTaskArnsFromText = (text: string): ParsedTaskArn[] => {
  const matches = text.match(TASK_ARN_EXTRACT_REGEX) || [];
  const uniqueArns = [...new Set(matches)];
  return uniqueArns.map(parseTaskArn).filter((parsed): parsed is ParsedTaskArn => parsed !== null);
};

/**
 * Extract ECS task ARNs from NewRelic log entries.
 *
 * @param logs - Array of log entries with potential ecs_task_arn field
 * @returns Array of parsed task ARNs (deduplicated)
 */
export const extractTaskArnsFromLogs = (logs: Record<string, unknown>[]): ParsedTaskArn[] => {
  const arns = logs.map(log => log.ecs_task_arn).filter((arn): arn is string => typeof arn === 'string' && arn.length > 0);
  const uniqueArns = [...new Set(arns)];
  return uniqueArns.map(parseTaskArn).filter((parsed): parsed is ParsedTaskArn => parsed !== null);
};

/**
 * Get or create a cached ECS client for a region.
 *
 * @param region - AWS region
 * @returns Configured ECS client
 */
const getEcsClient = (region: string): ECSClient => ecsClientCache.getClient(region);

/**
 * Clear all cached ECS clients.
 *
 * Call during graceful shutdown to clean up resources.
 */
export const clearEcsClientCache = (): void => ecsClientCache.clear();

/**
 * Map AWS SDK Container to our ContainerInfo type.
 */
const mapContainer = (container: Container): ContainerInfo => ({
  name: container.name ?? 'unknown',
  containerArn: container.containerArn,
  lastStatus: container.lastStatus,
  exitCode: container.exitCode,
  healthStatus: container.healthStatus,
  reason: container.reason,
  image: container.image,
  cpu: container.cpu,
  memory: container.memory
});

/**
 * Extract service name from task group field.
 * Group format: 'service:{serviceName}'
 */
const extractServiceName = (group?: string): string | undefined => {
  if (!group) return undefined;
  const match = group.match(/^service:(.+)$/);
  return match?.[1];
};

/**
 * Map AWS SDK Task to our EcsTaskInfo type.
 */
const mapTask = (task: Task, parsed: ParsedTaskArn): EcsTaskInfo => ({
  taskArn: task.taskArn ?? parsed.fullArn,
  parsed,
  lastStatus: task.lastStatus ?? 'UNKNOWN',
  desiredStatus: task.desiredStatus ?? 'UNKNOWN',
  healthStatus: task.healthStatus,
  stoppedReason: task.stoppedReason,
  stopCode: task.stopCode,
  containers: (task.containers ?? []).map(mapContainer),
  serviceName: extractServiceName(task.group),
  taskDefinitionArn: task.taskDefinitionArn,
  cpu: task.cpu,
  memory: task.memory,
  createdAt: task.createdAt,
  startedAt: task.startedAt,
  stoppedAt: task.stoppedAt,
  launchType: task.launchType,
  platformVersion: task.platformVersion,
  availabilityZone: task.availabilityZone
});

/**
 * Result of describeEcsTasks operation.
 */
export interface DescribeTasksResult {
  /** Successfully retrieved task information */
  tasks: EcsTaskInfo[];
  /** Task ARNs not found (may need historical lookup) */
  notFound: ParsedTaskArn[];
  /** Task ARNs that failed with errors */
  failures: Array<{ arn: string; reason: string }>;
}

/**
 * Describe ECS tasks across potentially multiple regions.
 * Tasks are grouped by region/cluster and queried in batches of 50.
 *
 * @see https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_DescribeTasks.html
 *
 * @param parsedArns - Array of parsed task ARNs to describe
 * @param logger - Logger instance
 * @returns Task information, not-found ARNs, and failures
 */
export const describeEcsTasks = async (parsedArns: ParsedTaskArn[], logger: Logger): Promise<DescribeTasksResult> => {
  const nodeLogger = logger.child({ function: 'describeEcsTasks' });

  if (parsedArns.length === 0) {
    return { tasks: [], notFound: [], failures: [] };
  }

  // Group ARNs by region and cluster
  const groupedArns = new Map<string, Map<string, ParsedTaskArn[]>>();
  for (const parsed of parsedArns) {
    const regionMap = groupedArns.get(parsed.region) ?? new Map<string, ParsedTaskArn[]>();
    const clusterArns = regionMap.get(parsed.clusterName) ?? [];
    clusterArns.push(parsed);
    regionMap.set(parsed.clusterName, clusterArns);
    groupedArns.set(parsed.region, regionMap);
  }

  const allTasks: EcsTaskInfo[] = [];
  const allNotFound: ParsedTaskArn[] = [];
  const allFailures: Array<{ arn: string; reason: string }> = [];

  // Process each region
  for (const [region, clusterMap] of groupedArns) {
    const client = getEcsClient(region);
    nodeLogger.debug({ region, clusterCount: clusterMap.size }, 'Processing region');

    // Process each cluster in the region
    for (const [clusterName, arns] of clusterMap) {
      // Batch tasks (50 per batch) to reduce information overload
      for (let i = 0; i < arns.length; i += DESCRIBE_TASKS_BATCH_SIZE) {
        const batch = arns.slice(i, i + DESCRIBE_TASKS_BATCH_SIZE);
        const taskArns = batch.map(a => a.fullArn);

        try {
          nodeLogger.debug(
            { clusterName, taskCount: taskArns.length, batchIndex: Math.floor(i / DESCRIBE_TASKS_BATCH_SIZE) },
            'Describing tasks batch'
          );

          const command = new DescribeTasksCommand({
            cluster: clusterName,
            tasks: taskArns,
            include: ['TAGS']
          });

          const response = await client.send(command);

          // Map successful responses
          const foundTaskArns = new Set<string>();
          for (const task of response.tasks ?? []) {
            if (task.taskArn) {
              foundTaskArns.add(task.taskArn);
              const parsed = batch.find(a => a.fullArn === task.taskArn);
              if (parsed) {
                allTasks.push(mapTask(task, parsed));
              }
            }
          }

          // Track failures from response
          for (const failure of response.failures ?? []) {
            if (failure.arn && failure.reason === 'MISSING') {
              const parsed = batch.find(a => a.fullArn === failure.arn);
              if (parsed) {
                allNotFound.push(parsed);
              }
            } else if (failure.arn) {
              allFailures.push({
                arn: failure.arn,
                reason: failure.reason ?? 'Unknown error'
              });
            }
          }

          // Check for ARNs not in response at all
          for (const parsed of batch) {
            if (
              !foundTaskArns.has(parsed.fullArn) &&
              !allNotFound.some(n => n.fullArn === parsed.fullArn) &&
              !allFailures.some(f => f.arn === parsed.fullArn)
            ) {
              allNotFound.push(parsed);
            }
          }
        } catch (error) {
          nodeLogger.error({ error, clusterName, batchIndex: Math.floor(i / DESCRIBE_TASKS_BATCH_SIZE) }, 'Failed to describe tasks batch');
          for (const parsed of batch) {
            allFailures.push({
              arn: parsed.fullArn,
              reason: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }
      }
    }
  }

  nodeLogger.info(
    {
      total: parsedArns.length,
      found: allTasks.length,
      notFound: allNotFound.length,
      failures: allFailures.length
    },
    'Describe tasks complete'
  );

  return {
    tasks: allTasks,
    notFound: allNotFound,
    failures: allFailures
  };
};

/**
 * Get service events from ECS DescribeServices API.
 *
 * @see https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-event-messages.html
 *
 * @param region - AWS region
 * @param clusterName - ECS cluster name
 * @param serviceName - ECS service name
 * @param logger - Logger instance
 * @returns Array of service events (up to 100 most recent)
 */
export const getServiceEvents = async (region: string, clusterName: string, serviceName: string, logger: Logger): Promise<EcsServiceEvent[]> => {
  const nodeLogger = logger.child({ function: 'getServiceEvents' });
  nodeLogger.debug({ region, clusterName, serviceName }, 'Getting service events');

  const client = getEcsClient(region);

  try {
    const command = new DescribeServicesCommand({
      cluster: clusterName,
      services: [serviceName]
    });

    const response = await client.send(command);
    const service = response.services?.[0];

    if (!service) {
      nodeLogger.warn({ serviceName }, 'Service not found');
      return [];
    }

    const events: EcsServiceEvent[] = (service.events ?? []).map(event => ({
      id: event.id,
      createdAt: event.createdAt,
      message: event.message
    }));

    nodeLogger.info({ serviceName, eventCount: events.length }, 'Service events retrieved');
    return events;
  } catch (error) {
    nodeLogger.error({ error, serviceName }, 'Failed to get service events');
    throw error;
  }
};

// =============================================================================
// ECS CloudWatch Logs Functions
// =============================================================================

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
 * Parse a result row into a HistoricalTaskEvent.
 */
const parseHistoricalTaskResultRow = (row: Array<{ field?: string; value?: string }>): HistoricalTaskEvent | null => {
  const timestampStr = getFieldValue(row, '@timestamp');
  const message = getFieldValue(row, '@message');

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

  nodeLogger.info({ region, taskId, clusterName, logGroup }, 'Querying historical task events');

  // CloudWatch Logs Insights query for ECS task state changes
  const queryString = `
    fields @timestamp, @message
    | filter @message like /${taskId}/
    | sort @timestamp desc
    | limit 100
  `;

  try {
    const results = await runLogsInsightsQuery({
      region,
      logGroupName: logGroup,
      queryString,
      startTime,
      endTime
    });

    // Parse results
    const events: HistoricalTaskEvent[] = [];
    for (const row of results) {
      const event = parseHistoricalTaskResultRow(row);
      if (event && (event.taskArn.includes(taskId) || event.taskArn === '')) {
        events.push(event);
      }
    }

    nodeLogger.info({ taskId, eventCount: events.length }, 'Historical task events retrieved');
    return events;
  } catch (error) {
    // Use proper AWS SDK exception class for type-safe error handling
    // @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/handling-exceptions.html
    if (error instanceof ResourceNotFoundException) {
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
const parseAggregatedMetricsResult = (row: Array<{ field?: string; value?: string }>): AggregatedMetricsResult | null => {
  const dataPointCount = getFieldValue(row, 'dataPointCount');
  if (!dataPointCount || parseInt(dataPointCount, 10) === 0) {
    return null;
  }

  const firstTimestampStr = getFieldValue(row, 'firstTimestamp');
  const lastTimestampStr = getFieldValue(row, 'lastTimestamp');

  // Round to 2 decimal places for cleaner output
  const round2 = (val: number): number => Math.round(val * 100) / 100;

  return {
    avgCpuUtilizationPercent: round2(parseFloat(getFieldValue(row, 'avgCpuUtilizationPercent') ?? '0')),
    maxCpuUtilizationPercent: round2(parseFloat(getFieldValue(row, 'maxCpuUtilizationPercent') ?? '0')),
    minCpuUtilizationPercent: round2(parseFloat(getFieldValue(row, 'minCpuUtilizationPercent') ?? '0')),
    avgMemoryUtilizationPercent: round2(parseFloat(getFieldValue(row, 'avgMemoryUtilizationPercent') ?? '0')),
    maxMemoryUtilizationPercent: round2(parseFloat(getFieldValue(row, 'maxMemoryUtilizationPercent') ?? '0')),
    minMemoryUtilizationPercent: round2(parseFloat(getFieldValue(row, 'minMemoryUtilizationPercent') ?? '0')),
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

  nodeLogger.info(
    { region, clusterName, taskId, logGroup, startTime: startTime.toISOString(), endTime: endTime.toISOString() },
    'Querying Container Insights performance logs with server-side aggregation'
  );

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
    const results = await runLogsInsightsQuery({
      region,
      logGroupName: logGroup,
      queryString,
      startTime,
      endTime
    });

    if (results.length === 0) {
      nodeLogger.info({ taskId, logGroup }, 'No Container Insights data found');
      return null;
    }

    // Parse the single aggregated result row
    const aggregated = parseAggregatedMetricsResult(results[0] ?? []);

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
        metrics,
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
    // Use proper AWS SDK exception class for type-safe error handling
    // @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/handling-exceptions.html
    if (error instanceof ResourceNotFoundException) {
      nodeLogger.warn({ logGroup }, 'Container Insights log group not found - Container Insights may not be enabled');
      return null;
    }

    nodeLogger.error({ error, taskId }, 'Failed to query Container Insights logs');
    throw error;
  }
};
