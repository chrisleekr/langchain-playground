import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import type { Serialized } from '@langchain/core/load/serializable';
import type { Logger } from 'pino';

import type { AgentConfig } from '@/api/agent/core/config';
import type { InvestigationTrace, LLMCallStep, ToolExecutionStep } from '@/api/agent/core/schema';

// Mock modules before importing the handler
jest.mock('@/api/agent/core/pricing', () => ({
  calculateCost: () => 0.001
}));

jest.mock('config', () => ({
  get: (path: string) => {
    const configMap: Record<string, string> = {
      'openai.model': 'gpt-4',
      'aws.bedrock.model': 'anthropic.claude-v2',
      'groq.model': 'llama-3',
      'ollama.model': 'llama2'
    };
    // eslint-disable-next-line security/detect-object-injection -- Test mock with known paths
    return Object.hasOwn(configMap, path) ? configMap[path] : 'test-model';
  }
}));

// Import after mocks are set up
import { ObservabilityHandler } from '../observabilityHandler';

const createMockLogger = (): Logger =>
  ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn()
  }) as unknown as Logger;

const createMockConfig = (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
  recursionLimit: 100,
  maxToolCalls: 30,
  timeoutMs: 600000,
  stepTimeoutSec: 120,
  temperature: 0,
  provider: 'bedrock',
  maxTokens: 60000,
  verboseLogging: false,
  ...overrides
});

const createMockMessage = (overrides: Partial<BaseMessage> = {}): BaseMessage =>
  ({
    content: 'test message',
    _getType: () => 'human',
    additional_kwargs: {},
    ...overrides
  }) as unknown as BaseMessage;

const createMockSerialized = (): Serialized => ({ lc: 1, type: 'not_implemented', id: ['test'] });

