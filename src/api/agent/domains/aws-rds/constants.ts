/**
 * Constants for AWS RDS investigation.
 *
 * Centralizes magic numbers and thresholds for maintainability.
 */

/**
 * CloudWatch metrics query defaults.
 */
export const CLOUDWATCH_METRICS = {
  /** Default lookback period in hours when no explicit time range is provided */
  DEFAULT_LOOKBACK_HOURS: 24,
  /** Period in seconds for metric data points (1-minute granularity) */
  PERIOD_SECONDS: 60
} as const;

/**
 * Performance Insights query defaults.
 */
export const PERFORMANCE_INSIGHTS = {
  /** Default lookback period in hours when no explicit time range is provided */
  DEFAULT_LOOKBACK_HOURS: 1,
  /** Period in seconds for metric data points (1-minute granularity) */
  PERIOD_SECONDS: 60,
  /** Default number of top SQL queries to retrieve */
  DEFAULT_TOP_N: 10
} as const;

/**
 * RDS health thresholds for analysis.
 *
 * Used in the analysis prompt template to assess database health.
 *
 * @see https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.AuroraMonitoring.Metrics.html
 */
export const RDS_THRESHOLDS = {
  /** CPU utilization warning threshold (percentage) */
  CPU_WARNING_PERCENT: 80,
  /** CPU utilization critical threshold (percentage) */
  CPU_CRITICAL_PERCENT: 95,
  /** Freeable memory warning threshold (percentage of total) */
  MEMORY_WARNING_PERCENT: 25,
  /** Freeable memory critical threshold (percentage of total) */
  MEMORY_CRITICAL_PERCENT: 10,
  /** Database connections warning threshold (percentage of max_connections) */
  CONNECTIONS_WARNING_PERCENT: 80,
  /** Database connections critical threshold (percentage of max_connections) */
  CONNECTIONS_CRITICAL_PERCENT: 95,
  /** Aurora replica lag warning threshold (milliseconds) */
  REPLICA_LAG_WARNING_MS: 100,
  /** Aurora replica lag critical threshold (milliseconds) */
  REPLICA_LAG_CRITICAL_MS: 1000,
  /** Buffer cache hit ratio warning threshold (percentage) */
  BUFFER_CACHE_HIT_WARNING_PERCENT: 95,
  /** Buffer cache hit ratio critical threshold (percentage) */
  BUFFER_CACHE_HIT_CRITICAL_PERCENT: 90,
  /** Disk queue depth warning threshold */
  DISK_QUEUE_DEPTH_WARNING: 10,
  /** Disk queue depth critical threshold */
  DISK_QUEUE_DEPTH_CRITICAL: 50,
  /** Deadlocks warning threshold (any deadlock is a warning) */
  DEADLOCKS_WARNING: 0,
  /** Deadlocks critical threshold (per second) */
  DEADLOCKS_CRITICAL_PER_SECOND: 1
} as const;

/**
 * Common Aurora PostgreSQL instance classes and their approximate memory.
 *
 * NOTE: This is reference data for analysis, not an exhaustive list.
 * Unknown instance classes will return undefined from getInstanceMemoryGB().
 * Update this list as new instance types are released by AWS.
 *
 * Instance families not included: db.t3, db.t4g, db.m5, db.m6g, db.x2g, etc.
 * For complete and up-to-date information, use the DescribeOrderableDBInstanceOptions API.
 *
 * @see https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Concepts.DBInstanceClass.html
 */
export const INSTANCE_CLASS_MEMORY_GB: Readonly<Record<string, number>> = {
  'db.r5.large': 16,
  'db.r5.xlarge': 32,
  'db.r5.2xlarge': 64,
  'db.r5.4xlarge': 128,
  'db.r5.8xlarge': 256,
  'db.r5.12xlarge': 384,
  'db.r5.16xlarge': 512,
  'db.r5.24xlarge': 768,
  'db.r6g.large': 16,
  'db.r6g.xlarge': 32,
  'db.r6g.2xlarge': 64,
  'db.r6g.4xlarge': 128,
  'db.r6g.8xlarge': 256,
  'db.r6g.12xlarge': 384,
  'db.r6g.16xlarge': 512,
  'db.r6i.large': 16,
  'db.r6i.xlarge': 32,
  'db.r6i.2xlarge': 64,
  'db.r6i.4xlarge': 128,
  'db.r6i.8xlarge': 256,
  'db.r6i.12xlarge': 384,
  'db.r6i.16xlarge': 512,
  'db.r6i.24xlarge': 768,
  'db.r6i.32xlarge': 1024
} as const;

/**
 * Get memory in GB for an instance class.
 *
 * @param instanceClass - DB instance class (e.g., 'db.r5.large')
 * @returns Memory in GB, or undefined if instance class is not in the reference data
 */
export const getInstanceMemoryGB = (instanceClass: string): number | undefined => {
  // eslint-disable-next-line security/detect-object-injection -- Validated with Object.hasOwn
  return Object.hasOwn(INSTANCE_CLASS_MEMORY_GB, instanceClass) ? INSTANCE_CLASS_MEMORY_GB[instanceClass] : undefined;
};
