import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import type { Logger } from 'pino';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

import type { LLMToolOptions } from '@/api/agent/domains/shared/types';
import { getErrorMessage, withTimeout, DEFAULT_STEP_TIMEOUT_MS, formatMetricPair, formatBytesMetricPair, formatLatencyMs } from '@/api/agent/core';
import { createToolSuccess, createToolError } from '@/api/agent/domains/shared/toolResponse';
import { formatDate, formatTimeRange } from '@/api/agent/domains/shared/dateUtils';
import {
  gatherInstanceStatus,
  gatherCloudWatchMetrics,
  gatherTopSQLQueries,
  type InvestigationTimeRange,
  type RdsInvestigationResult,
  type RdsInvestigationSummary
} from './investigateRdsInstances';

/**
 * Tool name constant to avoid magic strings.
 */
const TOOL_NAME = 'investigate_and_analyze_rds_instances' as const;

/**
 * Schema for RDS identifier input.
 */
const rdsIdentifierSchema = z.object({
  identifier: z.string().describe('RDS DB instance or cluster identifier'),
  region: z.string().describe('AWS region')
});

/**
 * Schema for the combined investigate and analyze tool input.
 *
 * Note: Default values are specified in descriptions for LLM visibility.
 * Zod's .default() ensures the values are applied during parsing.
 *
 * @see https://js.langchain.com/docs/concepts/tools
 */
const investigateAndAnalyzeSchema = z.object({
  dbIdentifiers: z.array(rdsIdentifierSchema).min(1).max(20).describe('Array of RDS DB instance or cluster identifiers with regions'),
  investigationContext: z.string().optional().describe('Additional context about the investigation (e.g., alert details)'),
  includeMetrics: z.boolean().optional().default(true).describe('Whether to gather CloudWatch metrics. Defaults to true if not specified.'),
  includeTopSQL: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to gather Top SQL from Performance Insights. Defaults to true if not specified.'),
  metricsStartTime: z
    .string()
    .optional()
    .describe(
      'Start time for queries in ISO 8601 format. Must be provided together with metricsEndTime. ' +
        'When not provided: CloudWatch metrics defaults to last 24 hours, Performance Insights Top SQL defaults to last 1 hour.'
    ),
  metricsEndTime: z
    .string()
    .optional()
    .describe(
      'End time for queries in ISO 8601 format. Must be provided together with metricsStartTime. ' +
        'When not provided: CloudWatch metrics defaults to last 24 hours, Performance Insights Top SQL defaults to last 1 hour.'
    ),
  topSQLLimit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Maximum number of top SQL queries to retrieve per instance. Defaults to 10 if not specified.')
});

/**
 * Analysis prompt template for RDS health analysis.
 *
 * Best practices applied:
 * - XML tags for structured sections (Anthropic recommendation)
 * - Reference data for common thresholds
 * - Edge case handling guidelines
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags
 */
