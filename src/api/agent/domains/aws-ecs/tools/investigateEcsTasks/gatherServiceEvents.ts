import type { Logger } from 'pino';

import { getServiceEvents, type EcsServiceEvent } from '@/libraries/aws';
import { withTimeout, getErrorMessage } from '@/api/agent/core';
import type { ServiceInvestigationResult } from './types';

/**
 * Service key for deduplication.
 */
interface ServiceKey {
  region: string;
  clusterName: string;
  serviceName: string;
}

/**
 * Gather service events for all unique services found in tasks.
 *
 * @param services - Array of unique service identifiers
 * @param logger - Logger instance
 * @param timeoutMs - Timeout per API call
 * @returns Array of service investigation results
 */
export const gatherServiceEvents = async (services: ServiceKey[], logger: Logger, timeoutMs: number): Promise<ServiceInvestigationResult[]> => {
  const nodeLogger = logger.child({ function: 'gatherServiceEvents' });

  if (services.length === 0) {
    return [];
  }

  nodeLogger.info({ serviceCount: services.length }, 'Gathering service events');

  const results: ServiceInvestigationResult[] = [];

  // Process services in parallel
  const promises = services.map(async service => {
    const { region, clusterName, serviceName } = service;

    try {
      const events = await withTimeout(
        () => getServiceEvents(region, clusterName, serviceName, nodeLogger),
        timeoutMs,
        `getServiceEvents:${serviceName}`
      );

      return {
        serviceName,
        region,
        clusterName,
        events
      };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      nodeLogger.warn({ serviceName, error: errorMessage }, 'Failed to get service events');

      return {
        serviceName,
        region,
        clusterName,
        events: [] as EcsServiceEvent[],
        error: errorMessage
      };
    }
  });

  const settledResults = await Promise.allSettled(promises);

  for (const settled of settledResults) {
    if (settled.status === 'fulfilled') {
      results.push(settled.value);
    } else {
      // Log rejected promises for debugging
      nodeLogger.warn(
        { reason: settled.reason instanceof Error ? settled.reason.message : String(settled.reason) },
        'Service events promise rejected unexpectedly'
      );
    }
  }

  nodeLogger.info(
    {
      servicesQueried: services.length,
      servicesWithEvents: results.filter(r => r.events.length > 0).length,
      servicesWithErrors: results.filter(r => r.error).length
    },
    'Service events gathered'
  );

  return results;
};

/**
 * Extract unique services from tasks.
 *
 * @param tasks - Array of tasks with serviceName
 * @returns Array of unique service keys
 */
export const extractUniqueServices = (tasks: Array<{ serviceName?: string; region: string; clusterName: string }>): ServiceKey[] => {
  const seen = new Set<string>();
  const services: ServiceKey[] = [];

  for (const task of tasks) {
    if (task.serviceName) {
      const key = `${task.region}:${task.clusterName}:${task.serviceName}`;
      if (!seen.has(key)) {
        seen.add(key);
        services.push({
          region: task.region,
          clusterName: task.clusterName,
          serviceName: task.serviceName
        });
      }
    }
  }

  return services;
};
