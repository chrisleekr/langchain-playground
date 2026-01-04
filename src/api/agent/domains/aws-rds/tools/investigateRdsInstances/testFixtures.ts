/**
 * Test fixtures and helper functions for RDS investigation tests.
 *
 * This file is placed outside __tests__ to avoid being picked up by Jest
 * as a test suite. Import from test files using relative path.
 */
import { jest } from '@jest/globals';
import type { Logger } from 'pino';

import type { RdsInstanceInfo } from '@/libraries/aws';

/**
 * Create a mock logger for testing.
 *
 * Returns a mock Logger with all methods stubbed and child() returning itself.
 */
export const createMockLogger = (): Logger => {
  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn()
  };
  mockLogger.child.mockReturnValue(mockLogger);
  return mockLogger as unknown as Logger;
};

/**
 * Create a mock RdsInstanceInfo for testing.
 *
 * @param instanceIdentifier - DB instance identifier
 * @param region - AWS region (default: 'ap-southeast-2')
 * @param isClusterWriter - Whether this instance is the cluster writer (default: true)
 * @returns A complete RdsInstanceInfo object
 */
export const createRdsInstanceInfo = (
  instanceIdentifier: string,
  region = 'ap-southeast-2',
  isClusterWriter = true
): RdsInstanceInfo => ({
  instanceIdentifier,
  instanceArn: `arn:aws:rds:${region}:123456789012:db:${instanceIdentifier}`,
  dbiResourceId: `db-${instanceIdentifier.toUpperCase().replace(/-/g, '').substring(0, 26)}`,
  clusterIdentifier: 'test-cluster',
  instanceClass: 'db.r6g.2xlarge',
  engine: 'aurora-postgresql',
  engineVersion: '14.6',
  status: 'available',
  isClusterWriter,
  availabilityZone: `${region}a`,
  endpoint: `${instanceIdentifier}.cluster-xxx.${region}.rds.amazonaws.com`,
  port: 5432,
  performanceInsightsEnabled: true,
  performanceInsightsRetentionPeriod: 7,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  region
});
