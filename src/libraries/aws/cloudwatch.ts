import type { Logger } from 'pino';
import { CloudWatchClient, GetMetricDataCommand, type MetricDataQuery } from '@aws-sdk/client-cloudwatch';

import { getInvestigateCredentials } from './credentials';
import type { ContainerMetrics } from './types';

/**
 * Options for querying Container Insights metrics.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights-enhanced-observability-metrics-ECS.html
 *
 * Container Insights task-level metrics require three dimensions:
 * - ClusterName + ServiceName + TaskId (for service tasks)
 * - ClusterName + TaskDefinitionFamily + TaskId (fallback)
 *
 * Either serviceName or taskDefinitionFamily must be provided.
 */
export interface ContainerMetricsOptions {
  /** AWS region */
  region: string;
  /** ECS cluster name */
  clusterName: string;
  /** ECS task ID (not full ARN) */
  taskId: string;
  /** ECS service name (required for service tasks) */
  serviceName?: string;
  /** Task definition family name (fallback if serviceName unavailable) */
  taskDefinitionFamily?: string;
  /** Center time for the query window */
  centerTime: Date;
  /** Time window in minutes (default: 5, meaning +/- 5 minutes = 10 min total) */
  windowMinutes?: number;
}

/**
 * Cache of CloudWatch clients by region.
 * Reused for connection pooling and keep-alive.
 *
 * Note: In concurrent scenarios, multiple clients may be created for the same region
 * before caching completes. This is acceptable as AWS SDK clients are lightweight
 * and the cache stabilizes after initial requests.
 *
 * @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-reusing-connections.html
 */
const cloudWatchClientCache = new Map<string, CloudWatchClient>();

/**
 * Get or create a cached CloudWatch client for a region.
 *
 * Uses synchronous get-then-set pattern to minimize (but not eliminate) race conditions.
 * Client creation is synchronous, so the window for duplicate creation is minimal.
 *
 * @param region - AWS region
 * @returns Configured CloudWatch client
 */
const getCloudWatchClient = (region: string): CloudWatchClient => {
  const existingClient = cloudWatchClientCache.get(region);
  if (existingClient) {
    return existingClient;
  }

  // Create new client and cache immediately (before any async operations)
  const newClient = new CloudWatchClient({
    region,
    credentials: getInvestigateCredentials()
  });
  cloudWatchClientCache.set(region, newClient);
  return newClient;
};

/**
 * Calculate utilization percentage, handling edge cases.
 */
const calculateUtilizationPercent = (utilized: number, reserved: number): number => {
  if (reserved <= 0) return 0;
  return Math.round((utilized / reserved) * 100 * 100) / 100; // 2 decimal places
};

/**
 * Calculate average of an array of numbers.
 */
const average = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, val) => sum + val, 0) / arr.length;
};

/**
 * Get Container Insights metrics for an ECS task.
 *
 * Queries the ECS/ContainerInsights namespace for CPU and Memory utilization.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights-enhanced-observability-metrics-ECS.html
 *
 * @param options - Query options
 * @param logger - Logger instance
 * @returns Container metrics with utilization percentages
 */
