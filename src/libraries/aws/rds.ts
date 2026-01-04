import type { Logger } from 'pino';
import {
  RDSClient,
  DescribeDBInstancesCommand,
  DescribeDBClustersCommand,
  DBInstanceNotFoundFault,
  DBClusterNotFoundFault,
  type DBInstance,
  type DBCluster
} from '@aws-sdk/client-rds';
import type { MetricDataQuery } from '@aws-sdk/client-cloudwatch';

import { AwsClientCache, buildAwsClientConfig } from './clientManager';
import { queryCloudWatchMetrics, extractMetricValue, getTimestampRange } from './cloudwatch';
import type { RdsIdentifierInput, RdsInstanceInfo, RdsClusterInfo, RdsClusterMember, RdsMetricsSummary } from './types';

/**
 * Cache of RDS clients by region.
 *
 * Uses AwsClientCache for proper lifecycle management.
 *
 * @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/creating-and-calling-service-objects.html
 */
const rdsClientCache = new AwsClientCache<RDSClient>(region => new RDSClient(buildAwsClientConfig(region)));

/**
 * Get or create a cached RDS client for a region.
 *
 * @param region - AWS region
 * @returns Configured RDS client
 */
const getRdsClient = (region: string): RDSClient => rdsClientCache.getClient(region);

/**
 * Clear all cached RDS clients.
 *
 * Call during graceful shutdown to clean up resources.
 */
export const clearRdsClientCache = (): void => rdsClientCache.clear();

/**
 * Map a DBInstance from AWS SDK to our RdsInstanceInfo type.
 */
const mapDbInstanceToInfo = (instance: DBInstance, region: string, isClusterWriter?: boolean): RdsInstanceInfo => {
  return {
    instanceIdentifier: instance.DBInstanceIdentifier ?? '',
    instanceArn: instance.DBInstanceArn ?? '',
    dbiResourceId: instance.DbiResourceId,
    clusterIdentifier: instance.DBClusterIdentifier,
    instanceClass: instance.DBInstanceClass ?? '',
    engine: instance.Engine ?? '',
    engineVersion: instance.EngineVersion ?? '',
    status: instance.DBInstanceStatus ?? '',
    isClusterWriter,
    availabilityZone: instance.AvailabilityZone,
    endpoint: instance.Endpoint?.Address,
    port: instance.Endpoint?.Port,
    performanceInsightsEnabled: instance.PerformanceInsightsEnabled,
    performanceInsightsRetentionPeriod: instance.PerformanceInsightsRetentionPeriod,
    createdAt: instance.InstanceCreateTime,
    region
  };
};

/**
 * Map a DBCluster from AWS SDK to our RdsClusterInfo type.
 */
const mapDbClusterToInfo = (cluster: DBCluster): RdsClusterInfo => {
  const members: RdsClusterMember[] =
    cluster.DBClusterMembers?.map(member => ({
      instanceIdentifier: member.DBInstanceIdentifier ?? '',
      isClusterWriter: member.IsClusterWriter ?? false
    })) ?? [];

  return {
    clusterIdentifier: cluster.DBClusterIdentifier ?? '',
    clusterArn: cluster.DBClusterArn ?? '',
    status: cluster.Status ?? '',
    engine: cluster.Engine ?? '',
    engineVersion: cluster.EngineVersion ?? '',
    endpoint: cluster.Endpoint,
    readerEndpoint: cluster.ReaderEndpoint,
    port: cluster.Port,
    masterUsername: cluster.MasterUsername,
    availabilityZones: cluster.AvailabilityZones ?? [],
    members,
    performanceInsightsEnabled: cluster.PerformanceInsightsEnabled,
    createdAt: cluster.ClusterCreateTime
  };
};

/**
 * Describe a single DB instance by identifier.
 *
 * @param instanceId - DB instance identifier
 * @param region - AWS region
 * @param logger - Logger instance
 * @returns Instance info or null if not found
 */
