import { createMiddleware, ToolMessage } from 'langchain';
import type { Logger } from 'pino';

import { getErrorMessage } from '../utils';

/**
 * Creates an error handling middleware for agent tool calls.
 * Catches tool execution errors and returns them as ToolMessages
 * so the agent can recover gracefully.
 *
 * @param logger - Logger instance for error reporting
 * @returns Agent middleware that wraps tool calls with error handling
 */
export const createErrorMiddleware = (logger: Logger) =>
  createMiddleware({
    name: 'ErrorHandler',
    wrapToolCall: async (request, handler) => {
      try {
        return await handler(request);
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        logger.error({ tool: request.toolCall.name, error: errorMessage }, 'Tool execution failed');
        return new ToolMessage({
          content: `Tool error: ${errorMessage}. Try an alternative approach.`,
          tool_call_id: request.toolCall.id ?? 'unknown'
        });
      }
    }
  });
