import { beforeEach, describe, expect, it } from '@jest/globals';

import { toonEncodeForLLM } from '../toonEncoder';

describe('toonEncodeForLLM', () => {
  let result: string;

  describe('with uniform array of objects', () => {
    const instances = [
      { id: 'db-1', cpu: 45.2, memory: 1024 },
      { id: 'db-2', cpu: 32.1, memory: 2048 }
    ];

    beforeEach(() => {
      result = toonEncodeForLLM(instances);
    });

    it('encodes to TOON format with tabular header showing array length', () => {
      // TOON uses [N\t]{fields}: header for uniform arrays (with tab delimiter)
      // @see https://github.com/toon-format/toon/blob/main/docs/guide/format-overview.md#delimiter-options
      expect(result).toMatch(/\[2\t?\]/);
    });

    it('includes field names in the header', () => {
      // TOON declares fields in the header (order may vary)
      expect(result).toContain('id');
      expect(result).toContain('cpu');
      expect(result).toContain('memory');
      // Should have curly braces around field list
      expect(result).toMatch(/\{[^}]+\}/);
    });

    it('includes data values in the output', () => {
      expect(result).toContain('db-1');
      expect(result).toContain('db-2');
      expect(result).toContain('45.2');
      expect(result).toContain('1024');
    });

    it('produces fewer characters than JSON.stringify', () => {
      const jsonResult = JSON.stringify(instances, null, 2);
      expect(result.length).toBeLessThan(jsonResult.length);
    });
  });

  describe('with single object', () => {
    const summary = {
      totalRequested: 3,
      instancesWithMetrics: 2,
      totalErrors: 0
    };

    beforeEach(() => {
      result = toonEncodeForLLM(summary);
    });

    it('encodes single object to TOON format with field names', () => {
      expect(result).toContain('totalRequested');
      expect(result).toContain('instancesWithMetrics');
      expect(result).toContain('totalErrors');
    });

    it('includes field values', () => {
      expect(result).toContain('3');
      expect(result).toContain('2');
      expect(result).toContain('0');
    });
  });

  describe('with nested objects in array', () => {
    const tasks = [
      {
        taskId: 'task-1',
        status: { lastStatus: 'RUNNING', desiredStatus: 'RUNNING' },
        metrics: { cpu: 50.5, memory: 75.2 }
      },
      {
        taskId: 'task-2',
        status: { lastStatus: 'STOPPED', desiredStatus: 'STOPPED' },
        metrics: { cpu: 0, memory: 0 }
      }
    ];

    beforeEach(() => {
      result = toonEncodeForLLM(tasks);
    });

    it('encodes nested objects maintaining structure', () => {
      expect(result).toContain('task-1');
      expect(result).toContain('task-2');
      expect(result).toContain('RUNNING');
      expect(result).toContain('STOPPED');
    });

    it('includes metrics values', () => {
      expect(result).toContain('50.5');
      expect(result).toContain('75.2');
    });
  });

  describe('with empty array', () => {
    beforeEach(() => {
      result = toonEncodeForLLM([]);
    });

    it('encodes empty array to TOON format', () => {
      // Empty array should produce minimal output
      expect(result).toBeDefined();
      expect(result.length).toBeLessThan(10);
    });
  });

  describe('with null values', () => {
    const dataWithNulls = [
      { id: 'item-1', value: null, extra: 'test' },
      { id: 'item-2', value: 42, extra: null }
    ];

    beforeEach(() => {
      result = toonEncodeForLLM(dataWithNulls);
    });

    it('handles null values in TOON output', () => {
      expect(result).toContain('item-1');
      expect(result).toContain('item-2');
      expect(result).toContain('test');
      expect(result).toContain('42');
    });
  });

  describe('with string values containing special characters', () => {
    const dataWithSpecialChars = [
      { id: 'sql-1', query: 'SELECT * FROM users WHERE name = "John"' },
      { id: 'sql-2', query: "INSERT INTO logs VALUES ('test', 123)" }
    ];

    beforeEach(() => {
      result = toonEncodeForLLM(dataWithSpecialChars);
    });

    it('handles special characters in output', () => {
      expect(result).toContain('sql-1');
      expect(result).toContain('sql-2');
      // TOON should properly escape or quote strings with special chars
      expect(result).toContain('SELECT');
      expect(result).toContain('INSERT');
    });
  });

  describe('token efficiency comparison', () => {
    const largeDataset = Array.from({ length: 10 }, (_, i) => ({
      instanceId: `db-instance-${i + 1}`,
      cpuUtilization: Math.random() * 100,
      memoryUtilization: Math.random() * 100,
      connections: Math.floor(Math.random() * 1000),
      replicaLag: Math.random() * 50,
      status: 'available'
    }));

    beforeEach(() => {
      result = toonEncodeForLLM(largeDataset);
    });

    it('produces significantly fewer characters than pretty-printed JSON for uniform arrays', () => {
      const jsonPretty = JSON.stringify(largeDataset, null, 2);
      const savings = ((jsonPretty.length - result.length) / jsonPretty.length) * 100;

      // TOON should achieve at least 40% savings for uniform tabular data
      expect(savings).toBeGreaterThan(40);
    });

    it('produces fewer characters than compact JSON for uniform arrays', () => {
      const jsonCompact = JSON.stringify(largeDataset);

      // TOON should also beat compact JSON for uniform arrays
      expect(result.length).toBeLessThan(jsonCompact.length);
    });
  });
});
