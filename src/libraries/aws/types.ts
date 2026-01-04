/**
 * Shared AWS types for ECS and RDS investigation.
 */

/**
 * Parsed ECS task ARN components.
 * ARN format: arn:aws:ecs:{region}:{accountId}:task/{clusterName}/{taskId}
 */
export interface ParsedTaskArn {
  /** AWS region (e.g., 'ap-southeast-2') */
  region: string;
  /** AWS account ID */
  accountId: string;
  /** ECS cluster name */
  clusterName: string;
  /** ECS task ID (UUID without dashes in some cases) */
  taskId: string;
  /** Full ARN string */
  fullArn: string;
}

/**
 * Container information from ECS DescribeTasks response.
 */
export interface ContainerInfo {
  /** Container name */
  name: string;
  /** Container ARN */
  containerArn?: string;
  /** Last known status (PENDING, RUNNING, STOPPED) */
  lastStatus?: string;
  /** Exit code if container has stopped */
  exitCode?: number;
  /** Health status (HEALTHY, UNHEALTHY, UNKNOWN) */
  healthStatus?: string;
  /** Reason for current state */
  reason?: string;
  /** Container image */
  image?: string;
  /** CPU units */
  cpu?: string;
  /** Memory in MB */
  memory?: string;
}

/**
 * ECS task information from DescribeTasks API.
 */
export interface EcsTaskInfo {
  /** Full task ARN */
  taskArn: string;
  /** Parsed ARN components */
  parsed: ParsedTaskArn;
  /** Last known status (PENDING, RUNNING, STOPPED, etc.) */
  lastStatus: string;
  /** Desired status */
  desiredStatus: string;
  /** Overall task health status */
  healthStatus?: string;
  /** Reason task stopped (if applicable) */
  stoppedReason?: string;
  /** Stop code (e.g., TaskFailedToStart, EssentialContainerExited) */
  stopCode?: string;
  /** Container details */
  containers: ContainerInfo[];
  /** Service name extracted from group field (format: 'service:{name}') */
  serviceName?: string;
  /** Task definition ARN */
  taskDefinitionArn?: string;
  /** CPU units allocated */
  cpu?: string;
  /** Memory in MB allocated */
  memory?: string;
  /** Task creation time */
  createdAt?: Date;
  /** Task start time */
  startedAt?: Date;
  /** Task stop time */
  stoppedAt?: Date;
  /** Launch type (FARGATE, EC2) */
  launchType?: string;
  /** Platform version (for Fargate) */
  platformVersion?: string;
  /** Availability zone */
  availabilityZone?: string;
}

/**
 * ECS service event from DescribeServices API.
 */
export interface EcsServiceEvent {
  /** Event ID */
  id?: string;
  /** Event timestamp */
  createdAt?: Date;
  /** Event message describing what happened */
  message?: string;
}

/**
 * Container Insights metrics summary for an ECS task.
 *
 * Aggregated metrics computed server-side by CloudWatch Logs Insights.
 * Optimized for LLM consumption - contains only summary values, no raw data arrays.
 */
export interface ContainerMetricsSummary {
  /** Task ID */
  taskId: string;
  /** Cluster name */
  clusterName: string;
  /** Region */
  region: string;
  /** Number of data points aggregated */
  dataPointCount: number;
  /** Timestamp of the first data point */
  firstTimestamp: Date;
  /** Timestamp of the last data point */
  lastTimestamp: Date;
  /** Average CPU utilization percentage over the period */
  avgCpuUtilizationPercent: number;
  /** Maximum CPU utilization percentage over the period */
  maxCpuUtilizationPercent: number;
  /** Minimum CPU utilization percentage over the period */
  minCpuUtilizationPercent: number;
  /** Average Memory utilization percentage over the period */
  avgMemoryUtilizationPercent: number;
  /** Maximum Memory utilization percentage over the period */
  maxMemoryUtilizationPercent: number;
  /** Minimum Memory utilization percentage over the period */
  minMemoryUtilizationPercent: number;
}

/**
 * Historical task event from CloudWatch Logs.
 */
export interface HistoricalTaskEvent {
  /** Event timestamp */
  timestamp: Date;
  /** Task ARN */
  taskArn: string;
  /** Last status at this event */
  lastStatus: string;
  /** Desired status at this event */
  desiredStatus: string;
  /** Stopped reason if applicable */
  stoppedReason?: string;
  /** Stop code if applicable */
  stopCode?: string;
  /** Cluster ARN */
  clusterArn?: string;
}

/**
 * Input for RDS identifier resolution.
 * Can be either a DB instance identifier or DB cluster identifier.
 */
export interface RdsIdentifierInput {
  /** DB instance or cluster identifier */
  identifier: string;
  /** AWS region */
  region: string;
}

/**
 * RDS cluster member from DescribeDBClusters API.
 */
export interface RdsClusterMember {
  /** DB instance identifier */
  instanceIdentifier: string;
  /** Whether this instance is the cluster writer */
  isClusterWriter: boolean;
}

/**
 * RDS cluster information from DescribeDBClusters API.
 */
export interface RdsClusterInfo {
  /** DB cluster identifier */
  clusterIdentifier: string;
  /** DB cluster ARN */
  clusterArn: string;
  /** Cluster status (e.g., 'available', 'creating', 'deleting') */
  status: string;
  /** Database engine (e.g., 'aurora-postgresql') */
  engine: string;
  /** Engine version */
  engineVersion: string;
  /** Cluster endpoint for writer */
  endpoint?: string;
  /** Reader endpoint */
  readerEndpoint?: string;
  /** Port number */
  port?: number;
  /** Master username */
  masterUsername?: string;
  /** Availability zones */
  availabilityZones: string[];
  /** Cluster members (instances) */
  members: RdsClusterMember[];
  /** Whether Performance Insights is enabled */
  performanceInsightsEnabled?: boolean;
  /** Cluster creation time */
  createdAt?: Date;
}

