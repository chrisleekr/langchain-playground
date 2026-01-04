/**
 * Shared AWS types for ECS investigation.
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
