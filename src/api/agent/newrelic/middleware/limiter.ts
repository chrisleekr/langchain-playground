import { createMiddleware, ToolMessage } from 'langchain';

import type { AgentConfig } from '../config';

/**
 * Creates a rate limiting middleware for agent tool calls.
 * Prevents runaway agents by limiting the total number of tool invocations.
 * When the limit is exceeded, returns a message instructing the agent to conclude.
 *
 * @param config - Agent configuration containing maxToolCalls limit
 * @returns Agent middleware that enforces tool call limits
 */
export const createLimiterMiddleware = (config: AgentConfig) => {
  let toolCallCount = 0;
  return createMiddleware({
    name: 'ToolCallLimiter',
    wrapToolCall: async (request, handler) => {
      toolCallCount++;
      if (toolCallCount > config.maxToolCalls) {
        return new ToolMessage({
          content: 'Tool call limit reached. Please provide final summary with available information.',
          tool_call_id: request.toolCall.id ?? 'unknown'
        });
      }
      return handler(request);
    }
  });
};