export const describeDBInstance = async (instanceId: string, region: string, logger: Logger): Promise<RdsInstanceInfo | null> => {
  const nodeLogger = logger.child({ function: 'describeDBInstance', instanceId, region });
  const client = getRdsClient(region);

  try {
    const command = new DescribeDBInstancesCommand({
      DBInstanceIdentifier: instanceId
    });
    const response = await client.send(command);

    const instance = response.DBInstances?.[0];
    if (!instance) {
      nodeLogger.info('DB instance not found');
      return null;
    }

    nodeLogger.info({ status: instance.DBInstanceStatus }, 'DB instance found');
    return mapDbInstanceToInfo(instance, region);
  } catch (error) {
    // Use proper AWS SDK exception class for type-safe error handling
    // @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/handling-exceptions.html
    if (error instanceof DBInstanceNotFoundFault) {
      nodeLogger.info('DB instance not found (DBInstanceNotFoundFault)');
      return null;
    }
    throw error;
  }
};

/**
 * Describe a DB cluster by identifier.
 *
 * @param clusterId - DB cluster identifier
 * @param region - AWS region
 * @param logger - Logger instance
 * @returns Cluster info or null if not found
 */
export const describeDBCluster = async (clusterId: string, region: string, logger: Logger): Promise<RdsClusterInfo | null> => {
  const nodeLogger = logger.child({ function: 'describeDBCluster', clusterId, region });
  const client = getRdsClient(region);

  try {
    const command = new DescribeDBClustersCommand({
      DBClusterIdentifier: clusterId
    });
    const response = await client.send(command);

    const cluster = response.DBClusters?.[0];
    if (!cluster) {
      nodeLogger.info('DB cluster not found');
      return null;
    }

    nodeLogger.info({ status: cluster.Status, memberCount: cluster.DBClusterMembers?.length }, 'DB cluster found');
    return mapDbClusterToInfo(cluster);
  } catch (error) {
    // Use proper AWS SDK exception class for type-safe error handling
    // @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/handling-exceptions.html
    if (error instanceof DBClusterNotFoundFault) {
      nodeLogger.info('DB cluster not found (DBClusterNotFoundFault)');
      return null;
    }
    throw error;
  }
};

/**
 * Resolve a cluster identifier to all its member instances.
 *
 * @param clusterId - DB cluster identifier
 * @param region - AWS region
 * @param logger - Logger instance
 * @returns Array of cluster members with their writer status
 */
export const resolveClusterToInstances = async (clusterId: string, region: string, logger: Logger): Promise<RdsClusterMember[]> => {
  const cluster = await describeDBCluster(clusterId, region, logger);
  if (!cluster) {
    return [];
  }
  return cluster.members;
};

/**
 * Smart resolver: resolves an identifier to instance info.
 *
 * Resolution logic:
 * 1. First try DescribeDBInstances with the identifier
 * 2. If found, return that single instance
 * 3. If not found, try DescribeDBClusters
 * 4. If cluster found, get all member instances via DescribeDBInstances
 *
 * @param input - Identifier input with region
 * @param logger - Logger instance
 * @returns Array of resolved instance info (empty if nothing found)
 */
export const resolveToInstances = async (input: RdsIdentifierInput, logger: Logger): Promise<RdsInstanceInfo[]> => {
  const nodeLogger = logger.child({ function: 'resolveToInstances', identifier: input.identifier, region: input.region });

  // Step 1: Try as instance identifier first
  nodeLogger.debug('Trying as instance identifier');
  const instance = await describeDBInstance(input.identifier, input.region, logger);
  if (instance) {
    nodeLogger.info({ instanceId: instance.instanceIdentifier }, 'Resolved as single instance');
    return [instance];
  }

  // Step 2: Try as cluster identifier
  nodeLogger.debug('Not found as instance, trying as cluster identifier');
  const cluster = await describeDBCluster(input.identifier, input.region, logger);
  if (!cluster) {
    nodeLogger.warn('Identifier not found as instance or cluster');
    return [];
  }

  // Step 3: Resolve all cluster members to full instance info
  nodeLogger.info({ clusterId: cluster.clusterIdentifier, memberCount: cluster.members.length }, 'Resolved as cluster');

  const instancePromises = cluster.members.map(async (member): Promise<RdsInstanceInfo | null> => {
    const memberInstance = await describeDBInstance(member.instanceIdentifier, input.region, logger);
    if (memberInstance) {
      // Enrich with writer status from cluster info
      memberInstance.isClusterWriter = member.isClusterWriter;
      return memberInstance;
    }
    nodeLogger.warn(
      { memberId: member.instanceIdentifier, clusterId: cluster.clusterIdentifier },
      'Cluster member could not be resolved - instance may have been deleted or is in a transitional state'
    );
    return null;
  });

  const instances = await Promise.all(instancePromises);
  const validInstances = instances.filter((inst): inst is RdsInstanceInfo => inst !== null);

  nodeLogger.info({ resolvedCount: validInstances.length }, 'Resolved cluster members to instances');
  return validInstances;
};

