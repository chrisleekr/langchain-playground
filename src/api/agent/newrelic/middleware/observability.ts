import { createMiddleware, AIMessage } from 'langchain';
import type { Logger } from 'pino';

import type { AgentConfig } from '../config';

/**
 * Creates an observability middleware for agent monitoring.
 * Logs model calls, tool executions, and their durations.
 * When verboseLogging is enabled, includes additional debug information.
 *
 * @param logger - Logger instance for structured logging
 * @param config - Agent configuration with verboseLogging setting
 * @returns Agent middleware that logs model and tool activity
 */
export const createObservabilityMiddleware = (logger: Logger, config: AgentConfig) =>
  createMiddleware({
    name: 'Observability',
    beforeModel: state => {
      if (config.verboseLogging) {
        logger.info({ messageCount: state.messages.length }, 'Before model call');
      }
      // Return undefined to pass through state unchanged; returning a value would modify agent state
      return undefined;
    },
    afterModel: state => {
      const lastMessage = state.messages.at(-1);
      const toolCalls = lastMessage instanceof AIMessage ? lastMessage.tool_calls?.map((tc: { name: string }) => tc.name) : undefined;
      logger.info(
        {
          toolCalls,
          hasContent: !!lastMessage?.content
        },
        'Model response'
      );
      // Return undefined to pass through state unchanged; returning a value would modify agent state
      return undefined;
    },
    wrapToolCall: async (request, handler) => {
      const startTime = Date.now();
      const result = await handler(request);
      logger.info({ tool: request.toolCall.name, duration: Date.now() - startTime }, 'Tool executed');
      return result;
    }
  });