const analysisPromptTemplate = ChatPromptTemplate.fromMessages([
  [
    'system',
    `<role>
You are an AWS RDS Aurora PostgreSQL expert analyzing database health and performance data.
</role>

<task>
Analyze the provided RDS investigation data and provide a structured analysis.
</task>

<reference_data>
<resource_thresholds>
| Metric | Warning | Critical |
|--------|---------|----------|
| CPU Utilization | > 80% | > 95% |
| Freeable Memory | < 25% of instance memory | < 10% of instance memory |
| Database Connections | > 80% of max_connections | > 95% of max_connections |
| Aurora Replica Lag | > 100ms | > 1000ms |
| Buffer Cache Hit Ratio | < 95% | < 90% |
| Disk Queue Depth | > 10 | > 50 |
| Deadlocks | > 0 (any) | > 1/second |
</resource_thresholds>

<common_wait_events>
| Wait Event | Description | Common Cause |
|------------|-------------|--------------|
| LWLock:BufferContent | Lightweight lock on buffer | Contention on shared buffers |
| IO:DataFileRead | Reading data files | Missing indexes, large scans |
| IO:WALWrite | Writing WAL | Heavy write workload |
| Lock:transactionid | Transaction lock | Long transactions, blocking |
| CPU | CPU processing | Complex queries, lack of resources |
</common_wait_events>

<instance_classes>
Common Aurora PostgreSQL instance classes and their approximate memory:
- db.r5.large: 16 GB
- db.r5.xlarge: 32 GB
- db.r5.2xlarge: 64 GB
- db.r5.4xlarge: 128 GB
- db.r6g.large: 16 GB
- db.r6g.xlarge: 32 GB
- db.r6g.2xlarge: 64 GB
- db.r6g.4xlarge: 128 GB
</instance_classes>
</reference_data>

<output_format>
1. **Summary**: Brief overview (1-2 sentences) of cluster health status

2. **Instance Health**: For each instance, include:
   - Instance Identifier (exact name for AWS console lookup)
   - Role (Writer/Reader)
   - Key metrics: CPU%, Memory (GB free / % used), Connections, Replica Lag (if reader)
   - Status assessment (Healthy/Warning/Critical)

3. **Issues Identified**: For each issue found:
   - Affected Instance Identifier (exact name)
   - Metric name, current value, and threshold crossed
   - Severity (Warning/Critical)

4. **Top SQL Analysis**: For queries with >5% DB load:
   - Instance Identifier where the query runs
   - SQL ID (exact ID for Performance Insights lookup, e.g., "4677978F400AC5D0...")
   - Avg DB Load and Load Percentage
   - Query pattern description and specific optimization suggestion

5. **Recommendations**: Actionable steps with specifics:
   - Reference SQL IDs when suggesting query optimization
   - Include specific column names for index suggestions
   - Reference instance identifiers when suggesting configuration changes
</output_format>

<guidelines>
- Be concise but thorough. Focus on actionable insights.
- ALWAYS include exact Instance Identifiers and SQL IDs - these are required for troubleshooting.
- If data is missing or unavailable, acknowledge it explicitly.
- If all instances are healthy with no issues, state "No issues identified" and summarize the healthy state with key metrics.
- For Top SQL, include queries with database load > 5% and always show the SQL ID.
- When recommending index changes, specify the exact table and column names from the SQL text.
- DO NOT fabricate data - only report what is provided.
</guidelines>`
  ],
  [
    'human',
    `<investigation_summary>
{summary}
</investigation_summary>

<instance_details>
{instanceDetails}
</instance_details>

<top_sql_queries>
{topSQLQueries}
</top_sql_queries>

<additional_context>
{investigationContext}
</additional_context>

Provide your analysis:`
  ]
]);

/**
 * Creates a combined tool that investigates RDS instances AND analyzes them in one call.
 *
 * Keeps raw AWS API data internal to reduce token usage when passing to other agents.
 *
 * Returns only:
 * - analysis: LLM-generated analysis summary
 * - summary: Investigation statistics
 */
