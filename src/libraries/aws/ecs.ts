import type { Logger } from 'pino';
import { ECSClient, DescribeTasksCommand, DescribeServicesCommand, type Task, type Container } from '@aws-sdk/client-ecs';

import { getInvestigateCredentials } from './credentials';
import type { ParsedTaskArn, EcsTaskInfo, ContainerInfo, EcsServiceEvent } from './types';

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
 * Reused for connection pooling and keep-alive.
 *
 * Note: In concurrent scenarios, multiple clients may be created for the same region
 * before caching completes. This is acceptable as AWS SDK clients are lightweight
 * and the cache stabilizes after initial requests.
 *
 * @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-reusing-connections.html
 */
const ecsClientCache = new Map<string, ECSClient>();

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
 * Uses synchronous get-then-set pattern to minimize (but not eliminate) race conditions.
 * Client creation is synchronous, so the window for duplicate creation is minimal.
 *
 * @param region - AWS region
 * @returns Configured ECS client
 */
const getEcsClient = (region: string): ECSClient => {
  const existingClient = ecsClientCache.get(region);
  if (existingClient) {
    return existingClient;
  }

  // Create new client and cache immediately (before any async operations)
  const newClient = new ECSClient({
    region,
    credentials: getInvestigateCredentials()
  });
  ecsClientCache.set(region, newClient);
  return newClient;
};

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
