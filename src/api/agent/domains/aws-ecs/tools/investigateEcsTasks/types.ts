import type { ParsedTaskArn, EcsTaskInfo, EcsServiceEvent, ContainerMetrics, HistoricalTaskEvent } from '@/libraries/aws';

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
  /** Container Insights metrics (null if unavailable) */
  metrics: ContainerMetrics | null;
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

/**
 * Complete investigation result for all tasks.
 */
export interface InvestigationResult {
  /** Individual task results */
  tasks: TaskInvestigationResult[];
  /** Service events grouped by service name */
  services: ServiceInvestigationResult[];
  /** Summary statistics */
  summary: {
    /** Total tasks requested */
    totalRequested: number;
    /** Tasks found via DescribeTasks */
    tasksFound: number;
    /** Tasks not found (may need historical lookup) */
    tasksNotFound: number;
    /** Tasks with metrics available */
    tasksWithMetrics: number;
    /** Tasks with historical events */
    tasksWithHistoricalEvents: number;
    /** Services queried */
    servicesQueried: number;
    /** Total errors encountered */
    totalErrors: number;
  };
  /** Investigation timestamp */
  investigatedAt: string;
}