export const createInvestigateAndAnalyzeRdsInstancesTool = (options: LLMToolOptions) => {
  const { logger: parentLogger, model, stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS } = options;
  const logger: Logger = parentLogger.child({ tool: TOOL_NAME });

  return tool(
    async ({ dbIdentifiers, investigationContext, includeMetrics, includeTopSQL, metricsStartTime, metricsEndTime, topSQLLimit }) => {
      const startTime = Date.now();

      // Validate and parse explicit time range if provided
      let metricsTimeRange: InvestigationTimeRange | undefined;

      if (metricsStartTime && metricsEndTime) {
        const parsedStart = new Date(metricsStartTime);
        const parsedEnd = new Date(metricsEndTime);

        // Validate dates are valid
        if (isNaN(parsedStart.getTime())) {
          return createToolError(TOOL_NAME, `Invalid metricsStartTime: '${metricsStartTime}' is not a valid ISO 8601 date`, {
            doNotRetry: true,
            suggestedAction: 'Provide a valid ISO 8601 date string (e.g., 2025-01-04T00:00:00Z)'
          });
        }
        if (isNaN(parsedEnd.getTime())) {
          return createToolError(TOOL_NAME, `Invalid metricsEndTime: '${metricsEndTime}' is not a valid ISO 8601 date`, {
            doNotRetry: true,
            suggestedAction: 'Provide a valid ISO 8601 date string (e.g., 2025-01-04T00:00:00Z)'
          });
        }

        // Validate start is before end
        if (parsedStart >= parsedEnd) {
          return createToolError(TOOL_NAME, 'metricsStartTime must be before metricsEndTime', {
            doNotRetry: true,
            suggestedAction: `Received start: ${metricsStartTime}, end: ${metricsEndTime}`
          });
        }

        metricsTimeRange = { startTime: parsedStart, endTime: parsedEnd };
      } else if (metricsStartTime && !metricsEndTime) {
        logger.warn({ metricsStartTime }, 'metricsStartTime provided without metricsEndTime - falling back to default time range');
      } else if (metricsEndTime && !metricsStartTime) {
        logger.warn({ metricsEndTime }, 'metricsEndTime provided without metricsStartTime - falling back to default time range');
      }

      logger.info(
        {
          identifierCount: dbIdentifiers.length,
          includeMetrics,
          includeTopSQL,
          metricsTimeRange: metricsTimeRange
            ? { startTime: metricsTimeRange.startTime.toISOString(), endTime: metricsTimeRange.endTime.toISOString() }
            : 'default (24h for metrics, 1h for Top SQL)',
          topSQLLimit
        },
        'Starting RDS instance investigation and analysis'
      );

      try {
        const investigationResults: RdsInvestigationResult[] = [];
        const allErrors: string[] = [];

        // Step 1: Gather instance status (resolves cluster IDs to instances)
        const { instances, resolutionMap, notFound, error: statusError } = await gatherInstanceStatus(dbIdentifiers, logger, stepTimeoutMs);

        if (statusError) {
          allErrors.push(`Instance status: ${statusError}`);
          logger.error({ error: statusError }, 'Failed to gather instance status - continuing with partial data');
        }

        if (notFound.length > 0) {
          logger.warn({ notFound }, 'Some identifiers could not be resolved');
        }

        // Initialize investigation results for all resolved instances
        for (const instance of instances) {
          // Find the original identifier that resolved to this instance
          let originalIdentifier = instance.instanceIdentifier;
          for (const [origId, resolvedInstances] of resolutionMap.entries()) {
            if (resolvedInstances.some(i => i.instanceArn === instance.instanceArn)) {
              originalIdentifier = origId;
              break;
            }
          }

          investigationResults.push({
            originalIdentifier,
            instanceInfo: instance,
            metrics: null,
            performanceInsights: null,
            errors: []
          });
        }

        // Step 2: Gather CloudWatch metrics
        if (includeMetrics && instances.length > 0) {
          const metricsMap = await gatherCloudWatchMetrics(instances, logger, stepTimeoutMs, metricsTimeRange);

          for (const result of investigationResults) {
            const metricsResult = metricsMap.get(result.instanceInfo.instanceIdentifier);
            if (metricsResult) {
              result.metrics = metricsResult.metrics;
              if (metricsResult.error) {
                result.errors.push(`Metrics: ${metricsResult.error}`);
              }
            }
          }
        }

        // Step 3: Gather Top SQL from Performance Insights
        if (includeTopSQL && instances.length > 0) {
          const topSQLMap = await gatherTopSQLQueries(instances, logger, stepTimeoutMs, topSQLLimit, metricsTimeRange);

          for (const result of investigationResults) {
            const topSQLResult = topSQLMap.get(result.instanceInfo.instanceIdentifier);
            if (topSQLResult) {
              result.performanceInsights = topSQLResult.performanceInsights;
              if (topSQLResult.error) {
                result.errors.push(`Top SQL: ${topSQLResult.error}`);
              }
            }
          }
        }

        // Calculate summary statistics
        const summary: RdsInvestigationSummary = {
          totalRequested: dbIdentifiers.length,
          totalInstancesResolved: instances.length,
          instancesWithMetrics: investigationResults.filter(r => r.metrics !== null).length,
          instancesWithPerformanceInsights: investigationResults.filter(
            r => r.performanceInsights !== null && r.performanceInsights.topSQLQueries.length > 0
          ).length,
          totalErrors: investigationResults.reduce((sum, r) => sum + r.errors.length, 0) + allErrors.length + notFound.length
        };

        // Step 4: Format data for LLM analysis
        const formattedInstances = investigationResults.map(r => ({
          instanceIdentifier: r.instanceInfo.instanceIdentifier,
          originalIdentifier: r.originalIdentifier,
          clusterIdentifier: r.instanceInfo.clusterIdentifier,
          instanceClass: r.instanceInfo.instanceClass,
          engine: `${r.instanceInfo.engine} ${r.instanceInfo.engineVersion}`,
          status: r.instanceInfo.status,
          isClusterWriter: r.instanceInfo.isClusterWriter,
          availabilityZone: r.instanceInfo.availabilityZone,
          performanceInsightsEnabled: r.instanceInfo.performanceInsightsEnabled,
          metrics: r.metrics
            ? {
                dataPointCount: r.metrics.dataPointCount,
                timeRange: formatTimeRange(r.metrics.firstTimestamp, r.metrics.lastTimestamp),
                cpuUtilization: formatMetricPair(r.metrics.avgCpuUtilizationPercent, r.metrics.maxCpuUtilizationPercent),
                freeableMemory: formatBytesMetricPair(r.metrics.avgFreeableMemoryBytes, r.metrics.minFreeableMemoryBytes, 'avg', 'min'),
                databaseConnections: formatMetricPair(r.metrics.avgDatabaseConnections, r.metrics.maxDatabaseConnections, 0),
                commitThroughput: formatMetricPair(r.metrics.avgCommitThroughput, r.metrics.maxCommitThroughput),
                deadlocks: formatMetricPair(r.metrics.avgDeadlocks, r.metrics.maxDeadlocks),
                readIOPS: formatMetricPair(r.metrics.avgReadIOPS, r.metrics.maxReadIOPS, 0),
                writeIOPS: formatMetricPair(r.metrics.avgWriteIOPS, r.metrics.maxWriteIOPS, 0),
                readLatencyMs: formatLatencyMs(r.metrics.avgReadLatencySeconds, r.metrics.maxReadLatencySeconds),
                writeLatencyMs: formatLatencyMs(r.metrics.avgWriteLatencySeconds, r.metrics.maxWriteLatencySeconds),
                auroraReplicaLagMs: formatMetricPair(r.metrics.avgAuroraReplicaLagMs, r.metrics.maxAuroraReplicaLagMs),
                bufferCacheHitRatio: r.metrics.avgBufferCacheHitRatio?.toFixed(2) ?? null,
                diskQueueDepth: formatMetricPair(r.metrics.avgDiskQueueDepth, r.metrics.maxDiskQueueDepth),
                swapUsage: formatBytesMetricPair(r.metrics.avgSwapUsageBytes, r.metrics.maxSwapUsageBytes)
              }
            : null,
          errors: r.errors.length > 0 ? r.errors : null
        }));

        const formattedTopSQL = investigationResults
          .filter(r => r.performanceInsights?.topSQLQueries.length)
          .map(r => ({
            instanceIdentifier: r.instanceInfo.instanceIdentifier,
            timeRange: formatTimeRange(r.performanceInsights?.startTime, r.performanceInsights?.endTime),
            topQueries: r.performanceInsights?.topSQLQueries.map((q, idx) => ({
              rank: idx + 1,
              sqlId: q.sqlId,
              avgDbLoad: q.avgDbLoad.toFixed(4),
              loadPercentage: q.loadPercentage?.toFixed(2),
              sqlText: q.sqlText.substring(0, 500) + (q.sqlText.length > 500 ? '...' : '')
            }))
          }));

        // Step 5: Analyze with LLM (raw data stays internal)
        const chain = analysisPromptTemplate.pipe(model).pipe(new StringOutputParser());

        logger.info(
          {
            instanceCount: formattedInstances.length,
            topSQLInstanceCount: formattedTopSQL.length,
            hasContext: !!investigationContext
          },
          'Invoking LLM for analysis'
        );
        logger.debug({ summary, formattedInstances, formattedTopSQL, investigationContext }, 'LLM analysis input details');

        // Encoding strategy based on data structure:
        // @see https://github.com/toon-format/toon/blob/main/docs/reference/efficiency-formalization.md
        // - instanceDetails: Compact JSON (nested metrics objects)
        // - topSQLQueries: Compact JSON (nested topQueries arrays - TOON less efficient for arrays of arrays)
        // - summary: Compact JSON (single object, not an array)
        const analysis = await withTimeout(
          () =>
            chain.invoke({
              summary: JSON.stringify(summary),
              instanceDetails: JSON.stringify(formattedInstances),
              topSQLQueries: formattedTopSQL.length > 0 ? JSON.stringify(formattedTopSQL) : 'No Top SQL data available',
              investigationContext: investigationContext ?? 'No additional context provided'
            }),
          stepTimeoutMs * 2, // Give more time for LLM analysis
          'analyzeRdsHealth'
        );

        const duration = Date.now() - startTime;
        logger.info({ duration, ...summary }, 'RDS instance investigation and analysis complete');

        // Return only the analysis and summary - raw data stays internal
        return createToolSuccess({
          analysis,
          summary,
          notFoundIdentifiers: notFound.length > 0 ? notFound : undefined,
          investigatedAt: formatDate(new Date()),
          durationMs: duration
        });
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error({ error: errorMessage }, 'Failed to investigate and analyze RDS instances');
        return createToolError(TOOL_NAME, errorMessage, {
          doNotRetry: true,
          suggestedAction: 'Investigation failed. Check AWS credentials and permissions.'
        });
      }
    },
    {
      name: TOOL_NAME,
      description:
        'Comprehensive RDS Aurora PostgreSQL investigation and analysis in one call. ' +
        'Accepts DB instance or cluster identifiers - cluster IDs are automatically resolved to all member instances. ' +
        'Gathers instance status, CloudWatch metrics, and Top SQL from Performance Insights, then analyzes with AI. ' +
        'Returns only the analysis summary - raw AWS data stays internal to reduce token usage.',
      schema: investigateAndAnalyzeSchema
    }
  );
};
