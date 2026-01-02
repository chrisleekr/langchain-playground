import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { StatusCodes } from 'http-status-codes';

import { sendResponse } from '@/libraries/httpHandlers';
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
 * - Cost tracking via CostTrackingCallbackHandler
 * - Observability via ObservabilityCallbackHandler
 *
 * @see https://langchain-ai.github.io/langgraphjs/agents/multi-agent/
 *
 * @param query - Issue or incident describing what to investigate
 * @param config - Optional configuration overrides for the agent
 * @returns Investigation result from the domain agent(s)
 * @throws {Error} If investigation times out, exceeds recursion limit, or fails
 */
export default function investigatePost() {
  return async (request: FastifyRequest<{ Body: RequestBody }>, reply: FastifyReply): Promise<void> => {
    const logger = request.log as Logger;
    const { query, config: configOverrides } = request.body;

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
          costSummary: result.costSummary,
          toolExecutions: result.toolExecutions
        },
        StatusCodes.OK
      )
    );
  };
}
