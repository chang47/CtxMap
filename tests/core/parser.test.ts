import { describe, it, expect } from 'vitest';
import {
  parseTurns,
  getSessionMetadata,
  formatToolDescription,
  normalizeToolResultContent,
} from '../../src/core/parser.js';
import type { JsonlEntry, ToolCall } from '../../src/core/types.js';

describe('parser', () => {
  describe('parseTurns', () => {
    it('should parse assistant messages with usage data into turns', () => {
      const entries: JsonlEntry[] = [
        {
          type: 'assistant',
          timestamp: '2025-02-19T10:00:00Z',
          sessionId: 'test-session',
          isSidechain: false,
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'toolu_01', name: 'Read', input: { file_path: '/test.ts' } },
            ],
            usage: {
              input_tokens: 100,
              output_tokens: 50,
              cache_creation_input_tokens: 1000,
              cache_read_input_tokens: 500,
            },
          },
        },
        {
          type: 'user',
          timestamp: '2025-02-19T10:00:01Z',
          sessionId: 'test-session',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'toolu_01', content: 'file contents' },
            ],
          },
        },
        {
          type: 'assistant',
          timestamp: '2025-02-19T10:00:02Z',
          sessionId: 'test-session',
          isSidechain: false,
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'toolu_02', name: 'Bash', input: { command: 'ls' } },
            ],
            usage: {
              input_tokens: 200,
              output_tokens: 60,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 1600,
            },
          },
        },
      ];

      const turns = parseTurns(entries);

      expect(turns).toHaveLength(2);
      expect(turns[0].toolCall?.toolName).toBe('Read');
      expect(turns[0].contextTokens).toBe(1600); // 100 + 1000 + 500
      expect(turns[0].tokenDelta).toBe(1600); // First turn, delta equals context
      expect(turns[0].outputTokens).toBe(50);

      expect(turns[1].toolCall?.toolName).toBe('Bash');
      expect(turns[1].contextTokens).toBe(1800); // 200 + 0 + 1600
      expect(turns[1].tokenDelta).toBe(200); // 1800 - 1600
    });

    it('should skip sidechain entries', () => {
      const entries: JsonlEntry[] = [
        {
          type: 'assistant',
          timestamp: '2025-02-19T10:00:00Z',
          sessionId: 'test-session',
          isSidechain: true, // Should be skipped
          message: {
            role: 'assistant',
            content: [],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
        {
          type: 'assistant',
          timestamp: '2025-02-19T10:00:01Z',
          sessionId: 'test-session',
          isSidechain: false,
          message: {
            role: 'assistant',
            content: [],
            usage: { input_tokens: 200, output_tokens: 60 },
          },
        },
      ];

      const turns = parseTurns(entries);

      expect(turns).toHaveLength(1);
    });

    it('should skip entries without usage', () => {
      const entries: JsonlEntry[] = [
        {
          type: 'assistant',
          timestamp: '2025-02-19T10:00:00Z',
          sessionId: 'test-session',
          isSidechain: false,
          message: {
            role: 'assistant',
            content: [],
            // No usage
          },
        },
        {
          type: 'assistant',
          timestamp: '2025-02-19T10:00:01Z',
          sessionId: 'test-session',
          isSidechain: false,
          message: {
            role: 'assistant',
            content: [],
            usage: { input_tokens: 200, output_tokens: 60 },
          },
        },
      ];

      const turns = parseTurns(entries);

      expect(turns).toHaveLength(1);
    });

    it('should find tool results for tool calls', () => {
      const entries: JsonlEntry[] = [
        {
          type: 'assistant',
          timestamp: '2025-02-19T10:00:00Z',
          sessionId: 'test-session',
          isSidechain: false,
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'toolu_01', name: 'Read', input: { file_path: '/test.ts' } },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
        {
          type: 'user',
          timestamp: '2025-02-19T10:00:01Z',
          sessionId: 'test-session',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'toolu_01', content: 'actual file contents' },
            ],
          },
        },
      ];

      const turns = parseTurns(entries);

      expect(turns[0].toolCall?.result).toBe('actual file contents');
    });

    it('should size array-shaped tool_result content by text bytes, not block count', () => {
      // Real transcript shape: tool_result.content is an array of blocks
      // (text / tool_reference / image), not a plain string.
      const text = 'x'.repeat(500);
      const entries: JsonlEntry[] = [
        {
          type: 'assistant',
          timestamp: '2025-02-19T10:00:00Z',
          sessionId: 'test-session',
          isSidechain: false,
          message: {
            role: 'assistant',
            content: [
              { type: 'tool_use', id: 'toolu_01', name: 'Task', input: { subagent_type: 'general' } },
            ],
            usage: { input_tokens: 100, output_tokens: 50 },
          },
        },
        {
          type: 'user',
          timestamp: '2025-02-19T10:00:01Z',
          sessionId: 'test-session',
          message: {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_01',
                content: [
                  { type: 'text', text },
                  { type: 'tool_reference', tool_name: 'WebSearch' },
                  { type: 'image' },
                ],
              },
            ],
          },
        },
      ];

      const turns = parseTurns(entries);

      // Old bug: resultSize would be 3 (array length). Now it's the joined text bytes.
      expect(turns[0].resultSize).toBe(text.length + '\n[image]'.length);
      expect(turns[0].toolCall?.result).toContain(text);
    });
  });

  describe('normalizeToolResultContent', () => {
    it('should pass through a plain string', () => {
      expect(normalizeToolResultContent('hello')).toBe('hello');
    });

    it('should join text blocks in an array', () => {
      expect(
        normalizeToolResultContent([
          { type: 'text', text: 'line one' },
          { type: 'text', text: 'line two' },
        ])
      ).toBe('line one\nline two');
    });

    it('should skip tool_reference blocks and mark images', () => {
      expect(
        normalizeToolResultContent([
          { type: 'text', text: 'result' },
          { type: 'tool_reference', tool_name: 'WebSearch' },
          { type: 'image' },
        ])
      ).toBe('result\n[image]');
    });

    it('should return empty string for null/undefined/other', () => {
      expect(normalizeToolResultContent(undefined)).toBe('');
      expect(normalizeToolResultContent(null)).toBe('');
      expect(normalizeToolResultContent(42)).toBe('');
    });
  });

  describe('getSessionMetadata', () => {
    it('should extract session metadata from entries', () => {
      const entries: JsonlEntry[] = [
        {
          type: 'assistant',
          timestamp: '2025-02-19T10:00:00Z',
          sessionId: 'test-session-123',
          message: { role: 'assistant', content: [] },
        },
        {
          type: 'user',
          timestamp: '2025-02-19T10:05:00Z',
          sessionId: 'test-session-123',
          message: { role: 'user', content: [] },
        },
      ];

      const metadata = getSessionMetadata(entries);

      expect(metadata.sessionId).toBe('test-session-123');
      expect(metadata.startTimestamp).toBe('2025-02-19T10:00:00Z');
      expect(metadata.endTimestamp).toBe('2025-02-19T10:05:00Z');
    });

    it('should handle empty entries', () => {
      const metadata = getSessionMetadata([]);

      expect(metadata.sessionId).toBe('');
      expect(metadata.startTimestamp).toBe('');
      expect(metadata.endTimestamp).toBe('');
    });
  });

  describe('formatToolDescription', () => {
    it('should format Read tool calls', () => {
      const toolCall: ToolCall = {
        toolId: '1',
        toolName: 'Read',
        input: { file_path: '/path/to/file.ts' },
        isError: false,
      };

      const desc = formatToolDescription(toolCall);

      expect(desc).toBe('Read to/file.ts');
    });

    it('should format Bash tool calls', () => {
      const toolCall: ToolCall = {
        toolId: '1',
        toolName: 'Bash',
        input: { command: 'npm run build' },
        isError: false,
      };

      const desc = formatToolDescription(toolCall);

      expect(desc).toBe('Bash npm run build');
    });

    it('should truncate long commands', () => {
      const toolCall: ToolCall = {
        toolId: '1',
        toolName: 'Bash',
        input: { command: 'this is a very very very very very very long command' },
        isError: false,
      };

      const desc = formatToolDescription(toolCall);

      expect(desc.length).toBeLessThanOrEqual(35); // "Bash " + max 30 chars
    });

    it('should format Grep tool calls', () => {
      const toolCall: ToolCall = {
        toolId: '1',
        toolName: 'Grep',
        input: { pattern: 'function' },
        isError: false,
      };

      const desc = formatToolDescription(toolCall);

      expect(desc).toBe('Grep "function"');
    });

    it('should format unknown tool calls', () => {
      const toolCall: ToolCall = {
        toolId: '1',
        toolName: 'CustomTool',
        input: { foo: 'bar' },
        isError: false,
      };

      const desc = formatToolDescription(toolCall);

      expect(desc).toContain('CustomTool');
    });
  });
});