export const getContainerInsightsMetrics = async (options: ContainerMetricsOptions, logger: Logger): Promise<ContainerMetrics> => {
  const { region, clusterName, taskId, serviceName, taskDefinitionFamily, centerTime, windowMinutes = 5 } = options;

  const nodeLogger = logger.child({ function: 'getContainerInsightsMetrics' });

  // Build dimensions - AWS Container Insights requires 3 dimensions for task-level metrics:
  // Either: ClusterName + ServiceName + TaskId
  // Or: ClusterName + TaskDefinitionFamily + TaskId
  // @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Container-Insights-enhanced-observability-metrics-ECS.html
  const dimensions: Array<{ Name: string; Value: string }> = [{ Name: 'ClusterName', Value: clusterName }];

  if (serviceName) {
    dimensions.push({ Name: 'ServiceName', Value: serviceName });
  } else if (taskDefinitionFamily) {
    dimensions.push({ Name: 'TaskDefinitionFamily', Value: taskDefinitionFamily });
  } else {
    nodeLogger.warn({ taskId, clusterName }, 'Neither serviceName nor taskDefinitionFamily provided - metrics query may return no data');
  }

  dimensions.push({ Name: 'TaskId', Value: taskId });

  nodeLogger.debug(
    { region, clusterName, taskId, serviceName, taskDefinitionFamily, windowMinutes, dimensionCount: dimensions.length },
    'Getting Container Insights metrics'
  );

  const startTime = new Date(centerTime.getTime() - windowMinutes * 60 * 1000);
  const endTime = new Date(centerTime.getTime() + windowMinutes * 60 * 1000);

  const client = getCloudWatchClient(region);

  // Define metric queries for Container Insights
  const metricDataQueries: MetricDataQuery[] = [
    {
      Id: 'cpuUtilized',
      MetricStat: {
        Metric: {
          Namespace: 'ECS/ContainerInsights',
          MetricName: 'CpuUtilized',
          Dimensions: dimensions
        },
        Period: 60,
        Stat: 'Average'
      },
      ReturnData: true
    },
    {
      Id: 'cpuReserved',
      MetricStat: {
        Metric: {
          Namespace: 'ECS/ContainerInsights',
          MetricName: 'CpuReserved',
          Dimensions: dimensions
        },
        Period: 60,
        Stat: 'Average'
      },
      ReturnData: true
    },
    {
      Id: 'memoryUtilized',
      MetricStat: {
        Metric: {
          Namespace: 'ECS/ContainerInsights',
          MetricName: 'MemoryUtilized',
          Dimensions: dimensions
        },
        Period: 60,
        Stat: 'Average'
      },
      ReturnData: true
    },
    {
      Id: 'memoryReserved',
      MetricStat: {
        Metric: {
          Namespace: 'ECS/ContainerInsights',
          MetricName: 'MemoryReserved',
          Dimensions: dimensions
        },
        Period: 60,
        Stat: 'Average'
      },
      ReturnData: true
    }
  ];

  try {
    const command = new GetMetricDataCommand({
      MetricDataQueries: metricDataQueries,
      StartTime: startTime,
      EndTime: endTime,
      ScanBy: 'TimestampAscending'
    });

    const response = await client.send(command);

    // Extract metric values
    const cpuUtilizedResult = response.MetricDataResults?.find(r => r.Id === 'cpuUtilized');
    const cpuReservedResult = response.MetricDataResults?.find(r => r.Id === 'cpuReserved');
    const memoryUtilizedResult = response.MetricDataResults?.find(r => r.Id === 'memoryUtilized');
    const memoryReservedResult = response.MetricDataResults?.find(r => r.Id === 'memoryReserved');

    const cpuUtilized = cpuUtilizedResult?.Values ?? [];
    const cpuReserved = cpuReservedResult?.Values ?? [];
    const memoryUtilized = memoryUtilizedResult?.Values ?? [];
    const memoryReserved = memoryReservedResult?.Values ?? [];
    const timestamps = (cpuUtilizedResult?.Timestamps ?? []).map(t => new Date(t));

    // Calculate utilization percentages
    // Only calculate if we have both utilized AND reserved data to avoid incorrect values
    const cpuUtilizationPercent: number[] = [];
    const memoryUtilizationPercent: number[] = [];
    let cpuReservedFallbackUsed = false;
    let memoryReservedFallbackUsed = false;

    // Get fallback reserved values (first data point if available)
    const cpuReservedFallback = cpuReserved[0];
    const memoryReservedFallback = memoryReserved[0];

    // Warn if no reserved metrics are available - utilization cannot be calculated accurately
    if (cpuUtilized.length > 0 && cpuReserved.length === 0) {
      nodeLogger.warn(
        { taskId },
        'No CPU reserved metrics available - utilization percentages will be empty. Container Insights may not be enabled.'
      );
    }

    if (memoryUtilized.length > 0 && memoryReserved.length === 0) {
      nodeLogger.warn(
        { taskId },
        'No Memory reserved metrics available - utilization percentages will be empty. Container Insights may not be enabled.'
      );
    }

    for (let i = 0; i < cpuUtilized.length; i++) {
      const cpuUtil = cpuUtilized[i] ?? 0;
      let cpuRes = cpuReserved[i];
      if (cpuRes === undefined) {
        // Only use fallback if we have at least one reserved data point
        if (cpuReservedFallback !== undefined) {
          cpuRes = cpuReservedFallback;
          cpuReservedFallbackUsed = true;
        } else {
          // Skip this data point - cannot calculate utilization without reserved value
          continue;
        }
      }
      cpuUtilizationPercent.push(calculateUtilizationPercent(cpuUtil, cpuRes));
    }

    for (let i = 0; i < memoryUtilized.length; i++) {
      const memUtil = memoryUtilized[i] ?? 0;
      let memRes = memoryReserved[i];
      if (memRes === undefined) {
        // Only use fallback if we have at least one reserved data point
        if (memoryReservedFallback !== undefined) {
          memRes = memoryReservedFallback;
          memoryReservedFallbackUsed = true;
        } else {
          // Skip this data point - cannot calculate utilization without reserved value
          continue;
        }
      }
      memoryUtilizationPercent.push(calculateUtilizationPercent(memUtil, memRes));
    }

    if (cpuReservedFallbackUsed || memoryReservedFallbackUsed) {
      nodeLogger.debug(
        { taskId, cpuReservedFallbackUsed, memoryReservedFallbackUsed },
        'Reserved metric data points misaligned, using fallback values from first data point'
      );
    }

    const metrics: ContainerMetrics = {
      taskId,
      clusterName,
      region,
      cpuUtilized,
      cpuReserved,
      memoryUtilized,
      memoryReserved,
      timestamps,
      cpuUtilizationPercent,
      memoryUtilizationPercent,
      avgCpuUtilizationPercent: Math.round(average(cpuUtilizationPercent) * 100) / 100,
      avgMemoryUtilizationPercent: Math.round(average(memoryUtilizationPercent) * 100) / 100,
      maxCpuUtilizationPercent: cpuUtilizationPercent.length > 0 ? Math.max(...cpuUtilizationPercent) : 0,
      maxMemoryUtilizationPercent: memoryUtilizationPercent.length > 0 ? Math.max(...memoryUtilizationPercent) : 0
    };

    nodeLogger.info(
      {
        taskId,
        dataPoints: timestamps.length,
        avgCpu: metrics.avgCpuUtilizationPercent,
        avgMemory: metrics.avgMemoryUtilizationPercent,
        maxCpu: metrics.maxCpuUtilizationPercent,
        maxMemory: metrics.maxMemoryUtilizationPercent
      },
      'Container Insights metrics retrieved'
    );

    return metrics;
  } catch (error) {
    nodeLogger.error({ error, taskId }, 'Failed to get Container Insights metrics');
    throw error;
  }
};