describe('ObservabilityHandler', () => {
  let handler: ObservabilityHandler;
  let mockLogger: Logger;
  let mockConfig: AgentConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = createMockLogger();
    mockConfig = createMockConfig();
    handler = new ObservabilityHandler(mockLogger, mockConfig);
  });

  describe('handleChatModelStart', () => {
    describe('with agent metadata', () => {
      beforeEach(async () => {
        const messages = [[createMockMessage({ content: 'Hello world' })]];
        await handler.handleChatModelStart(createMockSerialized(), messages, 'run-id-12345678', undefined, undefined, undefined, {
          langgraph_node: 'newrelic_expert'
        });
      });

      it('logs at info level with agent context', () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            runId: 'run-id-1',
            agent: 'newrelic_expert'
          }),
          'LLM call starting'
        );
      });
    });

    describe('without agent metadata', () => {
      beforeEach(async () => {
        const messages = [[createMockMessage({ content: 'Hello world' })]];
        await handler.handleChatModelStart(createMockSerialized(), messages, 'run-id-12345678');
      });

      it('logs at info level without agent context', () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            runId: 'run-id-1',
            agent: undefined
          }),
          'LLM call starting'
        );
      });
    });
  });

  describe('handleLLMEnd', () => {
    describe('with token usage in llmOutput', () => {
      let trace: InvestigationTrace;

      beforeEach(async () => {
        jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1500);
        jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T00:00:00.000Z');

        const messages = [[createMockMessage()]];
        await handler.handleChatModelStart(createMockSerialized(), messages, 'run-id-1', undefined, undefined, undefined, {
          langgraph_node: 'supervisor'
        });

        const output: LLMResult = {
          generations: [[{ text: 'Generated response', generationInfo: {} }]],
          llmOutput: {
            tokenUsage: {
              promptTokens: 100,
              completionTokens: 50,
              totalTokens: 150
            }
          }
        };
        await handler.handleLLMEnd(output, 'run-id-1');
        trace = handler.getTrace();
      });

      it('records LLM call step with duration and tokens', () => {
        expect(trace.steps).toHaveLength(1);
        const step = trace.steps[0] as LLMCallStep;
        expect(step.type).toBe('llm_call');
        expect(step.durationMs).toBe(500);
        expect(step.inputTokens).toBe(100);
        expect(step.outputTokens).toBe(50);
        expect(step.totalTokens).toBe(150);
        expect(step.agent).toBe('supervisor');
      });

      it('logs LLM call completed', () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            order: 1,
            agent: 'supervisor',
            durationMs: 500,
            tokens: 150
          }),
          'LLM call completed'
        );
      });
    });

    describe('with token usage in message.usage_metadata (Bedrock style)', () => {
      let trace: InvestigationTrace;

      beforeEach(async () => {
        jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
        jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T00:00:00.000Z');

        const messages = [[createMockMessage()]];
        await handler.handleChatModelStart(createMockSerialized(), messages, 'run-id-1');

        const output = {
          generations: [
            [
              {
                text: 'Response',
                generationInfo: {},
                message: {
                  content: 'Response',
                  usage_metadata: {
                    inputTokens: 200,
                    outputTokens: 100
                  },
                  _getType: () => 'ai'
                }
              }
            ]
          ],
          llmOutput: {}
        } as unknown as LLMResult;
        await handler.handleLLMEnd(output, 'run-id-1');
        trace = handler.getTrace();
      });

      it('extracts tokens from message.usage_metadata', () => {
        const step = trace.steps[0] as LLMCallStep;
        expect(step.inputTokens).toBe(200);
        expect(step.outputTokens).toBe(100);
        expect(step.totalTokens).toBe(300);
      });
    });

    describe('with tool calls in message', () => {
      let trace: InvestigationTrace;

      beforeEach(async () => {
        jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1500);
        jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T00:00:00.000Z');

        const messages = [[createMockMessage()]];
        await handler.handleChatModelStart(createMockSerialized(), messages, 'run-id-1');

        const output = {
          generations: [
            [
              {
                text: '',
                generationInfo: {},
                message: {
                  content: '',
                  tool_calls: [{ name: 'search' }, { name: 'fetch_logs' }],
                  _getType: () => 'ai'
                }
              }
            ]
          ],
          llmOutput: {}
        } as unknown as LLMResult;
        await handler.handleLLMEnd(output, 'run-id-1');
        trace = handler.getTrace();
      });

      it('records tool calls decided', () => {
        const step = trace.steps[0] as LLMCallStep;
        expect(step.toolCallsDecided).toStrictEqual(['search', 'fetch_logs']);
      });
    });

    describe('without matching start call', () => {
      beforeEach(async () => {
        const output: LLMResult = {
          generations: [[{ text: 'Response', generationInfo: {} }]],
          llmOutput: {}
        };
        await handler.handleLLMEnd(output, 'unknown-run-id');
      });

      it('does not record step', () => {
        const trace = handler.getTrace();
        expect(trace.steps).toHaveLength(0);
      });
    });
  });

  describe('handleToolStart', () => {
    beforeEach(async () => {
      await handler.handleToolStart(
        createMockSerialized(),
        '{"query": "test"}',
        'run-id-12345678',
        undefined,
        undefined,
        { langgraph_node: 'sentry_expert' },
        'investigate_sentry_issue'
      );
    });

    it('logs tool starting with name and agent', () => {
      expect(mockLogger.info).toHaveBeenCalledWith({ tool: 'investigate_sentry_issue', agent: 'sentry_expert' }, 'Tool starting');
    });

    describe('without runName', () => {
      beforeEach(async () => {
        mockLogger = createMockLogger();
        handler = new ObservabilityHandler(mockLogger, mockConfig);
        await handler.handleToolStart(createMockSerialized(), '{}', 'run-id-12345678');
      });

      it('uses "unknown" as tool name', () => {
        expect(mockLogger.info).toHaveBeenCalledWith({ tool: 'unknown', agent: undefined }, 'Tool starting');
      });
    });
  });

  describe('handleToolEnd', () => {
    let trace: InvestigationTrace;

    describe('with successful execution', () => {
      beforeEach(async () => {
        jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1150);
        jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T00:00:00.000Z');

        await handler.handleToolStart(
          createMockSerialized(),
          '{"query": "test"}',
          'run-id-1',
          undefined,
          undefined,
          { langgraph_node: 'newrelic_expert' },
          'fetch_logs'
        );
        await handler.handleToolEnd('Search result text', 'run-id-1');
        trace = handler.getTrace();
      });

      it('logs tool completed with duration and agent', () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            order: 1,
            tool: 'fetch_logs',
            agent: 'newrelic_expert',
            durationMs: 150
          }),
          'Tool completed'
        );
      });

      it('stores tool execution step', () => {
        expect(trace.steps).toHaveLength(1);
        const step = trace.steps[0] as ToolExecutionStep;
        expect(step.type).toBe('tool_execution');
        expect(step.toolName).toBe('fetch_logs');
        expect(step.agent).toBe('newrelic_expert');
        expect(step.durationMs).toBe(150);
        expect(step.success).toBe(true);
        expect(step.error).toBeUndefined();
      });
    });

    describe('with unknown runId', () => {
      beforeEach(async () => {
        mockLogger = createMockLogger();
        handler = new ObservabilityHandler(mockLogger, mockConfig);
        await handler.handleToolEnd('output', 'unknown-run-id');
        trace = handler.getTrace();
      });

      it('does not log or store execution', () => {
        expect(mockLogger.info).not.toHaveBeenCalled();
        expect(trace.steps).toHaveLength(0);
      });
    });
  });

  describe('handleToolError', () => {
    let trace: InvestigationTrace;

    describe('with known runId', () => {
      beforeEach(async () => {
        jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1500);
        jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T00:00:00.000Z');

        await handler.handleToolStart(
          createMockSerialized(),
          '{"url": "https://example.com"}',
          'run-id-1',
          undefined,
          undefined,
          { langgraph_node: 'research_expert' },
          'fetch_tool'
        );
        await handler.handleToolError(new Error('Connection timeout'), 'run-id-1');
        trace = handler.getTrace();
      });

      it('logs tool failure with error message', () => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            order: 1,
            tool: 'fetch_tool',
            agent: 'research_expert',
            durationMs: 500,
            error: 'Connection timeout'
          }),
          'Tool failed'
        );
      });

      it('stores failed execution with error', () => {
        const step = trace.steps[0] as ToolExecutionStep;
        expect(step.success).toBe(false);
        expect(step.error).toBe('Connection timeout');
      });
    });

    describe('with unknown runId', () => {
      beforeEach(async () => {
        mockLogger = createMockLogger();
        handler = new ObservabilityHandler(mockLogger, mockConfig);
        await handler.handleToolError(new Error('Some error'), 'unknown-run-id');
        trace = handler.getTrace();
      });

      it('does not log or store execution', () => {
        expect(mockLogger.error).not.toHaveBeenCalled();
        expect(trace.steps).toHaveLength(0);
      });
    });
  });

  describe('getTrace', () => {
    describe('with mixed LLM calls and tool executions', () => {
      let trace: InvestigationTrace;

      beforeEach(async () => {
        // Mock timestamps for chronological ordering
        let callCount = 0;
        jest.spyOn(Date, 'now').mockImplementation(() => {
          callCount++;
          // LLM call 1: start=1000, end=1500
          // Tool 1: start=2000, end=2300
          // LLM call 2: start=3000, end=3800
          const timestamps = [1000, 1500, 2000, 2300, 3000, 3800];
          return timestamps[callCount - 1] ?? 4000;
        });

        let isoCallCount = 0;
        jest.spyOn(Date.prototype, 'toISOString').mockImplementation(() => {
          isoCallCount++;
          const isoTimes = [
            '2024-01-01T00:00:01.000Z', // LLM 1 start
            '2024-01-01T00:00:02.000Z', // Tool 1 start
            '2024-01-01T00:00:03.000Z' // LLM 2 start
          ];
          return isoTimes[isoCallCount - 1] ?? '2024-01-01T00:00:00.000Z';
        });

        // LLM call 1
        await handler.handleChatModelStart(createMockSerialized(), [[createMockMessage()]], 'llm-1', undefined, undefined, undefined, {
          langgraph_node: 'supervisor'
        });
        await handler.handleLLMEnd(
          {
            generations: [[{ text: 'Response', generationInfo: {} }]],
            llmOutput: { tokenUsage: { promptTokens: 100, completionTokens: 50 } }
          },
          'llm-1'
        );

        // Tool execution
        await handler.handleToolStart(
          createMockSerialized(),
          '{}',
          'tool-1',
          undefined,
          undefined,
          { langgraph_node: 'newrelic_expert' },
          'fetch_logs'
        );
        await handler.handleToolEnd('result', 'tool-1');

        // LLM call 2
        await handler.handleChatModelStart(createMockSerialized(), [[createMockMessage()]], 'llm-2', undefined, undefined, undefined, {
          langgraph_node: 'newrelic_expert'
        });
        await handler.handleLLMEnd(
          {
            generations: [[{ text: 'Final response', generationInfo: {} }]],
            llmOutput: { tokenUsage: { promptTokens: 200, completionTokens: 100 } }
          },
          'llm-2'
        );

        trace = handler.getTrace();
      });

      it('returns all steps', () => {
        expect(trace.steps).toHaveLength(3);
      });

      it('sorts steps chronologically', () => {
        expect(trace.steps[0]?.type).toBe('llm_call');
        expect(trace.steps[1]?.type).toBe('tool_execution');
        expect(trace.steps[2]?.type).toBe('llm_call');
      });

      it('calculates summary correctly', () => {
        expect(trace.summary.llmCallCount).toBe(2);
        expect(trace.summary.toolExecutionCount).toBe(1);
        expect(trace.summary.totalTokens).toBe(450); // 150 + 300
        expect(trace.summary.model).toBe('anthropic.claude-v2');
        expect(trace.summary.provider).toBe('bedrock');
      });
    });

    describe('with no executions', () => {
      let trace: InvestigationTrace;

      beforeEach(() => {
        trace = handler.getTrace();
      });

      it('returns empty steps array', () => {
        expect(trace.steps).toStrictEqual([]);
      });

      it('returns zero counts in summary', () => {
        expect(trace.summary.llmCallCount).toBe(0);
        expect(trace.summary.toolExecutionCount).toBe(0);
        expect(trace.summary.totalTokens).toBe(0);
        expect(trace.summary.totalCost).toBe(0);
        expect(trace.summary.totalDurationMs).toBe(0);
      });
    });
  });
});
