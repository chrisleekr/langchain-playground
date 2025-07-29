import config from 'config';
import { formatTimestamp } from '../slack/utils';

export const normalizeLogs = (data: Record<string, unknown>[]): Record<string, unknown>[] => {
  const unnecessaryProperties = config.get<string[]>('newrelic.excludeProperties') || [];

  data.forEach(log => {
    Object.keys(log).forEach(key => {
      // Remove unnecessary properties
      if (unnecessaryProperties.includes(key)) {
        delete (log as Record<string, unknown>)[key];
      }
      // Convert timestamp to date time timezone
      if (['timestamp', 'createdAt', 'updatedAt'].includes(key)) {
        const timestamp = parseInt((log as Record<string, unknown>)[key] as string) / 1000;
        (log as Record<string, unknown>)[`${key}Formatted`] = formatTimestamp(timestamp.toString());
      }
    });
  });

  return data as Record<string, unknown>[];
};

export const normalizeContextData = (data: Record<string, unknown>[]): Record<string, unknown>[] => {
  // Loop all key/value pairs in the data
  data.forEach(item => {
    Object.keys(item).forEach(key => {
      if (item[key] === null) {
        delete item[key];
      } else if (['createdAt', 'updatedAt', 'acknowledgedAt', 'closedAt'].includes(key)) {
        const timestamp = Number((item as Record<string, unknown>)[key]) / 1000;
        (item as Record<string, unknown>)[`${key}Formatted`] = formatTimestamp(timestamp.toString());
      }
    });
  });

  return data as Record<string, unknown>[];
};

export const getTraceIds = (logs: Record<string, unknown>[]): string[] => {
  const traceIds = logs.map((log: Record<string, unknown>) => log['trace.id']) as string[];

  return [...new Set(traceIds.filter(id => id !== null && id !== undefined))] as string[];
};
