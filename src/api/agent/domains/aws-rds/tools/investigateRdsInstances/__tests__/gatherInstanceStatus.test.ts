import { beforeEach, describe, expect, it } from '@jest/globals';
import type { Logger } from 'pino';

import type { RdsInstanceInfo } from '@/libraries/aws';

import { createMockLogger, createRdsInstanceInfo } from '../testFixtures';
import { gatherInstanceStatus, type GatherInstanceStatusResult } from '../gatherInstanceStatus';

describe('gatherInstanceStatus', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('helper functions', () => {
    describe('when creating RDS instance info', () => {
      let result: RdsInstanceInfo;

      beforeEach(() => {
        result = createRdsInstanceInfo('test-instance-writer', 'us-east-1', true);
      });

      it('creates valid instance info with correct instanceIdentifier', () => {
        expect(result.instanceIdentifier).toStrictEqual('test-instance-writer');
      });

      it('creates valid instance info with correct region', () => {
        expect(result.region).toStrictEqual('us-east-1');
      });

      it('creates valid instance info with correct isClusterWriter', () => {
        expect(result.isClusterWriter).toStrictEqual(true);
      });

      it('creates valid instance info with correct instanceArn', () => {
        expect(result.instanceArn).toStrictEqual('arn:aws:rds:us-east-1:123456789012:db:test-instance-writer');
      });

      it('creates valid instance info with db.r6g.2xlarge instance class', () => {
        expect(result.instanceClass).toStrictEqual('db.r6g.2xlarge');
      });

      it('creates valid instance info with performanceInsightsEnabled', () => {
        expect(result.performanceInsightsEnabled).toStrictEqual(true);
      });
    });

    describe('when creating reader instance', () => {
      let result: RdsInstanceInfo;

      beforeEach(() => {
        result = createRdsInstanceInfo('test-instance-reader', 'ap-southeast-2', false);
      });

      it('has isClusterWriter set to false', () => {
        expect(result.isClusterWriter).toStrictEqual(false);
      });
    });
  });

  /**
   * Integration tests for real AWS RDS instance resolution.
   *
   * These tests require:
   * - Valid AWS credentials configured
   * - The following environment variables set:
   *   - AWS_TEST_REGION
   *   - AWS_TEST_RDS_CLUSTER_ID (cluster identifier to resolve to instances)
   *
   * Run with:
   *   AWS_TEST_RDS_CLUSTER_ID=your-cluster-id npm test -- src/api/agent/domains/aws-rds/tools/investigateRdsInstances/__tests__/gatherInstanceStatus.test.ts
   */
  const TEST_CONFIG = {
    region: process.env['AWS_TEST_REGION'] ?? 'ap-southeast-2',
    clusterId: process.env['AWS_TEST_RDS_CLUSTER_ID'] ?? ''
  };

  const shouldSkip = !TEST_CONFIG.clusterId;

  if (!shouldSkip) {
    describe('integration: real AWS queries', () => {
      describe('when resolving a cluster identifier', () => {
        let result: GatherInstanceStatusResult;

        beforeEach(async () => {
          const inputs = [{ identifier: TEST_CONFIG.clusterId, region: TEST_CONFIG.region }];

          result = await gatherInstanceStatus(inputs, logger, 60000);

          console.log('gatherInstanceStatus result:', JSON.stringify(result, null, 2));
        }, 120000);

        it('resolves cluster to at least one instance', () => {
          expect(result.instances.length).toBeGreaterThan(0);
        });

        it('returns no errors', () => {
          expect(result.error).toBeNull();
        });

        it('has empty notFound array', () => {
          expect(result.notFound).toStrictEqual([]);
        });

        it('resolution map contains the cluster identifier', () => {
          expect(result.resolutionMap.has(TEST_CONFIG.clusterId)).toStrictEqual(true);
        });

        it('instances have performanceInsightsEnabled property', () => {
          const instance = result.instances[0];
          expect(instance?.performanceInsightsEnabled).toBeDefined();
        });
      });

      describe('when querying non-existent identifier', () => {
        let result: GatherInstanceStatusResult;

        beforeEach(async () => {
          const inputs = [{ identifier: 'non-existent-cluster-12345', region: TEST_CONFIG.region }];

          result = await gatherInstanceStatus(inputs, logger, 60000);

          console.log('Non-existent result:', JSON.stringify(result, null, 2));
        }, 120000);

        it('returns empty instances array', () => {
          expect(result.instances.length).toStrictEqual(0);
        });

        it('includes identifier in notFound array', () => {
          expect(result.notFound).toContain('non-existent-cluster-12345');
        });
      });
    });
  }
});
