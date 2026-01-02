import { beforeEach, describe, expect, it } from '@jest/globals';

import { createToolError, createToolSuccess } from '../toolResponse';

describe('createToolSuccess', () => {
  let result: unknown;

  describe('with simple data', () => {
    beforeEach(() => {
      result = JSON.parse(createToolSuccess({ data: 'test' }));
    });

    it('returns parsed object with success true and data', () => {
      expect(result).toStrictEqual({ success: true, data: 'test' });
    });
  });

  describe('with nested objects', () => {
    beforeEach(() => {
      result = JSON.parse(
        createToolSuccess({
          summary: { title: 'Test', level: 'error' },
          metadata: { timestamp: '2024-01-01' }
        })
      );
    });

    it('returns parsed object with nested data', () => {
      expect(result).toStrictEqual({
        success: true,
        summary: { title: 'Test', level: 'error' },
        metadata: { timestamp: '2024-01-01' }
      });
    });
  });

  describe('with empty object', () => {
    beforeEach(() => {
      result = JSON.parse(createToolSuccess({}));
    });

    it('returns parsed object with only success true', () => {
      expect(result).toStrictEqual({ success: true });
    });
  });
});

describe('createToolError', () => {
  let result: unknown;

  describe('with basic error', () => {
    beforeEach(() => {
      result = JSON.parse(createToolError('test_tool', 'Something went wrong'));
    });

    it('returns parsed object with success false and formatted error', () => {
      expect(result).toStrictEqual({ success: false, error: 'test_tool: Something went wrong' });
    });
  });

  describe('without options (backward compatibility)', () => {
    beforeEach(() => {
      result = JSON.parse(createToolError('test_tool', 'Error message'));
    });

    it('returns only success and error fields', () => {
      expect(result).toStrictEqual({ success: false, error: 'test_tool: Error message' });
    });
  });

  describe('with doNotRetry option', () => {
    beforeEach(() => {
      result = JSON.parse(createToolError('test_tool', 'Error', { doNotRetry: true }));
    });

    it('returns doNotRetry and instruction fields', () => {
      expect(result).toStrictEqual({
        success: false,
        error: 'test_tool: Error',
        doNotRetry: true,
        instruction: 'DO NOT retry this operation. Proceed with available data or try a different approach.'
      });
    });
  });

  describe('with suggestedAction option', () => {
    beforeEach(() => {
      result = JSON.parse(createToolError('test_tool', 'Error', { suggestedAction: 'Try a different query' }));
    });

    it('returns suggestedAction field', () => {
      expect(result).toStrictEqual({
        success: false,
        error: 'test_tool: Error',
        suggestedAction: 'Try a different query'
      });
    });
  });

  describe('with all options', () => {
    beforeEach(() => {
      result = JSON.parse(
        createToolError('investigate_sentry', 'API rate limited', {
          doNotRetry: true,
          suggestedAction: 'Check Sentry API credentials'
        })
      );
    });

    it('returns all optional fields', () => {
      expect(result).toStrictEqual({
        success: false,
        error: 'investigate_sentry: API rate limited',
        doNotRetry: true,
        suggestedAction: 'Check Sentry API credentials',
        instruction: 'DO NOT retry this operation. Proceed with available data or try a different approach.'
      });
    });
  });
});
