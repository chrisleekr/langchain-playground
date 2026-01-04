import { beforeEach, describe, expect, it } from '@jest/globals';

import { CLOUDWATCH_METRICS, PERFORMANCE_INSIGHTS, RDS_THRESHOLDS, INSTANCE_CLASS_MEMORY_GB, getInstanceMemoryGB } from '../constants';

describe('CLOUDWATCH_METRICS', () => {
  it('has DEFAULT_LOOKBACK_HOURS set to 24', () => {
    expect(CLOUDWATCH_METRICS.DEFAULT_LOOKBACK_HOURS).toStrictEqual(24);
  });

  it('has PERIOD_SECONDS set to 60', () => {
    expect(CLOUDWATCH_METRICS.PERIOD_SECONDS).toStrictEqual(60);
  });
});

describe('PERFORMANCE_INSIGHTS', () => {
  it('has DEFAULT_LOOKBACK_HOURS set to 1', () => {
    expect(PERFORMANCE_INSIGHTS.DEFAULT_LOOKBACK_HOURS).toStrictEqual(1);
  });

  it('has PERIOD_SECONDS set to 60', () => {
    expect(PERFORMANCE_INSIGHTS.PERIOD_SECONDS).toStrictEqual(60);
  });

  it('has DEFAULT_TOP_N set to 10', () => {
    expect(PERFORMANCE_INSIGHTS.DEFAULT_TOP_N).toStrictEqual(10);
  });
});

describe('RDS_THRESHOLDS', () => {
  describe('CPU thresholds', () => {
    it('has CPU_WARNING_PERCENT at 80', () => {
      expect(RDS_THRESHOLDS.CPU_WARNING_PERCENT).toStrictEqual(80);
    });

    it('has CPU_CRITICAL_PERCENT at 95', () => {
      expect(RDS_THRESHOLDS.CPU_CRITICAL_PERCENT).toStrictEqual(95);
    });

    it('warning is less than critical', () => {
      expect(RDS_THRESHOLDS.CPU_WARNING_PERCENT).toBeLessThan(RDS_THRESHOLDS.CPU_CRITICAL_PERCENT);
    });
  });

  describe('Memory thresholds', () => {
    it('has MEMORY_WARNING_PERCENT at 25', () => {
      expect(RDS_THRESHOLDS.MEMORY_WARNING_PERCENT).toStrictEqual(25);
    });

    it('has MEMORY_CRITICAL_PERCENT at 10', () => {
      expect(RDS_THRESHOLDS.MEMORY_CRITICAL_PERCENT).toStrictEqual(10);
    });

    it('critical is less than warning (lower memory is worse)', () => {
      expect(RDS_THRESHOLDS.MEMORY_CRITICAL_PERCENT).toBeLessThan(RDS_THRESHOLDS.MEMORY_WARNING_PERCENT);
    });
  });

  describe('Replica lag thresholds', () => {
    it('has REPLICA_LAG_WARNING_MS at 100', () => {
      expect(RDS_THRESHOLDS.REPLICA_LAG_WARNING_MS).toStrictEqual(100);
    });

    it('has REPLICA_LAG_CRITICAL_MS at 1000', () => {
      expect(RDS_THRESHOLDS.REPLICA_LAG_CRITICAL_MS).toStrictEqual(1000);
    });
  });

  describe('Buffer cache thresholds', () => {
    it('has BUFFER_CACHE_HIT_WARNING_PERCENT at 95', () => {
      expect(RDS_THRESHOLDS.BUFFER_CACHE_HIT_WARNING_PERCENT).toStrictEqual(95);
    });

    it('has BUFFER_CACHE_HIT_CRITICAL_PERCENT at 90', () => {
      expect(RDS_THRESHOLDS.BUFFER_CACHE_HIT_CRITICAL_PERCENT).toStrictEqual(90);
    });
  });
});

describe('INSTANCE_CLASS_MEMORY_GB', () => {
  describe('r5 instance classes', () => {
    it('has db.r5.large at 16 GB', () => {
      expect(INSTANCE_CLASS_MEMORY_GB['db.r5.large']).toStrictEqual(16);
    });

    it('has db.r5.xlarge at 32 GB', () => {
      expect(INSTANCE_CLASS_MEMORY_GB['db.r5.xlarge']).toStrictEqual(32);
    });

    it('has db.r5.2xlarge at 64 GB', () => {
      expect(INSTANCE_CLASS_MEMORY_GB['db.r5.2xlarge']).toStrictEqual(64);
    });

    it('has db.r5.4xlarge at 128 GB', () => {
      expect(INSTANCE_CLASS_MEMORY_GB['db.r5.4xlarge']).toStrictEqual(128);
    });
  });

  describe('r6g instance classes', () => {
    it('has db.r6g.large at 16 GB', () => {
      expect(INSTANCE_CLASS_MEMORY_GB['db.r6g.large']).toStrictEqual(16);
    });

    it('has db.r6g.2xlarge at 64 GB', () => {
      expect(INSTANCE_CLASS_MEMORY_GB['db.r6g.2xlarge']).toStrictEqual(64);
    });
  });

  describe('r6i instance classes', () => {
    it('has db.r6i.large at 16 GB', () => {
      expect(INSTANCE_CLASS_MEMORY_GB['db.r6i.large']).toStrictEqual(16);
    });

    it('has db.r6i.32xlarge at 1024 GB', () => {
      expect(INSTANCE_CLASS_MEMORY_GB['db.r6i.32xlarge']).toStrictEqual(1024);
    });
  });
});

describe('getInstanceMemoryGB', () => {
  describe('with known instance class', () => {
    let result: number | undefined;

    beforeEach(() => {
      result = getInstanceMemoryGB('db.r6g.2xlarge');
    });

    it('returns the correct memory in GB', () => {
      expect(result).toStrictEqual(64);
    });
  });

  describe('with unknown instance class', () => {
    let result: number | undefined;

    beforeEach(() => {
      result = getInstanceMemoryGB('db.unknown.large');
    });

    it('returns undefined', () => {
      expect(result).toBeUndefined();
    });
  });
});
