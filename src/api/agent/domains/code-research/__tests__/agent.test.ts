import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { StructuredToolInterface } from '@langchain/core/tools';

import { filterChunkhoundTools } from '../agent';

describe('filterChunkhoundTools', () => {
  let result: StructuredToolInterface[];

  const createMockTool = (name: string): StructuredToolInterface =>
    ({
      name,
      description: `Tool: ${name}`,
      invoke: jest.fn()
    }) as unknown as StructuredToolInterface;

  describe('with mixed MCP tools', () => {
    const mockTools = [
      createMockTool('mcp_chunkhound_search'),
      createMockTool('mcp_chunkhound_code_research'),
      createMockTool('mcp_brave-search_brave_web_search'),
      createMockTool('mcp_context7_resolve-library-id'),
      createMockTool('mcp_kubernetes-readonly_get_pods')
    ];

    beforeEach(() => {
      result = filterChunkhoundTools(mockTools);
    });

    it('returns only ChunkHound tools', () => {
      expect(result).toHaveLength(2);
    });

    it('includes search tool', () => {
      expect(result.some(t => t.name === 'mcp_chunkhound_search')).toBe(true);
    });

    it('includes code_research tool', () => {
      expect(result.some(t => t.name === 'mcp_chunkhound_code_research')).toBe(true);
    });

    it('excludes non-ChunkHound tools', () => {
      expect(result.some(t => t.name.startsWith('mcp_brave'))).toBe(false);
      expect(result.some(t => t.name.startsWith('mcp_context7'))).toBe(false);
      expect(result.some(t => t.name.startsWith('mcp_kubernetes'))).toBe(false);
    });
  });

  describe('with no ChunkHound tools', () => {
    const mockTools = [createMockTool('mcp_brave-search_brave_web_search'), createMockTool('mcp_context7_resolve-library-id')];

    beforeEach(() => {
      result = filterChunkhoundTools(mockTools);
    });

    it('returns empty array', () => {
      expect(result).toHaveLength(0);
    });
  });

  describe('with empty array', () => {
    beforeEach(() => {
      result = filterChunkhoundTools([]);
    });

    it('returns empty array', () => {
      expect(result).toHaveLength(0);
    });
  });

  describe('with only ChunkHound tools', () => {
    const mockTools = [createMockTool('mcp_chunkhound_search'), createMockTool('mcp_chunkhound_code_research')];

    beforeEach(() => {
      result = filterChunkhoundTools(mockTools);
    });

    it('returns all tools', () => {
      expect(result).toHaveLength(2);
    });
  });
});
