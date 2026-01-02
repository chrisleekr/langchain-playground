import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { BaseMessage } from '@langchain/core/messages';
import type { LLMResult } from '@langchain/core/outputs';
import type { Serialized } from '@langchain/core/load/serializable';
import type { Logger } from 'pino';

import type { AgentConfig } from '@/api/agent/core/config';
import type { ToolExecution } from '@/api/agent/core/schema';

import { ObservabilityCallbackHandler } from '../observabilityHandler';

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

describe('ObservabilityCallbackHandler', () => {
  let handler: ObservabilityCallbackHandler;
  let mockLogger: Logger;
  let mockConfig: AgentConfig;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockConfig = createMockConfig();
    handler = new ObservabilityCallbackHandler(mockLogger, mockConfig);
  });

  describe('handleChatModelStart', () => {
    describe('with verboseLogging disabled', () => {
      beforeEach(async () => {
        const messages = [[createMockMessage({ content: 'Hello world' })]];
        await handler.handleChatModelStart(createMockSerialized(), messages, 'run-id-12345678');
      });

      it('logs at debug level', () => {
        expect(mockLogger.debug).toHaveBeenCalledTimes(1);
        expect(mockLogger.info).not.toHaveBeenCalled();
      });

      it('logs truncated runId and message count', () => {
        expect(mockLogger.debug).toHaveBeenCalledWith(
          expect.objectContaining({
            runId: 'run-id-1',
            messageCount: 1,
            lastMessageType: 'human',
            lastMessageContent: 'Hello world'
          }),
          'Model input'
        );
      });
    });

    describe('with verboseLogging enabled', () => {
      beforeEach(async () => {
        mockConfig = createMockConfig({ verboseLogging: true });
        handler = new ObservabilityCallbackHandler(mockLogger, mockConfig);
        const messages = [[createMockMessage({ content: 'Hello world' })]];
        await handler.handleChatModelStart(createMockSerialized(), messages, 'run-id-12345678');
      });

      it('logs at info level with full message summary', () => {
        expect(mockLogger.info).toHaveBeenCalledTimes(1);
        expect(mockLogger.debug).not.toHaveBeenCalled();
      });

      it('includes messages array in log', () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            runId: 'run-id-1',
            messageCount: 1,
            messages: expect.arrayContaining([
              expect.objectContaining({
                index: 0,
                type: 'human',
                content: 'Hello world'
              })
            ])
          }),
          'Model input'
        );
      });
    });

    describe('with array content blocks', () => {
      beforeEach(async () => {
        mockConfig = createMockConfig({ verboseLogging: true });
        handler = new ObservabilityCallbackHandler(mockLogger, mockConfig);
        const messages = [
          [
            createMockMessage({
              content: [
                { type: 'text', text: 'First part' },
                { type: 'text', text: 'Second part' }
              ]
            })
          ]
        ];
        await handler.handleChatModelStart(createMockSerialized(), messages, 'run-id-12345678');
      });

      it('extracts and joins text from content blocks', () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                content: 'First part Second part'
              })
            ])
          }),
          'Model input'
        );
      });
    });

    describe('with tool_calls in message', () => {
      beforeEach(async () => {
        mockConfig = createMockConfig({ verboseLogging: true });
        handler = new ObservabilityCallbackHandler(mockLogger, mockConfig);
        const messages = [
          [
            createMockMessage({
              content: 'Using tools',
              tool_calls: [{ name: 'search', id: 'call-1' }]
            } as Partial<BaseMessage>)
          ]
        ];
        await handler.handleChatModelStart(createMockSerialized(), messages, 'run-id-12345678');
      });

      it('detects hasToolCalls as true', () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                hasToolCalls: true
              })
            ])
          }),
          'Model input'
        );
      });
    });
  });

  describe('handleLLMEnd', () => {
    describe('with text generation output', () => {
      beforeEach(async () => {
        const output: LLMResult = {
          generations: [[{ text: 'Generated response', generationInfo: {} }]],
          llmOutput: {}
        };
        await handler.handleLLMEnd(output, 'run-id-12345678');
      });

      it('logs model output with hasContent true', () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            runId: 'run-id-1',
            hasContent: true
          }),
          'Model output'
        );
      });

      it('does not include output content when verboseLogging is disabled', () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            output: undefined
          }),
          'Model output'
        );
      });
    });

    describe('with verboseLogging enabled', () => {
      beforeEach(async () => {
        mockConfig = createMockConfig({ verboseLogging: true });
        handler = new ObservabilityCallbackHandler(mockLogger, mockConfig);
        const output: LLMResult = {
          generations: [[{ text: 'Generated response', generationInfo: {} }]],
          llmOutput: {}
        };
        await handler.handleLLMEnd(output, 'run-id-12345678');
      });

      it('includes output content in log', () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            output: 'Generated response'
          }),
          'Model output'
        );
      });
    });

    describe('with tool calls in message', () => {
      beforeEach(async () => {
        // ChatGeneration has a 'message' property that Generation doesn't have
        // Cast through unknown to simulate runtime behavior
        const output = {
          generations: [
            [
              {
                text: '',
                generationInfo: {},
                message: {
                  content: '',
                  tool_calls: [
                    { name: 'search', id: 'call-1' },
                    { name: 'fetch', id: 'call-2' }
                  ],
                  _getType: () => 'ai',
                  additional_kwargs: {}
                }
              }
            ]
          ],
          llmOutput: {}
        } as unknown as LLMResult;
        await handler.handleLLMEnd(output, 'run-id-12345678');
      });

      it('logs tool call names', () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            toolCalls: ['search', 'fetch']
          }),
          'Model output'
        );
      });
    });

    describe('with empty generations', () => {
      beforeEach(async () => {
        const output: LLMResult = {
          generations: [[]],
          llmOutput: {}
        };
        await handler.handleLLMEnd(output, 'run-id-12345678');
      });

      it('logs with hasContent false', () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            hasContent: false
          }),
          'Model output'
        );
      });
    });
  });

  describe('handleToolStart', () => {
    beforeEach(async () => {
      await handler.handleToolStart(createMockSerialized(), '{"query": "test"}', 'run-id-12345678', undefined, undefined, undefined, 'search_tool');
    });

    it('logs tool starting with name and input', () => {
      expect(mockLogger.info).toHaveBeenCalledWith({ tool: 'search_tool', input: '{"query": "test"}' }, 'Tool starting');
    });

    describe('without runName', () => {
      beforeEach(async () => {
        mockLogger = createMockLogger();
        handler = new ObservabilityCallbackHandler(mockLogger, mockConfig);
        await handler.handleToolStart(createMockSerialized(), '{}', 'run-id-12345678');
      });

      it('uses "unknown" as tool name', () => {
        expect(mockLogger.info).toHaveBeenCalledWith({ tool: 'unknown', input: '{}' }, 'Tool starting');
      });
    });
  });

  describe('handleToolEnd', () => {
    let result: ToolExecution[];

    describe('with string output', () => {
      beforeEach(async () => {
        jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1150);
        jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T00:00:00.000Z');

        await handler.handleToolStart(createMockSerialized(), '{"query": "test"}', 'run-id-1', undefined, undefined, undefined, 'search_tool');
        await handler.handleToolEnd('Search result text', 'run-id-1');
        result = handler.getToolExecutions();
      });

      it('logs tool completed with duration', () => {
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            order: 1,
            tool: 'search_tool',
            durationMs: 150,
            input: '{"query": "test"}',
            output: 'Search result text'
          }),
          'Tool completed'
        );
      });

      it('stores execution record', () => {
        expect(result).toHaveLength(1);
        expect(result[0]).toStrictEqual({
          order: 1,
          toolName: 'search_tool',
          input: '{"query": "test"}',
          output: 'Search result text',
          durationMs: 150,
          success: true,
          timestamp: '2024-01-01T00:00:00.000Z'
        });
      });
    });

    describe('with object output', () => {
      beforeEach(async () => {
        jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1200);
        jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T00:00:00.000Z');

        await handler.handleToolStart(createMockSerialized(), '{}', 'run-id-1', undefined, undefined, undefined, 'api_tool');
        await handler.handleToolEnd({ data: [1, 2, 3], status: 'ok' }, 'run-id-1');
        result = handler.getToolExecutions();
      });

      it('serializes object output to JSON', () => {
        expect(result[0]?.output).toBe('{"data":[1,2,3],"status":"ok"}');
      });
    });

    describe('with circular reference in output', () => {
      beforeEach(async () => {
        jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1100);
        jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T00:00:00.000Z');

        const circular: Record<string, unknown> = { name: 'test' };
        circular['self'] = circular;

        await handler.handleToolStart(createMockSerialized(), '{}', 'run-id-1', undefined, undefined, undefined, 'bad_tool');
        await handler.handleToolEnd(circular, 'run-id-1');
        result = handler.getToolExecutions();
      });

      it('handles serialization error gracefully', () => {
        expect(result[0]?.output).toBe('[unable to serialize]');
      });
    });

    describe('with unknown runId', () => {
      beforeEach(async () => {
        mockLogger = createMockLogger();
        handler = new ObservabilityCallbackHandler(mockLogger, mockConfig);
        await handler.handleToolEnd('output', 'unknown-run-id');
        result = handler.getToolExecutions();
      });

      it('does not log or store execution', () => {
        expect(mockLogger.info).not.toHaveBeenCalled();
        expect(result).toHaveLength(0);
      });
    });
  });

  describe('handleToolError', () => {
    let result: ToolExecution[];

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
          undefined,
          'fetch_tool'
        );
        await handler.handleToolError(new Error('Connection timeout'), 'run-id-1');
        result = handler.getToolExecutions();
      });

      it('logs tool failure with error message', () => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            order: 1,
            tool: 'fetch_tool',
            durationMs: 500,
            input: '{"url": "https://example.com"}',
            error: 'Connection timeout'
          }),
          'Tool failed'
        );
      });

      it('stores failed execution record', () => {
        expect(result).toHaveLength(1);
        expect(result[0]).toStrictEqual({
          order: 1,
          toolName: 'fetch_tool',
          input: '{"url": "https://example.com"}',
          output: '',
          durationMs: 500,
          success: false,
          error: 'Connection timeout',
          timestamp: '2024-01-01T00:00:00.000Z'
        });
      });
    });

    describe('with unknown runId', () => {
      beforeEach(async () => {
        mockLogger = createMockLogger();
        handler = new ObservabilityCallbackHandler(mockLogger, mockConfig);
        await handler.handleToolError(new Error('Some error'), 'unknown-run-id');
        result = handler.getToolExecutions();
      });

      it('does not log or store execution', () => {
        expect(mockLogger.error).not.toHaveBeenCalled();
        expect(result).toHaveLength(0);
      });
    });
  });

  describe('getToolExecutions', () => {
    describe('with multiple tool executions', () => {
      let result: ToolExecution[];

      beforeEach(async () => {
        jest
          .spyOn(Date, 'now')
          .mockReturnValueOnce(1000)
          .mockReturnValueOnce(1100)
          .mockReturnValueOnce(2000)
          .mockReturnValueOnce(2200)
          .mockReturnValueOnce(3000)
          .mockReturnValueOnce(3050);
        jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2024-01-01T00:00:00.000Z');

        // First tool - success
        await handler.handleToolStart(createMockSerialized(), '{}', 'run-1', undefined, undefined, undefined, 'tool_a');
        await handler.handleToolEnd('result_a', 'run-1');

        // Second tool - error
        await handler.handleToolStart(createMockSerialized(), '{}', 'run-2', undefined, undefined, undefined, 'tool_b');
        await handler.handleToolError(new Error('Failed'), 'run-2');

        // Third tool - success
        await handler.handleToolStart(createMockSerialized(), '{}', 'run-3', undefined, undefined, undefined, 'tool_c');
        await handler.handleToolEnd('result_c', 'run-3');

        result = handler.getToolExecutions();
      });

      it('returns all executions in order', () => {
        expect(result).toHaveLength(3);
        expect(result.map(e => e.order)).toStrictEqual([1, 2, 3]);
        expect(result.map(e => e.toolName)).toStrictEqual(['tool_a', 'tool_b', 'tool_c']);
      });

      it('includes both successful and failed executions', () => {
        expect(result.map(e => e.success)).toStrictEqual([true, false, true]);
      });
    });

    describe('with no executions', () => {
      let result: ToolExecution[];

      beforeEach(() => {
        result = handler.getToolExecutions();
      });

      it('returns empty array', () => {
        expect(result).toStrictEqual([]);
      });
    });
  });
});
