import type { Logger } from 'pino';
import {
  PIClient,
  DescribeDimensionKeysCommand,
  GetDimensionKeyDetailsCommand,
  InvalidArgumentException,
  NotAuthorizedException,
  type DimensionKeyDescription
} from '@aws-sdk/client-pi';

import { AwsClientCache, buildAwsClientConfig } from './clientManager';
import type { TopSQLResult, RdsPerformanceInsightsSummary } from './types';

/**
 * Cache of Performance Insights clients by region.
 *
 * Uses AwsClientCache for proper lifecycle management.
 *
 * @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/creating-and-calling-service-objects.html
 */
const piClientCache = new AwsClientCache<PIClient>(region => new PIClient(buildAwsClientConfig(region)));

/**
 * Get or create a cached Performance Insights client for a region.
 *
 * @param region - AWS region
 * @returns Configured PI client
 */
const getPIClient = (region: string): PIClient => piClientCache.getClient(region);

/**
 * Clear all cached Performance Insights clients.
 *
 * Call during graceful shutdown to clean up resources.
 */
export const clearPIClientCache = (): void => piClientCache.clear();

/**
 * Error thrown when DbiResourceId is not available for Performance Insights API.
 *
 * The Performance Insights API requires the DbiResourceId (format: db-XXXXXXXXXXXX),
 * which is a unique immutable identifier returned by DescribeDBInstances.
 * This error indicates that the DbiResourceId was not provided or not available.
 */
export class MissingDbiResourceIdError extends Error {
  readonly instanceArn: string;

  constructor(instanceArn: string) {
    super(
      `DbiResourceId is required for Performance Insights API but was not provided. ` +
        `Instance ARN: ${instanceArn}. ` +
        `Ensure DescribeDBInstances returns DbiResourceId for this instance.`
    );
    this.name = 'MissingDbiResourceIdError';
    this.instanceArn = instanceArn;
    Object.setPrototypeOf(this, MissingDbiResourceIdError.prototype);
  }
}

/**
 * Build the resource identifier for Performance Insights API.
 *
 * The PI API requires the DbiResourceId (format: db-XXXXXXXXXXXX),
 * which is a unique immutable identifier returned by DescribeDBInstances.
 *
 * @see https://docs.aws.amazon.com/performance-insights/latest/APIReference/API_DescribeDimensionKeys.html
 *
 * @param dbiResourceId - DBI Resource ID from DescribeDBInstances (format: db-XXXX)
 * @param instanceArn - Full RDS instance ARN (used for error messages)
 * @returns Resource identifier for PI API
 * @throws {MissingDbiResourceIdError} If dbiResourceId is not provided
 */
const buildPIResourceIdentifier = (dbiResourceId: string | undefined, instanceArn: string): string => {
  if (!dbiResourceId) {
    throw new MissingDbiResourceIdError(instanceArn);
  }
  return dbiResourceId;
};

/**
 * Parameters for querying Top SQL queries.
 */
