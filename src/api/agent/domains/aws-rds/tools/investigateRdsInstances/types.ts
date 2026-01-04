import type { RdsInstanceInfo, RdsMetricsSummary, RdsPerformanceInsightsSummary } from '@/libraries/aws';

/**
 * Time range for investigation queries.
 *
 * Shared across CloudWatch metrics and Performance Insights queries.
 * When not provided to gather functions, each uses its own default lookback:
 * - CloudWatch metrics: 24 hours
 * - Performance Insights Top SQL: 1 hour
 */
export interface InvestigationTimeRange {
  /** Start time for the query */
  startTime: Date;
  /** End time for the query */
  endTime: Date;
}

/**
 * Investigation result for a single RDS instance.
 */
export interface RdsInvestigationResult {
  /** Original identifier provided by user */
  originalIdentifier: string;
  /** Instance info from DescribeDBInstances */
  instanceInfo: RdsInstanceInfo;
  /** CloudWatch metrics summary (null if unavailable) */
  metrics: RdsMetricsSummary | null;
  /** Performance Insights summary (null if unavailable) */
  performanceInsights: RdsPerformanceInsightsSummary | null;
  /** Errors encountered during investigation */
  errors: string[];
}

/**
 * Summary statistics for the investigation.
 */
export interface RdsInvestigationSummary {
  /** Total identifiers requested */
  totalRequested: number;
  /** Total instances resolved (including cluster members) */
  totalInstancesResolved: number;
  /** Instances with CloudWatch metrics */
  instancesWithMetrics: number;
  /** Instances with Performance Insights data */
  instancesWithPerformanceInsights: number;
  /** Total errors encountered */
  totalErrors: number;
}
