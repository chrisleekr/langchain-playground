import type { ParsedTaskArn, EcsTaskInfo, EcsServiceEvent, ContainerMetricsSummary, HistoricalTaskEvent } from '@/libraries/aws';

/**
 * Task investigation result for a single task.
 */
export interface TaskInvestigationResult {
  /** Parsed task ARN data */
  parsed: ParsedTaskArn;
  /** Task status from DescribeTasks (null if not found) */
  taskInfo: EcsTaskInfo | null;
  /** Whether the task was found via DescribeTasks */
  found: boolean;
  /** Container Insights metrics summary (null if unavailable) */
  metrics: ContainerMetricsSummary | null;
  /** Historical events for stopped tasks (empty if not applicable) */
  historicalEvents: HistoricalTaskEvent[];
  /** Errors encountered during investigation */
  errors: string[];
}

/**
 * Service investigation result.
 */
export interface ServiceInvestigationResult {
  /** Service name */
  serviceName: string;
  /** Region */
  region: string;
  /** Cluster name */
  clusterName: string;
  /** Service events */
  events: EcsServiceEvent[];
  /** Error if service events couldn't be fetched */
  error?: string;
}
