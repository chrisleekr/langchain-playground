import type { Logger } from 'pino';

import { batchResolveToInstances, getUniqueInstances, type RdsIdentifierInput, type RdsInstanceInfo } from '@/libraries/aws';
import { withTimeout, getErrorMessage } from '@/api/agent/core';

/**
 * Result of gathering instance status.
 */
export interface GatherInstanceStatusResult {
  /** Resolved instances */
  instances: RdsInstanceInfo[];
  /** Map of original identifier to resolved instances */
  resolutionMap: Map<string, RdsInstanceInfo[]>;
  /** Identifiers that couldn't be resolved */
  notFound: string[];
  /** Error message if the operation failed */
  error: string | null;
}

/**
 * Gather RDS instance status for the given identifiers.
 *
 * Resolves cluster identifiers to their member instances.
 * Deduplicates instances if the same instance is referenced multiple times.
 *
 * @param inputs - Array of identifier inputs
 * @param logger - Logger instance
 * @param timeoutMs - Timeout for the operation
 * @returns Result with resolved instances and any errors
 */
export const gatherInstanceStatus = async (inputs: RdsIdentifierInput[], logger: Logger, timeoutMs: number): Promise<GatherInstanceStatusResult> => {
  const nodeLogger = logger.child({ function: 'gatherInstanceStatus', inputCount: inputs.length });

  try {
    // Resolve all identifiers (handles both instance and cluster IDs)
    const resolutionMap = await withTimeout(() => batchResolveToInstances(inputs, logger), timeoutMs, 'batchResolveToInstances');

    // Find identifiers that couldn't be resolved
    const notFound: string[] = [];
    for (const input of inputs) {
      const resolved = resolutionMap.get(input.identifier);
      if (!resolved || resolved.length === 0) {
        notFound.push(input.identifier);
      }
    }

    // Get unique instances (deduplicated by ARN)
    const instances = getUniqueInstances(resolutionMap, logger);

    nodeLogger.info(
      {
        resolvedCount: instances.length,
        notFoundCount: notFound.length,
        inputCount: inputs.length
      },
      'Instance status gathered'
    );

    return {
      instances,
      resolutionMap,
      notFound,
      error: null
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    nodeLogger.error({ error: errorMessage }, 'Failed to gather instance status');

    return {
      instances: [],
      resolutionMap: new Map(),
      notFound: inputs.map(i => i.identifier),
      error: errorMessage
    };
  }
};
