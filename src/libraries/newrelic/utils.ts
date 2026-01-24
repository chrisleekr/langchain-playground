import config from 'config';
import { formatTimestamp } from '../slack/utils';

export const normalizeLogs = (data: Record<string, unknown>[]): Record<string, unknown>[] => {
  const unnecessaryProperties = config.get<string[]>('newrelic.excludeProperties') || [];
  const timestampKeys = ['timestamp', 'createdAt', 'updatedAt'];

  data.forEach(log => {
    Object.keys(log).forEach(key => {
      // Remove unnecessary properties - key is from Object.keys iteration
      if (unnecessaryProperties.includes(key)) {
        // eslint-disable-next-line security/detect-object-injection -- Key from Object.keys
        delete log[key];
      }
      // Convert timestamp to date time timezone
      if (timestampKeys.includes(key) && Object.hasOwn(log, key)) {
        // eslint-disable-next-line security/detect-object-injection -- Validated with Object.hasOwn
        const timestamp = Number(log[key]) / 1000;
        log[`${key}Formatted`] = formatTimestamp(timestamp.toString());
      }
    });
  });

  return data;
};

export const normalizeContextData = (data: Record<string, unknown>[]): Record<string, unknown>[] => {
  const timestampKeys = ['createdAt', 'updatedAt', 'acknowledgedAt', 'closedAt'];

  // Loop all key/value pairs in the data
  data.forEach(item => {
    Object.keys(item).forEach(key => {
      // eslint-disable-next-line security/detect-object-injection -- Key from Object.keys
      if (item[key] === null) {
        // eslint-disable-next-line security/detect-object-injection -- Key from Object.keys
        delete item[key];
      } else if (timestampKeys.includes(key) && Object.hasOwn(item, key)) {
        // eslint-disable-next-line security/detect-object-injection -- Validated with Object.hasOwn
        const timestamp = Number(item[key]) / 1000;
        item[`${key}Formatted`] = formatTimestamp(timestamp.toString());
      }
    });
  });

  return data;
};

export const getTraceIds = (logs: Record<string, unknown>[]): string[] => {
  const traceIds = logs.map((log: Record<string, unknown>) => log['trace.id']) as string[];

  return [...new Set(traceIds.filter(id => id !== null && id !== undefined))] as string[];
};
