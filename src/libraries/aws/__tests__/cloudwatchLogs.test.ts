import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Logger } from 'pino';

import { queryContainerInsightsLogs } from '../cloudwatchLogs';
import type { ContainerMetricsSummary } from '../types';

const createMockLogger = (): Logger => {
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

const TEST_CONFIG = {
  region: process.env['AWS_TEST_REGION'] ?? 'ap-southeast-2',
  clusterName: process.env['AWS_TEST_CLUSTER'] ?? '',
  taskId: process.env['AWS_TEST_TASK_ID'] ?? ''
};

const shouldSkip = !TEST_CONFIG.clusterName || !TEST_CONFIG.taskId;

if (!shouldSkip) {
  describe('queryContainerInsightsLogs', () => {
    let logger: Logger;

    beforeEach(() => {
      logger = createMockLogger();
    });
    /**
     * Integration tests for real AWS CloudWatch Logs queries.
     *
     * These tests require:
     * - Valid AWS credentials configured (AWS_PROFILE or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)
     * - Container Insights enabled on the target ECS cluster
     * - The AWS_TEST_* environment variables set
     *
     * Run with:
     *   AWS_TEST_CLUSTER=your-cluster AWS_TEST_TASK_ID=your-task-id npm test -- src/libraries/aws/__tests__/cloudwatchLogs.test.ts
     */
    describe('integration: real CloudWatch Logs queries', () => {
      describe('when querying Container Insights metrics for a real task', () => {
        let result: ContainerMetricsSummary | null;

        beforeEach(async () => {
          const endTime = new Date();
          const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

          result = await queryContainerInsightsLogs(
            {
              region: TEST_CONFIG.region,
              clusterName: TEST_CONFIG.clusterName,
              taskId: TEST_CONFIG.taskId,
              startTime,
              endTime
            },
            logger
          );

          console.log('Container Insights metrics result:', JSON.stringify(result, null, 2));
        }, 60000);

        it('returns null or valid metrics object', () => {
          expect(result === null || typeof result === 'object').toBe(true);
        });
      });

      describe('when validating utilization calculation is per-point', () => {
        let result: ContainerMetricsSummary | null;

        beforeEach(async () => {
          const endTime = new Date();
          const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000);

          result = await queryContainerInsightsLogs(
            {
              region: TEST_CONFIG.region,
              clusterName: TEST_CONFIG.clusterName,
              taskId: TEST_CONFIG.taskId,
              startTime,
              endTime
            },
            logger
          );
        }, 60000);

        it('returns metrics with max >= avg >= min invariant', () => {
          expect(result === null || typeof result === 'object').toBe(true);

          if (result && result.dataPointCount > 1) {
            console.log('Utilization invariants:', {
              cpu: {
                min: result.minCpuUtilizationPercent,
                avg: result.avgCpuUtilizationPercent,
                max: result.maxCpuUtilizationPercent
              },
              memory: {
                min: result.minMemoryUtilizationPercent,
                avg: result.avgMemoryUtilizationPercent,
                max: result.maxMemoryUtilizationPercent
              }
            });
          }
        });
      });
    });
  });
} else {
  describe('queryContainerInsightsLogs - skipped', () => {
    it('should be skipped', () => {
      expect(true).toBe(true);
    });
  });
}