export interface QueryTopSQLParams {
  /** Full RDS instance ARN (e.g., arn:aws:rds:region:account:db:instance-id) */
  instanceArn: string;
  /** DBI Resource ID - unique immutable identifier required by Performance Insights API (format: db-XXXX) */
  dbiResourceId?: string;
  /** AWS region */
  region: string;
  /** Start time for the query period */
  startTime: Date;
  /** End time for the query period */
  endTime: Date;
  /** Maximum number of SQL queries to return (default: 10) */
  topN?: number;
  /** Optional abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Map a dimension key to our TopSQLResult type.
 */
const mapDimensionKeyToSQL = (key: DimensionKeyDescription, totalLoad: number): TopSQLResult => {
  const dimensions = key.Dimensions ?? {};

  // SQL ID is typically in db.sql.id dimension
  const sqlId = dimensions['db.sql.id'] ?? dimensions['db.sql_tokenized.id'] ?? 'unknown';

  // SQL text might be truncated - get what's available
  const sqlText = dimensions['db.sql.statement'] ?? dimensions['db.sql_tokenized.statement'] ?? '';

  const avgDbLoad = key.Total ?? 0;
  const loadPercentage = totalLoad > 0 ? (avgDbLoad / totalLoad) * 100 : 0;

  return {
    sqlId,
    sqlText,
    avgDbLoad,
    loadPercentage
  };
};

/**
 * Query top SQL statements by database load using Performance Insights.
 *
 * Uses DescribeDimensionKeys API with db.load.avg metric grouped by db.sql.
 *
 * @param params - Query parameters
 * @param logger - Logger instance
 * @returns Array of top SQL results
 */
export const queryTopSQLQueries = async (params: QueryTopSQLParams, logger: Logger): Promise<TopSQLResult[]> => {
  const { instanceArn, dbiResourceId, region, startTime, endTime, topN = 10, abortSignal } = params;
  const nodeLogger = logger.child({
    function: 'queryTopSQLQueries',
    instanceArn,
    dbiResourceId,
    region,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    topN
  });

  const client = getPIClient(region);

  // Validate DbiResourceId before making API call
  let resourceId: string;
  try {
    resourceId = buildPIResourceIdentifier(dbiResourceId, instanceArn);
  } catch (error) {
    if (error instanceof MissingDbiResourceIdError) {
      nodeLogger.warn({ instanceArn }, 'DbiResourceId not available - cannot query Performance Insights');
      return [];
    }
    throw error;
  }

  nodeLogger.debug({ resourceId }, 'Querying Performance Insights for top SQL');

  try {
    const command = new DescribeDimensionKeysCommand({
      ServiceType: 'RDS',
      Identifier: resourceId,
      StartTime: startTime,
      EndTime: endTime,
      Metric: 'db.load.avg',
      GroupBy: {
        Group: 'db.sql',
        Dimensions: ['db.sql.id', 'db.sql.statement'],
        Limit: topN
      },
      // Period in seconds - use 60 for 1-minute granularity
      PeriodInSeconds: 60
    });

    // Pass abortSignal to support request cancellation
    // @see https://aws.amazon.com/blogs/developer/abortcontroller-in-modular-aws-sdk-for-javascript/
    const response = await client.send(command, { abortSignal });
    const keys = response.Keys ?? [];

    nodeLogger.debug({ keyCount: keys.length }, 'Received dimension keys');

    // Calculate total load for percentage calculation
    const totalLoad = keys.reduce((sum, key) => sum + (key.Total ?? 0), 0);

    const results = keys.map(key => mapDimensionKeyToSQL(key, totalLoad));

    nodeLogger.info({ queryCount: results.length, totalLoad }, 'Top SQL query complete');

    return results;
  } catch (error) {
    // Use proper AWS SDK exception classes for type-safe error handling
    // @see https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/handling-exceptions.html
    if (error instanceof InvalidArgumentException) {
      nodeLogger.warn({ error: error.message }, 'Performance Insights not available or invalid parameters');
      return [];
    }
    if (error instanceof NotAuthorizedException) {
      nodeLogger.warn({ error: error.message }, 'Not authorized to access Performance Insights');
      return [];
    }
    throw error;
  }
};

/**
 * Get full SQL text for a SQL ID using GetDimensionKeyDetails.
 *
 * Use this when the SQL text from DescribeDimensionKeys is truncated.
 *
 * @param instanceArn - Full RDS instance ARN
 * @param dbiResourceId - DBI Resource ID for Performance Insights API
 * @param region - AWS region
 * @param sqlId - SQL ID to get details for
 * @param logger - Logger instance
 * @param abortSignal - Optional abort signal for cancellation
 * @returns Full SQL text or null if not available
 */
export const getFullSQLText = async (
  instanceArn: string,
  dbiResourceId: string | undefined,
  region: string,
  sqlId: string,
  logger: Logger,
  abortSignal?: AbortSignal
): Promise<string | null> => {
  const nodeLogger = logger.child({
    function: 'getFullSQLText',
    instanceArn,
    dbiResourceId,
    region,
    sqlId
  });

  const client = getPIClient(region);

  // Validate DbiResourceId before making API call
  let resourceId: string;
  try {
    resourceId = buildPIResourceIdentifier(dbiResourceId, instanceArn);
  } catch (error) {
    if (error instanceof MissingDbiResourceIdError) {
      nodeLogger.warn({ instanceArn }, 'DbiResourceId not available - cannot get full SQL text');
      return null;
    }
    throw error;
  }

  try {
    const command = new GetDimensionKeyDetailsCommand({
      ServiceType: 'RDS',
      Identifier: resourceId,
      Group: 'db.sql',
      GroupIdentifier: sqlId,
      RequestedDimensions: ['db.sql.statement']
    });

    // Pass abortSignal to support request cancellation
    // @see https://aws.amazon.com/blogs/developer/abortcontroller-in-modular-aws-sdk-for-javascript/
    const response = await client.send(command, { abortSignal });
    const dimensions = response.Dimensions ?? [];

    if (dimensions.length > 0) {
      const sqlDimension = dimensions.find(d => d.Dimension === 'db.sql.statement');
      if (sqlDimension?.Value) {
        nodeLogger.debug('Retrieved full SQL text');
        return sqlDimension.Value;
      }
    }

    nodeLogger.debug('Full SQL text not available');
    return null;
  } catch (error) {
    nodeLogger.warn({ error }, 'Failed to get full SQL text');
    return null;
  }
};

/**
 * Query Performance Insights summary for an RDS instance.
 *
 * Combines top SQL queries with metadata about the query.
 *
 * @param params - Query parameters
 * @param performanceInsightsEnabled - Whether PI is enabled for this instance
 * @param logger - Logger instance
 * @returns Performance Insights summary
 */
export const queryPerformanceInsightsSummary = async (
  params: QueryTopSQLParams,
  performanceInsightsEnabled: boolean,
  logger: Logger
): Promise<RdsPerformanceInsightsSummary> => {
  const { instanceArn, region, startTime, endTime } = params;

  // Extract instance identifier from ARN
  const instanceIdentifier = instanceArn.split(':db:')[1] ?? instanceArn;

  if (!performanceInsightsEnabled) {
    logger.info({ instanceIdentifier }, 'Performance Insights is not enabled for this instance');
    return {
      instanceIdentifier,
      resourceArn: instanceArn,
      region,
      startTime,
      endTime,
      topSQLQueries: [],
      performanceInsightsEnabled: false,
      error: 'Performance Insights is not enabled for this instance'
    };
  }

  try {
    const topSQLQueries = await queryTopSQLQueries(params, logger);

    logger.info({ instanceIdentifier, queryCount: topSQLQueries.length }, 'Top SQL queries retrieved');
    logger.debug({ instanceIdentifier, topSQLQueries }, 'Top SQL queries details');
    return {
      instanceIdentifier,
      resourceArn: instanceArn,
      region,
      startTime,
      endTime,
      topSQLQueries,
      performanceInsightsEnabled: true
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ instanceIdentifier, error: errorMessage }, 'Failed to query Performance Insights');

    return {
      instanceIdentifier,
      resourceArn: instanceArn,
      region,
      startTime,
      endTime,
      topSQLQueries: [],
      performanceInsightsEnabled: true,
      error: `Failed to query Performance Insights: ${errorMessage}`
    };
  }
};
