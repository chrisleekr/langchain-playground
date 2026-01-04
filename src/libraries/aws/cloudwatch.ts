import { CloudWatchClient, GetMetricDataCommand, type MetricDataQuery, type MetricDataResult } from '@aws-sdk/client-cloudwatch';

import { AwsClientCache, buildAwsClientConfig } from './clientManager';

/**
 * Cache of CloudWatch clients by region.
 *
 * Uses AwsClientCache for proper lifecycle management.
 *
 * @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/creating-and-calling-service-objects.html
 */
const cloudWatchClientCache = new AwsClientCache<CloudWatchClient>(region => new CloudWatchClient(buildAwsClientConfig(region)));

/**
 * Get or create a cached CloudWatch client for a region.
 *
 * @param region - AWS region
 * @returns Configured CloudWatch client
 */
export const getCloudWatchClient = (region: string): CloudWatchClient => cloudWatchClientCache.getClient(region);

/**
 * Clear all cached CloudWatch clients.
 *
 * Call during graceful shutdown to clean up resources.
 */
export const clearCloudWatchClientCache = (): void => cloudWatchClientCache.clear();

/**
 * Aggregation type for extractMetricValue.
 */
export type MetricAggregation = 'average' | 'maximum' | 'minimum';

/**
 * Extract a single aggregated value from metric data results.
 *
 * Note: When aggregating multiple data points, this computes the aggregate of
 * already-aggregated statistics (e.g., average of averages). For diagnostic
 * purposes this is acceptable, but it's not mathematically equivalent to
 * computing the true aggregate over all raw data points.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Statistics-definitions.html
 *
 * @param results - Array of metric data results from CloudWatch
 * @param id - Metric ID to extract
 * @param aggregation - How to aggregate multiple data points: 'average', 'maximum', or 'minimum'
 * @returns The aggregated value, or undefined if no data points exist
 */
export const extractMetricValue = (results: MetricDataResult[], id: string, aggregation: MetricAggregation = 'average'): number | undefined => {
  const result = results.find(r => r.Id === id);
  if (!result?.Values || result.Values.length === 0) {
    return undefined;
  }

  // Filter out undefined/null values
  const values = result.Values.filter((v): v is number => v !== undefined && v !== null);
  if (values.length === 0) {
    return undefined;
  }

  switch (aggregation) {
    case 'maximum':
      return Math.max(...values);
    case 'minimum':
      return Math.min(...values);
    case 'average':
    default: {
      const sum = values.reduce((acc, val) => acc + val, 0);
      return sum / values.length;
    }
  }
};

/**
 * Timestamp range result from getTimestampRange.
 */
export interface TimestampRange {
  firstTimestamp?: Date;
  lastTimestamp?: Date;
  dataPointCount: number;
}

/**
 * Get unique timestamps from metric data results.
 * Returns the count of unique time points, not total values across all metrics.
 *
 * @param results - Array of metric data results
 * @returns Timestamp range with first/last timestamps and count
 */
export const getTimestampRange = (results: MetricDataResult[]): TimestampRange => {
  // Use Set to deduplicate timestamps across all metrics
  const uniqueTimestamps = new Set<number>();

  for (const result of results) {
    if (result.Timestamps) {
      for (const ts of result.Timestamps) {
        uniqueTimestamps.add(ts.getTime());
      }
    }
  }

  if (uniqueTimestamps.size === 0) {
    return { dataPointCount: 0 };
  }

  // Sort timestamps and get first/last
  const sortedTimestamps = Array.from(uniqueTimestamps).sort((a, b) => a - b);

  return {
    firstTimestamp: new Date(sortedTimestamps[0]!),
    lastTimestamp: new Date(sortedTimestamps[sortedTimestamps.length - 1]!),
    dataPointCount: sortedTimestamps.length
  };
};

/**
 * Merge paginated metric results into a single result array.
 *
 * Handles the case where the same metric ID appears across multiple pages
 * by concatenating their values and timestamps.
 *
 * @param existingResults - Current accumulated results
 * @param newResults - New page of results to merge
 * @returns Merged results
 */
export const mergeMetricResults = (existingResults: MetricDataResult[], newResults: MetricDataResult[]): MetricDataResult[] => {
  const resultMap = new Map<string, MetricDataResult>();

  // Add existing results to map
  for (const result of existingResults) {
    if (result.Id) {
      resultMap.set(result.Id, { ...result });
    }
  }

  // Merge or add new results
  for (const result of newResults) {
    if (!result.Id) continue;

    const existing = resultMap.get(result.Id);
    if (existing) {
      // Merge values and timestamps
      existing.Values = [...(existing.Values ?? []), ...(result.Values ?? [])];
      existing.Timestamps = [...(existing.Timestamps ?? []), ...(result.Timestamps ?? [])];
    } else {
      resultMap.set(result.Id, { ...result });
    }
  }

  return Array.from(resultMap.values());
};

/**
 * Parameters for querying CloudWatch metrics with pagination.
 */
export interface QueryMetricsParams {
  /** AWS region */
  region: string;
  /** Metric data queries */
  metricQueries: MetricDataQuery[];
  /** Start time for metrics query */
  startTime: Date;
  /** End time for metrics query */
  endTime: Date;
  /** Optional abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Query CloudWatch metrics with automatic pagination.
 *
 * Uses GetMetricData API for efficient batch retrieval of multiple metrics.
 * Handles pagination to retrieve all data points.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_GetMetricData.html
 *
 * @param params - Query parameters
 * @returns Array of metric data results
 */
export const queryCloudWatchMetrics = async (params: QueryMetricsParams): Promise<MetricDataResult[]> => {
  const { region, metricQueries, startTime, endTime, abortSignal } = params;
  const client = getCloudWatchClient(region);

  // Handle pagination - GetMetricData returns NextToken when more results exist
  // @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/APIReference/API_GetMetricData.html
  let allResults: MetricDataResult[] = [];
  let nextToken: string | undefined;

  do {
    const command = new GetMetricDataCommand({
      MetricDataQueries: metricQueries,
      StartTime: startTime,
      EndTime: endTime,
      ScanBy: 'TimestampDescending',
      NextToken: nextToken
    });

    // Pass abortSignal to support request cancellation
    // @see https://aws.amazon.com/blogs/developer/abortcontroller-in-modular-aws-sdk-for-javascript/
    const response = await client.send(command, { abortSignal });
    const pageResults = response.MetricDataResults ?? [];

    allResults = mergeMetricResults(allResults, pageResults);
    nextToken = response.NextToken;
  } while (nextToken);

  return allResults;
};