/**
 * Batch resolve multiple identifiers to instances.
 * Handles deduplication of instances that might be resolved multiple times
 * (e.g., if both cluster and one of its instances are provided).
 *
 * @param inputs - Array of identifier inputs
 * @param logger - Logger instance
 * @returns Map of original identifier to resolved instances
 */
export const batchResolveToInstances = async (inputs: RdsIdentifierInput[], logger: Logger): Promise<Map<string, RdsInstanceInfo[]>> => {
  const nodeLogger = logger.child({ function: 'batchResolveToInstances', inputCount: inputs.length });
  const results = new Map<string, RdsInstanceInfo[]>();

  // Process in parallel
  const promises = inputs.map(async input => {
    const instances = await resolveToInstances(input, logger);
    nodeLogger.info({ identifier: input.identifier, instances: instances.length }, 'Resolved to instances');
    nodeLogger.debug({ identifier: input.identifier, instances }, 'Resolved instances details');
    return { identifier: input.identifier, instances };
  });

  const settled = await Promise.allSettled(promises);

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.set(result.value.identifier, result.value.instances);
    } else {
      nodeLogger.warn({ reason: result.reason }, 'Failed to resolve identifier');
    }
  }

  nodeLogger.info({ resolvedCount: results.size }, 'Batch resolution complete');
  return results;
};

/**
 * Get all unique instances from batch resolution results.
 * Deduplicates by instance ARN.
 *
 * @param resolutionMap - Map from batchResolveToInstances
 * @param logger - Logger instance
 * @returns Array of unique instances
 */
export const getUniqueInstances = (resolutionMap: Map<string, RdsInstanceInfo[]>, logger: Logger): RdsInstanceInfo[] => {
  const nodeLogger = logger.child({ function: 'getUniqueInstances', resolutionMap: resolutionMap.size });
  const seen = new Set<string>();
  const unique: RdsInstanceInfo[] = [];

  for (const instances of resolutionMap.values()) {
    for (const instance of instances) {
      if (!seen.has(instance.instanceArn)) {
        seen.add(instance.instanceArn);
        unique.push(instance);
      }
    }
  }

  nodeLogger.info({ uniqueCount: unique.length }, 'Unique instances retrieved');
  nodeLogger.debug({ unique }, 'Unique instances details');
  return unique;
};

// =============================================================================
// RDS CloudWatch Metrics
// =============================================================================

/**
 * RDS CloudWatch metrics to query.
 * Each metric has an ID, metric name, and statistic.
 *
 * @see https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.AuroraMonitoring.Metrics.html
 */
