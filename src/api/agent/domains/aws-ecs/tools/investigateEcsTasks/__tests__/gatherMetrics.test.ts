import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Logger } from 'pino';

import type { ParsedTaskArn } from '@/libraries/aws';

import { gatherMetrics, type MetricsTimeRange, type TaskMetricsResult } from '../gatherMetrics';

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

const createParsedTaskArn = (taskId: string, clusterName = 'test-cluster', region = 'ap-southeast-2'): ParsedTaskArn => ({
  taskId,
  clusterName,
  region,
  accountId: '123456789012',
  fullArn: `arn:aws:ecs:${region}:123456789012:task/${clusterName}/${taskId}`
});

describe('gatherMetrics', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('with empty task list', () => {
    let result: Map<string, TaskMetricsResult>;

    beforeEach(async () => {
      result = await gatherMetrics([], new Map(), logger, 30000);
    });

    it('returns empty map', () => {
      expect(result.size).toStrictEqual(0);
    });
  });

  describe('helper functions', () => {
    describe('when creating parsed task ARN', () => {
      let result: ParsedTaskArn;

      beforeEach(() => {
        result = createParsedTaskArn('task-123', 'my-cluster', 'us-east-1');
      });

      it('creates valid ARN structure with correct taskId', () => {
        expect(result.taskId).toStrictEqual('task-123');
      });

      it('creates valid ARN structure with correct clusterName', () => {
        expect(result.clusterName).toStrictEqual('my-cluster');
      });

      it('creates valid ARN structure with correct region', () => {
        expect(result.region).toStrictEqual('us-east-1');
      });

      it('creates valid ARN structure with correct accountId', () => {
        expect(result.accountId).toStrictEqual('123456789012');
      });

      it('creates valid ARN structure with correct fullArn', () => {
        expect(result.fullArn).toStrictEqual('arn:aws:ecs:us-east-1:123456789012:task/my-cluster/task-123');
      });
    });
  });

  /**
   * Integration tests for real AWS CloudWatch Logs Insights queries.
   *
   * These tests require:
   * - Valid AWS credentials configured
   * - Container Insights enabled on the target ECS cluster
   * - The following environment variables set:
   *   - AWS_TEST_REGION
   *   - AWS_TEST_CLUSTER
   *   - AWS_TEST_TASK_ID
   *
   * Run with:
   *   AWS_TEST_CLUSTER=your-cluster AWS_TEST_TASK_ID=your-task-id npm test -- src/api/agent/domains/aws-ecs/tools/investigateEcsTasks/__tests__/gatherMetrics.test.ts
   */
  const TEST_CONFIG = {
    region: process.env['AWS_TEST_REGION'] ?? 'ap-southeast-2',
    clusterName: process.env['AWS_TEST_CLUSTER'] ?? '',
    taskId: process.env['AWS_TEST_TASK_ID'] ?? ''
  };

  const shouldSkip = !TEST_CONFIG.clusterName || !TEST_CONFIG.taskId;

  if (!shouldSkip) {
    describe('integration: real AWS queries', () => {
      describe('when gathering metrics for a real ECS task', () => {
        let result: Map<string, TaskMetricsResult>;

        beforeEach(async () => {
          const taskArns = [createParsedTaskArn(TEST_CONFIG.taskId, TEST_CONFIG.clusterName, TEST_CONFIG.region)];
          const timeRange: MetricsTimeRange = {
            startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
            endTime: new Date()
          };

          result = await gatherMetrics(taskArns, new Map(), logger, 60000, timeRange);

          const taskResult = result.get(TEST_CONFIG.taskId);
          console.log('gatherMetrics result:', JSON.stringify(taskResult, null, 2));
        }, 120000);

        it('returns map with one entry', () => {
          expect(result.size).toStrictEqual(1);
        });

        it('returns result with correct taskId', () => {
          const taskResult = result.get(TEST_CONFIG.taskId);
          expect(taskResult?.taskId).toStrictEqual(TEST_CONFIG.taskId);
        });
      });

      describe('when gathering metrics for multiple tasks in parallel', () => {
        let result: Map<string, TaskMetricsResult>;
        let duration: number;

        beforeEach(async () => {
          const taskArns = [
            createParsedTaskArn(TEST_CONFIG.taskId, TEST_CONFIG.clusterName, TEST_CONFIG.region),
            createParsedTaskArn('non-existent-task-12345', TEST_CONFIG.clusterName, TEST_CONFIG.region)
          ];

          const timeRange: MetricsTimeRange = {
            startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
            endTime: new Date()
          };

          const startTime = Date.now();
          result = await gatherMetrics(taskArns, new Map(), logger, 60000, timeRange);
          duration = Date.now() - startTime;

          console.log(`Parallel metrics gathering completed in ${duration}ms for ${taskArns.length} tasks`);
        }, 120000);

        it('returns map with two entries', () => {
          expect(result.size).toStrictEqual(2);
        });

        it('returns result for real task', () => {
          const realTaskResult = result.get(TEST_CONFIG.taskId);
          expect(realTaskResult).toBeDefined();
        });

        it('returns result with null metrics for non-existent task', () => {
          const fakeTaskResult = result.get('non-existent-task-12345');
          expect(fakeTaskResult).toBeDefined();
          expect(fakeTaskResult?.metrics).toBeNull();
        });
      });
    });
  }
});
