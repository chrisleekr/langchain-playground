import { beforeEach, describe, expect, it } from '@jest/globals';
import type { Logger } from 'pino';

import type { RdsInstanceInfo } from '@/libraries/aws';

import { createMockLogger, createRdsInstanceInfo } from '../testFixtures';
import { gatherCloudWatchMetrics, type InstanceMetricsResult } from '../gatherCloudWatchMetrics';
import type { InvestigationTimeRange } from '../types';

describe('gatherCloudWatchMetrics', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('with empty instance list', () => {
    let result: Map<string, InstanceMetricsResult>;

    beforeEach(async () => {
      result = await gatherCloudWatchMetrics([], logger, 30000);
    });

    it('returns empty map', () => {
      expect(result.size).toStrictEqual(0);
    });
  });

  describe('helper functions', () => {
    describe('when creating RDS instance info', () => {
      let result: RdsInstanceInfo;

      beforeEach(() => {
        result = createRdsInstanceInfo('test-instance-1', 'us-east-1', false);
      });

      it('creates valid instance info with correct instanceIdentifier', () => {
        expect(result.instanceIdentifier).toStrictEqual('test-instance-1');
      });

      it('creates valid instance info with correct region', () => {
        expect(result.region).toStrictEqual('us-east-1');
      });

      it('creates valid instance info with correct isClusterWriter', () => {
        expect(result.isClusterWriter).toStrictEqual(false);
      });

      it('creates valid instance info with correct instanceArn', () => {
        expect(result.instanceArn).toStrictEqual('arn:aws:rds:us-east-1:123456789012:db:test-instance-1');
      });

      it('creates valid instance info with correct engine', () => {
        expect(result.engine).toStrictEqual('aurora-postgresql');
      });

      it('creates valid instance info with performanceInsightsEnabled', () => {
        expect(result.performanceInsightsEnabled).toStrictEqual(true);
      });
    });
  });

  /**
   * Integration tests for real AWS CloudWatch metrics queries.
   *
   * These tests require:
   * - Valid AWS credentials configured
   * - The following environment variables set:
   *   - AWS_TEST_REGION
   *   - AWS_TEST_RDS_INSTANCE_ID
   *
   * Run with:
   *   AWS_TEST_RDS_INSTANCE_ID=your-instance-id npm test -- src/api/agent/domains/aws-rds/tools/investigateRdsInstances/__tests__/gatherCloudWatchMetrics.test.ts
   */
  const TEST_CONFIG = {
    region: process.env['AWS_TEST_REGION'] ?? 'ap-southeast-2',
    instanceId: process.env['AWS_TEST_RDS_INSTANCE_ID'] ?? ''
  };

  const shouldSkip = !TEST_CONFIG.instanceId;

  if (!shouldSkip) {
    describe('integration: real AWS queries', () => {
      describe('when gathering metrics for a real RDS instance', () => {
        let result: Map<string, InstanceMetricsResult>;

        beforeEach(async () => {
          const instances = [createRdsInstanceInfo(TEST_CONFIG.instanceId, TEST_CONFIG.region)];
          const timeRange: InvestigationTimeRange = {
            startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
            endTime: new Date()
          };

          result = await gatherCloudWatchMetrics(instances, logger, 60000, timeRange);

          const instanceResult = result.get(TEST_CONFIG.instanceId);
          console.log('gatherCloudWatchMetrics result:', JSON.stringify(instanceResult, null, 2));
        }, 120000);

        it('returns map with one entry', () => {
          expect(result.size).toStrictEqual(1);
        });

        it('returns result with correct instanceIdentifier', () => {
          const instanceResult = result.get(TEST_CONFIG.instanceId);
          expect(instanceResult?.instanceIdentifier).toStrictEqual(TEST_CONFIG.instanceId);
        });
      });
    });
  }
});