const RDS_METRICS = [
  // Core metrics (requested)
  { id: 'cpuUtilization', metricName: 'CPUUtilization', stat: 'Average' },
  { id: 'cpuUtilizationMax', metricName: 'CPUUtilization', stat: 'Maximum' },
  { id: 'freeableMemory', metricName: 'FreeableMemory', stat: 'Average' },
  { id: 'freeableMemoryMin', metricName: 'FreeableMemory', stat: 'Minimum' },
  { id: 'databaseConnections', metricName: 'DatabaseConnections', stat: 'Average' },
  { id: 'databaseConnectionsMax', metricName: 'DatabaseConnections', stat: 'Maximum' },
  { id: 'commitThroughput', metricName: 'CommitThroughput', stat: 'Average' },
  { id: 'commitThroughputMax', metricName: 'CommitThroughput', stat: 'Maximum' },
  { id: 'deadlocks', metricName: 'Deadlocks', stat: 'Average' },
  { id: 'deadlocksMax', metricName: 'Deadlocks', stat: 'Maximum' },

  // I/O metrics
  { id: 'readIOPS', metricName: 'ReadIOPS', stat: 'Average' },
  { id: 'readIOPSMax', metricName: 'ReadIOPS', stat: 'Maximum' },
  { id: 'writeIOPS', metricName: 'WriteIOPS', stat: 'Average' },
  { id: 'writeIOPSMax', metricName: 'WriteIOPS', stat: 'Maximum' },
  { id: 'readLatency', metricName: 'ReadLatency', stat: 'Average' },
  { id: 'readLatencyMax', metricName: 'ReadLatency', stat: 'Maximum' },
  { id: 'writeLatency', metricName: 'WriteLatency', stat: 'Average' },
  { id: 'writeLatencyMax', metricName: 'WriteLatency', stat: 'Maximum' },

  // Network metrics
  { id: 'networkReceive', metricName: 'NetworkReceiveThroughput', stat: 'Average' },
  { id: 'networkTransmit', metricName: 'NetworkTransmitThroughput', stat: 'Average' },

  // Aurora-specific metrics
  { id: 'auroraReplicaLag', metricName: 'AuroraReplicaLag', stat: 'Average' },
  { id: 'auroraReplicaLagMax', metricName: 'AuroraReplicaLag', stat: 'Maximum' },
  { id: 'bufferCacheHitRatio', metricName: 'BufferCacheHitRatio', stat: 'Average' },

  // Disk metrics
  { id: 'diskQueueDepth', metricName: 'DiskQueueDepth', stat: 'Average' },
  { id: 'diskQueueDepthMax', metricName: 'DiskQueueDepth', stat: 'Maximum' },
  { id: 'swapUsage', metricName: 'SwapUsage', stat: 'Average' },
  { id: 'swapUsageMax', metricName: 'SwapUsage', stat: 'Maximum' }
] as const;

/**
 * Build metric data queries for an RDS DB instance.
 *
 * @param instanceIdentifier - DB instance identifier
 * @returns Array of metric data queries for AWS/RDS namespace
 */
const buildRdsMetricQueries = (instanceIdentifier: string): MetricDataQuery[] => {
  return RDS_METRICS.map(metric => ({
    Id: metric.id,
    MetricStat: {
      Metric: {
        Namespace: 'AWS/RDS',
        MetricName: metric.metricName,
        Dimensions: [
          {
            Name: 'DBInstanceIdentifier',
            Value: instanceIdentifier
          }
        ]
      },
      Period: 60, // 1-minute granularity
      Stat: metric.stat
    },
    ReturnData: true
  }));
};

/**
 * Parameters for querying RDS CloudWatch metrics.
 */
