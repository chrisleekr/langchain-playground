import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import { createAgent, ToolStrategy, type AgentMiddleware } from 'langchain';
import { StatusCodes } from 'http-status-codes';

import { sendResponse } from '@/libraries/httpHandlers';
import { ResponseStatus, ServiceResponse } from '@/models/serviceResponse';
import { getMCPTools } from '@/libraries/mcp';
import { createAllTools } from './tools';
import { investigationSystemPrompt } from './prompts';
import { InvestigationResultSchema } from './schema';
import { AgentConfigSchema, defaultConfig } from './config';
import { createErrorMiddleware, createObservabilityMiddleware, createLimiterMiddleware, createCostTrackerMiddleware } from './middleware';
import { getModel } from './utils';

interface RequestBody {
  issueId: string;
  config?: Partial<typeof defaultConfig>;
}

/**
 * Creates a timeout promise that rejects after the specified duration.
 * Used to prevent long-running agent investigations from blocking resources.
 */
const createTimeoutPromise = (timeoutMs: number): Promise<never> => {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Investigation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
};

/**
 * POST /agent/newrelic/investigate
 *
 * Investigates a New Relic issue using an AI agent with structured tools.
 * The agent follows a defined investigation flow to gather context, fetch logs,
 * and analyze root causes.
 *
 * @param issueId - The New Relic issue ID to investigate
 * @param config - Optional configuration overrides for the agent
 * @returns Investigation result with cost summary
 * @throws {Error} If investigation times out or fails
 */
export default function newRelicInvestigatePost() {
  return async (request: FastifyRequest<{ Body: RequestBody }>, reply: FastifyReply): Promise<void> => {
    const logger = request.log as Logger;
    const { issueId, config: configOverrides } = request.body;

    const config = AgentConfigSchema.parse({ ...defaultConfig, ...configOverrides });

    logger.info({ issueId, config }, 'Starting New Relic investigation');

    const model = getModel(config, logger);

    const nrTools = createAllTools({ logger, model });
    logger.info({ count: nrTools.length }, 'New Relic tools created');

    const mcpTools = await getMCPTools(logger);
    logger.info({ count: mcpTools.length }, 'MCP tools loaded');

    const { middleware: costMiddleware, tracker: costTracker } = createCostTrackerMiddleware(logger, config);

    const middleware: AgentMiddleware[] = [
      createErrorMiddleware(logger),
      createObservabilityMiddleware(logger, config),
      createLimiterMiddleware(config),
      costMiddleware
    ];

    logger.info('Starting investigation agent...');

    // ToolStrategy.fromSchema wraps Zod schema for structured output via tool-calling
    const agent = createAgent({
      model,
      tools: [...nrTools, ...mcpTools],
      systemPrompt: investigationSystemPrompt(config),
      responseFormat: ToolStrategy.fromSchema(InvestigationResultSchema),
      middleware
    });

    // Execute agent with timeout protection and configured iteration limit
    const result = await Promise.race([
      agent.invoke({ messages: [{ role: 'user', content: `Investigate New Relic issue: ${issueId}` }] }, { recursionLimit: config.recursionLimit }),
      createTimeoutPromise(config.timeoutMs)
    ]);

    // Inject cost summary into the response
    const responseWithCost = {
      ...result.structuredResponse,
      costSummary: costTracker.getSummary()
    };

    logger.info({ issueId, messageCount: result.messages.length, costSummary: costTracker.getSummary() }, 'Investigation complete');

    await sendResponse(reply, new ServiceResponse(ResponseStatus.Success, 'Investigation complete', responseWithCost, StatusCodes.OK));
  };
}