/**
 * RDS instance information from DescribeDBInstances API.
 */
export interface RdsInstanceInfo {
  /** DB instance identifier */
  instanceIdentifier: string;
  /** DB instance ARN */
  instanceArn: string;
  /** DBI Resource ID - unique immutable identifier required by Performance Insights API (format: db-XXXX) */
  dbiResourceId?: string;
  /** DB cluster identifier (if part of a cluster) */
  clusterIdentifier?: string;
  /** Instance class (e.g., 'db.r5.large') */
  instanceClass: string;
  /** Database engine (e.g., 'aurora-postgresql') */
  engine: string;
  /** Engine version */
  engineVersion: string;
  /** Instance status (e.g., 'available', 'backing-up', 'rebooting') */
  status: string;
  /** Whether this instance is the cluster writer */
  isClusterWriter?: boolean;
  /** Availability zone */
  availabilityZone?: string;
  /** Endpoint address */
  endpoint?: string;
  /** Port number */
  port?: number;
  /** Whether Performance Insights is enabled */
  performanceInsightsEnabled?: boolean;
  /** Performance Insights retention period in days */
  performanceInsightsRetentionPeriod?: number;
  /** Instance creation time */
  createdAt?: Date;
  /** AWS region */
  region: string;
}

/**
 * CloudWatch metrics summary for an RDS instance.
 * Aggregated metrics computed from GetMetricData API.
 */
export interface RdsMetricsSummary {
  /** DB instance identifier */
  instanceIdentifier: string;
  /** AWS region */
  region: string;
  /** Number of data points aggregated */
  dataPointCount: number;
  /** Timestamp of the first data point */
  firstTimestamp?: Date;
  /** Timestamp of the last data point */
  lastTimestamp?: Date;

  // CPU metrics
  /** Average CPU utilization percentage */
  avgCpuUtilizationPercent?: number;
  /** Maximum CPU utilization percentage */
  maxCpuUtilizationPercent?: number;

  // Memory metrics
  /** Average freeable memory in bytes */
  avgFreeableMemoryBytes?: number;
  /** Minimum freeable memory in bytes */
  minFreeableMemoryBytes?: number;

  // Database connections
  /** Average database connections */
  avgDatabaseConnections?: number;
  /** Maximum database connections */
  maxDatabaseConnections?: number;

  // Throughput metrics
  /** Average commit throughput (transactions per second) */
  avgCommitThroughput?: number;
  /** Maximum commit throughput */
  maxCommitThroughput?: number;

  // I/O metrics
  /** Average read IOPS */
  avgReadIOPS?: number;
  /** Maximum read IOPS */
  maxReadIOPS?: number;
  /** Average write IOPS */
  avgWriteIOPS?: number;
  /** Maximum write IOPS */
  maxWriteIOPS?: number;

  // Latency metrics
  /** Average read latency in seconds */
  avgReadLatencySeconds?: number;
  /** Maximum read latency in seconds */
  maxReadLatencySeconds?: number;
  /** Average write latency in seconds */
  avgWriteLatencySeconds?: number;
  /** Maximum write latency in seconds */
  maxWriteLatencySeconds?: number;

  // Network metrics
  /** Average network receive throughput in bytes per second */
  avgNetworkReceiveThroughput?: number;
  /** Average network transmit throughput in bytes per second */
  avgNetworkTransmitThroughput?: number;

  // Aurora-specific metrics
  /** Average Aurora replica lag in milliseconds */
  avgAuroraReplicaLagMs?: number;
  /** Maximum Aurora replica lag in milliseconds */
  maxAuroraReplicaLagMs?: number;
  /** Average buffer cache hit ratio percentage */
  avgBufferCacheHitRatio?: number;
  /** Average deadlocks per second */
  avgDeadlocks?: number;
  /** Maximum deadlocks per second */
  maxDeadlocks?: number;

  // Disk metrics
  /** Average disk queue depth */
  avgDiskQueueDepth?: number;
  /** Maximum disk queue depth */
  maxDiskQueueDepth?: number;
  /** Average swap usage in bytes */
  avgSwapUsageBytes?: number;
  /** Maximum swap usage in bytes */
  maxSwapUsageBytes?: number;
}

/**
 * Top SQL query result from Performance Insights API.
 */
export interface TopSQLResult {
  /** SQL ID (digest hash) */
  sqlId: string;
  /** SQL statement text (may be truncated) */
  sqlText: string;
  /** Full SQL text (if retrieved via GetDimensionKeyDetails) */
  fullSqlText?: string;
  /** Average database load (Average Active Sessions) */
  avgDbLoad: number;
  /** Percentage of total database load */
  loadPercentage?: number;
  /** Total execution count (if available) */
  executionCount?: number;
  /** Average execution time in seconds (if available) */
  avgExecutionTimeSeconds?: number;
}

/**
 * Performance Insights summary for an RDS instance.
 */
export interface RdsPerformanceInsightsSummary {
  /** DB instance identifier */
  instanceIdentifier: string;
  /** Resource ARN used for PI API */
  resourceArn: string;
  /** AWS region */
  region: string;
  /** Start time of the analysis period */
  startTime: Date;
  /** End time of the analysis period */
  endTime: Date;
  /** Top SQL queries by database load */
  topSQLQueries: TopSQLResult[];
  /** Whether Performance Insights is enabled */
  performanceInsightsEnabled: boolean;
  /** Error message if PI data couldn't be retrieved */
  error?: string;
}