export interface QueryRdsMetricsParams {
  /** DB instance identifier */
  instanceIdentifier: string;
  /** AWS region */
  region: string;
  /** Start time for metrics query */
  startTime: Date;
  /** End time for metrics query */
  endTime: Date;
  /** Optional abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Query CloudWatch metrics for an RDS instance.
 *
 * Uses GetMetricData API for efficient batch retrieval of multiple metrics.
 * Handles pagination to retrieve all data points.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_GetMetricData.html
 *
 * @param params - Query parameters
 * @param logger - Logger instance
 * @returns RDS metrics summary
 */
export const queryRdsCloudWatchMetrics = async (params: QueryRdsMetricsParams, logger: Logger): Promise<RdsMetricsSummary> => {
  const { instanceIdentifier, region, startTime, endTime, abortSignal } = params;
  const nodeLogger = logger.child({
    function: 'queryRdsCloudWatchMetrics',
    instanceIdentifier,
    region,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString()
  });

  const metricQueries = buildRdsMetricQueries(instanceIdentifier);
  nodeLogger.info({ metricCount: metricQueries.length }, 'Querying CloudWatch metrics for RDS');

  const allResults = await queryCloudWatchMetrics({
    region,
    metricQueries,
    startTime,
    endTime,
    abortSignal
  });

  nodeLogger.info({ resultCount: allResults.length }, 'Received metric results');

  const { firstTimestamp, lastTimestamp, dataPointCount } = getTimestampRange(allResults);

  const summary: RdsMetricsSummary = {
    instanceIdentifier,
    region,
    dataPointCount,
    firstTimestamp,
    lastTimestamp,

    // CPU metrics
    avgCpuUtilizationPercent: extractMetricValue(allResults, 'cpuUtilization', 'average'),
    maxCpuUtilizationPercent: extractMetricValue(allResults, 'cpuUtilizationMax', 'maximum'),

    // Memory metrics
    avgFreeableMemoryBytes: extractMetricValue(allResults, 'freeableMemory', 'average'),
    minFreeableMemoryBytes: extractMetricValue(allResults, 'freeableMemoryMin', 'minimum'),

    // Database connections
    avgDatabaseConnections: extractMetricValue(allResults, 'databaseConnections', 'average'),
    maxDatabaseConnections: extractMetricValue(allResults, 'databaseConnectionsMax', 'maximum'),

    // Throughput metrics
    avgCommitThroughput: extractMetricValue(allResults, 'commitThroughput', 'average'),
    maxCommitThroughput: extractMetricValue(allResults, 'commitThroughputMax', 'maximum'),

    // I/O metrics
    avgReadIOPS: extractMetricValue(allResults, 'readIOPS', 'average'),
    maxReadIOPS: extractMetricValue(allResults, 'readIOPSMax', 'maximum'),
    avgWriteIOPS: extractMetricValue(allResults, 'writeIOPS', 'average'),
    maxWriteIOPS: extractMetricValue(allResults, 'writeIOPSMax', 'maximum'),
    avgReadLatencySeconds: extractMetricValue(allResults, 'readLatency', 'average'),
    maxReadLatencySeconds: extractMetricValue(allResults, 'readLatencyMax', 'maximum'),
    avgWriteLatencySeconds: extractMetricValue(allResults, 'writeLatency', 'average'),
    maxWriteLatencySeconds: extractMetricValue(allResults, 'writeLatencyMax', 'maximum'),

    // Network metrics
    avgNetworkReceiveThroughput: extractMetricValue(allResults, 'networkReceive', 'average'),
    avgNetworkTransmitThroughput: extractMetricValue(allResults, 'networkTransmit', 'average'),

    // Aurora-specific metrics
    avgAuroraReplicaLagMs: extractMetricValue(allResults, 'auroraReplicaLag', 'average'),
    maxAuroraReplicaLagMs: extractMetricValue(allResults, 'auroraReplicaLagMax', 'maximum'),
    avgBufferCacheHitRatio: extractMetricValue(allResults, 'bufferCacheHitRatio', 'average'),
    avgDeadlocks: extractMetricValue(allResults, 'deadlocks', 'average'),
    maxDeadlocks: extractMetricValue(allResults, 'deadlocksMax', 'maximum'),

    // Disk metrics
    avgDiskQueueDepth: extractMetricValue(allResults, 'diskQueueDepth', 'average'),
    maxDiskQueueDepth: extractMetricValue(allResults, 'diskQueueDepthMax', 'maximum'),
    avgSwapUsageBytes: extractMetricValue(allResults, 'swapUsage', 'average'),
    maxSwapUsageBytes: extractMetricValue(allResults, 'swapUsageMax', 'maximum')
  };

  nodeLogger.info(
    {
      summary,
      dataPointCount,
      hasMetrics: dataPointCount > 0,
      cpuUtilization: summary.avgCpuUtilizationPercent,
      databaseConnections: summary.avgDatabaseConnections
    },
    'CloudWatch metrics query complete'
  );

  return summary;
};
