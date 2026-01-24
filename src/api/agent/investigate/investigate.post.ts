import type { FastifyRequest, FastifyReply } from 'fastify';
import { StatusCodes } from 'http-status-codes';

import { getRequestLogger, sendResponse } from '@/libraries';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { AgentConfigSchema, defaultConfig } from '@/api/agent/core';
import { investigate } from '@/api/agent/services';

interface RequestBody {
  /** Freeform text describing what to investigate */
  query: string;
  /** Optional configuration overrides */
  config?: Partial<typeof defaultConfig>;
}

/**
 * POST /agent/investigate
 *
 * Investigates an issue using the multi-agent supervisor architecture.
 * Accepts freeform text input and intelligently routes to the appropriate
 * domain agents (New Relic, Sentry, etc.) based on the query content.
 *
 * Architecture:
 * - Supervisor: Coordinates domain agents based on the investigation request
 * - New Relic Agent: Specializes in alerts, logs, and APM data
 * - Sentry Agent: Specializes in error tracking and crash reports
 *
 * Features:
 * - Recursion limit protection (prevents infinite loops)
 * - Timeout protection (configurable via config.timeoutMs)
 * - Tracing via ObservabilityHandler (LLM calls, tool executions, costs)
 *
 * @see https://docs.langchain.com/oss/javascript/langgraph/overview
 *
 * @param query - Issue or incident describing what to investigate
 * @param config - Optional configuration overrides for the agent
 * @returns Investigation result from the domain agent(s)
 * @throws {Error} If investigation times out, exceeds recursion limit, or fails
 */
export default function investigatePost() {
  return async (request: FastifyRequest<{ Body: RequestBody }>, reply: FastifyReply): Promise<void> => {
    const logger = getRequestLogger(request.log);
    const { query, config: configOverrides } = request.body;

    try {
      const config = AgentConfigSchema.parse({ ...defaultConfig, ...configOverrides });

      // Use the shared investigation service
      const result = await investigate({
        query,
        config,
        logger,
        enableNewRelic: true,
        enableSentry: true,
        enableResearch: true,
        enableAwsEcs: true
      });

      await sendResponse(
        reply,
        new ServiceResponse(
          ResponseStatus.Success,
          'Investigation complete',
          {
            query: result.query,
            rawSummary: result.rawSummary,
            structuredSummary: result.structuredSummary,
            messageCount: result.messageCount,
            durationMs: result.durationMs,
            trace: result.trace
          },
          StatusCodes.OK
        )
      );
    } catch (error) {
      logger.error(
        {
          error: {
            name: error instanceof Error ? error.name : 'Unknown',
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
          },
          query
        },
        'Error during investigation'
      );
      await sendResponse(reply, new ServiceResponse(ResponseStatus.Failed, 'Internal server error', null, StatusCodes.INTERNAL_SERVER_ERROR));
    }
  };
}
