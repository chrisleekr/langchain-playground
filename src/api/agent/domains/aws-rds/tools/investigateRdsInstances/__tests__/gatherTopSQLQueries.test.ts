import { beforeEach, describe, expect, it } from '@jest/globals';
import type { Logger } from 'pino';

import type { RdsInstanceInfo } from '@/libraries/aws';

import { createMockLogger, createRdsInstanceInfo } from '../testFixtures';
import { gatherTopSQLQueries, type InstanceTopSQLResult } from '../gatherTopSQLQueries';
import type { InvestigationTimeRange } from '../types';

describe('gatherTopSQLQueries', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('with empty instance list', () => {
    let result: Map<string, InstanceTopSQLResult>;

    beforeEach(async () => {
      result = await gatherTopSQLQueries([], logger, 30000);
    });

    it('returns empty map', () => {
      expect(result.size).toStrictEqual(0);
    });
  });

  describe('helper functions', () => {
    describe('when creating RDS instance with PI disabled', () => {
      let result: RdsInstanceInfo;

      beforeEach(() => {
        result = createRdsInstanceInfo('test-instance-no-pi', 'us-west-2', false);
        result.performanceInsightsEnabled = false;
      });

      it('has performanceInsightsEnabled set to false', () => {
        expect(result.performanceInsightsEnabled).toStrictEqual(false);
      });
    });
  });

  /**
   * Integration tests for real AWS Performance Insights queries.
   *
   * These tests require:
   * - Valid AWS credentials configured
   * - Performance Insights enabled on the test instance
   * - The following environment variables set:
   *   - AWS_TEST_REGION
   *   - AWS_TEST_RDS_INSTANCE_ID (instance identifier with PI enabled)
   *
   * Run with:
   *   AWS_TEST_RDS_INSTANCE_ID=your-instance-id npm test -- src/api/agent/domains/aws-rds/tools/investigateRdsInstances/__tests__/gatherTopSQLQueries.test.ts
   */
  const TEST_CONFIG = {
    region: process.env['AWS_TEST_REGION'] ?? 'ap-southeast-2',
    instanceId: process.env['AWS_TEST_RDS_INSTANCE_ID'] ?? ''
  };

  const shouldSkip = !TEST_CONFIG.instanceId;

  if (!shouldSkip) {
    describe('integration: real AWS queries', () => {
      describe('when gathering Top SQL for a real RDS instance', () => {
        let result: Map<string, InstanceTopSQLResult>;

        beforeEach(async () => {
          const instances = [createRdsInstanceInfo(TEST_CONFIG.instanceId, TEST_CONFIG.region)];
          const timeRange: InvestigationTimeRange = {
            startTime: new Date(Date.now() - 1 * 60 * 60 * 1000), // Last 1 hour
            endTime: new Date()
          };

          result = await gatherTopSQLQueries(instances, logger, 60000, 10, timeRange);

          const instanceResult = result.get(TEST_CONFIG.instanceId);
          // Using console.log for integration test debugging - outputs real AWS API responses
          console.log('gatherTopSQLQueries result:', JSON.stringify(instanceResult, null, 2));
        }, 120000);

        it('returns map with one entry', () => {
          expect(result.size).toStrictEqual(1);
        });

        it('returns result with correct instanceIdentifier', () => {
          const instanceResult = result.get(TEST_CONFIG.instanceId);
          expect(instanceResult?.instanceIdentifier).toStrictEqual(TEST_CONFIG.instanceId);
        });

        it('returns result with performanceInsights object', () => {
          const instanceResult = result.get(TEST_CONFIG.instanceId);
          expect(instanceResult?.performanceInsights).not.toBeNull();
        });
      });

      describe('when gathering Top SQL for multiple instances in parallel', () => {
        let result: Map<string, InstanceTopSQLResult>;
        let duration: number;

        beforeEach(async () => {
          const instances = [
            createRdsInstanceInfo(TEST_CONFIG.instanceId, TEST_CONFIG.region),
            createRdsInstanceInfo('non-existent-instance-12345', TEST_CONFIG.region)
          ];

          // Disable PI for non-existent instance to test that code path
          instances[1]!.performanceInsightsEnabled = false;

          const timeRange: InvestigationTimeRange = {
            startTime: new Date(Date.now() - 1 * 60 * 60 * 1000),
            endTime: new Date()
          };

          const startTime = Date.now();
          result = await gatherTopSQLQueries(instances, logger, 60000, 10, timeRange);
          duration = Date.now() - startTime;

          // Using console.log for integration test debugging - outputs timing for parallel operations
          console.log(`Parallel Top SQL gathering completed in ${duration}ms for ${instances.length} instances`);
        }, 120000);

        it('returns map with two entries', () => {
          expect(result.size).toStrictEqual(2);
        });

        it('returns result for real instance', () => {
          const realInstanceResult = result.get(TEST_CONFIG.instanceId);
          expect(realInstanceResult).toBeDefined();
        });

        it('returns result with empty topSQLQueries for PI-disabled instance', () => {
          const fakeInstanceResult = result.get('non-existent-instance-12345');
          expect(fakeInstanceResult).toBeDefined();
          expect(fakeInstanceResult?.performanceInsights?.topSQLQueries).toStrictEqual([]);
        });
      });
    });
  }
});
