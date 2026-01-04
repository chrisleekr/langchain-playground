import { clearCloudWatchClientCache } from './cloudwatch';
import { clearCloudWatchLogsClientCache } from './cloudwatchLogs';
import { clearEcsClientCache } from './ecs';
import { clearPIClientCache } from './performanceInsights';
import { clearRdsClientCache } from './rds';

/**
 * Clear all AWS client caches.
 *
 * Call during graceful shutdown to clean up resources and prevent memory leaks.
 * Each cache is cleared independently to ensure all clients are destroyed
 * even if one cache fails to clear.
 *
 * @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/creating-and-calling-service-objects.html
 */
export const clearAllAwsClientCaches = (): void => {
  clearCloudWatchClientCache();
  clearCloudWatchLogsClientCache();
  clearEcsClientCache();
  clearPIClientCache();
  clearRdsClientCache();
};

export * from './opensearch';
export * from './credentials';
export * from './clientManager';
export * from './types';
export * from './ecs';
export * from './cloudwatchLogs';
export * from './rds';
export * from './cloudwatch';
export * from './performanceInsights';
