import { describe, it, expect } from 'vitest';
import {
  detectCompacts,
  segmentSession,
  aggregateToolStats,
  aggregateToolSizeStats,
  getTopConsumers,
  aggregateByUserMessage,
  calculateCost,
  generateReport,
} from '../../src/core/attribution.js';
import type { Turn } from '../../src/core/types.js';

function createTurn(overrides: Partial<Turn> = {}): Turn {
  return {
    turnIndex: 0,
    timestamp: '2025-02-19T10:00:00Z',
    toolCall: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    contextTokens: 100,
    tokenDelta: 100,
    outputTokens: 50,
    ...overrides,
  };
}

describe('attribution', () => {
  describe('detectCompacts', () => {
    it('should detect a compact when context drops significantly', () => {
      const turns: Turn[] = [
        createTurn({ turnIndex: 0, contextTokens: 50000, tokenDelta: 50000 }),
        createTurn({ turnIndex: 1, contextTokens: 20000, tokenDelta: -30000 }), // 60% drop = compact
        createTurn({ turnIndex: 2, contextTokens: 25000, tokenDelta: 5000 }),
      ];

      const compacts = detectCompacts(turns);

      expect(compacts).toHaveLength(1);
      expect(compacts[0].turnIndex).toBe(1);
      expect(compacts[0].beforeTokens).toBe(50000);
      expect(compacts[0].afterTokens).toBe(20000);
      expect(compacts[0].tokensSaved).toBe(30000);
    });

    it('should not detect compact for small drops', () => {
      const turns: Turn[] = [
        createTurn({ turnIndex: 0, contextTokens: 50000, tokenDelta: 50000 }),
        createTurn({ turnIndex: 1, contextTokens: 30000, tokenDelta: -20000 }), // 40% drop = not compact
      ];

      const compacts = detectCompacts(turns);

      expect(compacts).toHaveLength(0);
    });

    it('should detect multiple compacts', () => {
      const turns: Turn[] = [
        createTurn({ turnIndex: 0, contextTokens: 50000, tokenDelta: 50000 }),
        createTurn({ turnIndex: 1, contextTokens: 20000, tokenDelta: -30000 }), // Compact 1
        createTurn({ turnIndex: 2, contextTokens: 45000, tokenDelta: 25000 }),
        createTurn({ turnIndex: 3, contextTokens: 15000, tokenDelta: -30000 }), // Compact 2
      ];

      const compacts = detectCompacts(turns);

      expect(compacts).toHaveLength(2);
      expect(compacts[0].turnIndex).toBe(1);
      expect(compacts[1].turnIndex).toBe(3);
    });

    it('should handle empty turns', () => {
      const compacts = detectCompacts([]);
      expect(compacts).toHaveLength(0);
    });
  });

  describe('segmentSession', () => {
    it('should create one segment for session without compacts', () => {
      const turns: Turn[] = [
        createTurn({ turnIndex: 0, contextTokens: 10000 }),
        createTurn({ turnIndex: 1, contextTokens: 20000 }),
        createTurn({ turnIndex: 2, contextTokens: 30000 }),
      ];

      const segments = segmentSession(turns, []);

      expect(segments).toHaveLength(1);
      expect(segments[0].label).toBe('Pre-compact');
      expect(segments[0].startTurn).toBe(0);
      expect(segments[0].endTurn).toBe(2);
      expect(segments[0].peakContext).toBe(30000);
    });

    it('should split session at compact points', () => {
      const turns: Turn[] = [
        createTurn({ turnIndex: 0, contextTokens: 10000, timestamp: '2025-02-19T10:00:00Z' }),
        createTurn({ turnIndex: 1, contextTokens: 50000, timestamp: '2025-02-19T10:01:00Z' }),
        createTurn({ turnIndex: 2, contextTokens: 20000, timestamp: '2025-02-19T10:02:00Z' }), // Compact here
        createTurn({ turnIndex: 3, contextTokens: 30000, timestamp: '2025-02-19T10:03:00Z' }),
      ];

      const compacts = detectCompacts(turns);
      const segments = segmentSession(turns, compacts);

      expect(segments).toHaveLength(2);
      expect(segments[0].label).toBe('Pre-compact');
      expect(segments[0].endTurn).toBe(1);
      expect(segments[1].label).toBe('Post-compact #1');
      expect(segments[1].startTurn).toBe(2);
    });

    it('should calculate peak context per segment', () => {
      const turns: Turn[] = [
        createTurn({ turnIndex: 0, contextTokens: 10000 }),
        createTurn({ turnIndex: 1, contextTokens: 50000 }),
        createTurn({ turnIndex: 2, contextTokens: 30000 }),
      ];

      const segments = segmentSession(turns, []);

      expect(segments[0].peakContext).toBe(50000);
      expect(segments[0].peakContextPercent).toBe(25); // 50000 / 200000 * 100
    });
  });

  describe('aggregateToolStats', () => {
    it('should aggregate statistics by tool type', () => {
      const turns: Turn[] = [
        createTurn({
          toolCall: { toolId: '1', toolName: 'Read', input: {}, isError: false },
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 1000, cache_read_input_tokens: 500 },
          tokenDelta: 1600,
        }),
        createTurn({
          toolCall: { toolId: '2', toolName: 'Read', input: {}, isError: false },
          usage: { input_tokens: 200, output_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 200 },
          tokenDelta: 400,
        }),
        createTurn({
          toolCall: { toolId: '3', toolName: 'Bash', input: {}, isError: false },
          usage: { input_tokens: 300, output_tokens: 70, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          tokenDelta: 300,
        }),
      ];

      const stats = aggregateToolStats(turns);

      expect(stats).toHaveLength(2);
      expect(stats.find(s => s.toolName === 'Read')?.count).toBe(2);
      expect(stats.find(s => s.toolName === 'Read')?.totalContextTokens).toBe(2000);
      expect(stats.find(s => s.toolName === 'Bash')?.count).toBe(1);
    });

    it('should handle turns without tool calls', () => {
      const turns: Turn[] = [
        createTurn({ toolCall: null, tokenDelta: 500 }),
      ];

      const stats = aggregateToolStats(turns);

      expect(stats).toHaveLength(1);
      expect(stats[0].toolName).toBe('initial_context');
    });

    it('should sort by context tokens descending', () => {
      const turns: Turn[] = [
        createTurn({
          toolCall: { toolId: '1', toolName: 'Read', input: {}, isError: false },
          tokenDelta: 100,
        }),
        createTurn({
          toolCall: { toolId: '2', toolName: 'Bash', input: {}, isError: false },
          tokenDelta: 500,
        }),
      ];

      const stats = aggregateToolStats(turns);

      expect(stats[0].toolName).toBe('Bash');
      expect(stats[1].toolName).toBe('Read');
    });
  });

  describe('aggregateToolSizeStats', () => {
    it('should aggregate statistics by tool type based on result size', () => {
      const turns: Turn[] = [
        createTurn({
          toolCall: { toolId: '1', toolName: 'Read', input: { file_path: '/a.ts' }, isError: false },
          resultSize: 5000,
        }),
        createTurn({
          toolCall: { toolId: '2', toolName: 'Read', input: { file_path: '/b.ts' }, isError: false },
          resultSize: 3000,
        }),
        createTurn({
          toolCall: { toolId: '3', toolName: 'Bash', input: { command: 'npm test' }, isError: false },
          resultSize: 10000,
        }),
      ];

      const stats = aggregateToolSizeStats(turns);

      expect(stats).toHaveLength(2);
      expect(stats.find(s => s.toolName === 'Read')?.count).toBe(2);
      expect(stats.find(s => s.toolName === 'Read')?.totalSizeBytes).toBe(8000);
      expect(stats.find(s => s.toolName === 'Bash')?.count).toBe(1);
      expect(stats.find(s => s.toolName === 'Bash')?.totalSizeBytes).toBe(10000);
    });

    it('should track per-file breakdown', () => {
      const turns: Turn[] = [
        createTurn({
          toolCall: { toolId: '1', toolName: 'Read', input: { file_path: '/a.ts' }, isError: false },
          resultSize: 5000,
        }),
        createTurn({
          toolCall: { toolId: '2', toolName: 'Read', input: { file_path: '/b.ts' }, isError: false },
          resultSize: 3000,
        }),
        createTurn({
          toolCall: { toolId: '3', toolName: 'Read', input: { file_path: '/a.ts' }, isError: false },
          resultSize: 5000,
        }),
      ];

      const stats = aggregateToolSizeStats(turns);

      expect(stats).toHaveLength(1);
      expect(stats[0].files).toHaveLength(2);
      expect(stats[0].files[0].path).toBe('/a.ts');
      expect(stats[0].files[0].sizeBytes).toBe(10000); // 5000 * 2
      expect(stats[0].files[0].count).toBe(2);
      expect(stats[0].files[1].path).toBe('/b.ts');
      expect(stats[0].files[1].sizeBytes).toBe(3000);
    });

    it('should sort by total size descending', () => {
      const turns: Turn[] = [
        createTurn({
          toolCall: { toolId: '1', toolName: 'Read', input: {}, isError: false },
          resultSize: 1000,
        }),
        createTurn({
          toolCall: { toolId: '2', toolName: 'Bash', input: {}, isError: false },
          resultSize: 5000,
        }),
      ];

      const stats = aggregateToolSizeStats(turns);

      expect(stats[0].toolName).toBe('Bash');
      expect(stats[1].toolName).toBe('Read');
    });

    it('should handle turns without tool calls', () => {
      const turns: Turn[] = [
        createTurn({ toolCall: null, resultSize: 5000 }),
      ];

      const stats = aggregateToolSizeStats(turns);

      expect(stats).toHaveLength(0);
    });

    it('should handle missing resultSize', () => {
      const turns: Turn[] = [
        createTurn({
          toolCall: { toolId: '1', toolName: 'Read', input: {}, isError: false },
          // no resultSize
        }),
      ];

      const stats = aggregateToolSizeStats(turns);

      expect(stats).toHaveLength(1);
      expect(stats[0].totalSizeBytes).toBe(0);
    });
  });

  describe('getTopConsumers', () => {
    it('should return top token consumers sorted by tokens', () => {
      const turns: Turn[] = [
        createTurn({
          turnIndex: 0,
          toolCall: { toolId: '1', toolName: 'Read', input: { file_path: '/a.ts' }, isError: false },
          tokenDelta: 5000,
        }),
        createTurn({
          turnIndex: 1,
          toolCall: { toolId: '2', toolName: 'Read', input: { file_path: '/b.ts' }, isError: false },
          tokenDelta: 10000,
        }),
        createTurn({
          turnIndex: 2,
          toolCall: { toolId: '3', toolName: 'Bash', input: { command: 'test' }, isError: false },
          tokenDelta: 3000,
        }),
      ];

      const consumers = getTopConsumers(turns, 10);

      expect(consumers).toHaveLength(3);
      expect(consumers[0].tokens).toBe(10000);
      expect(consumers[0].cumulative).toBe(10000);
      expect(consumers[1].tokens).toBe(5000);
      expect(consumers[1].cumulative).toBe(15000);
    });

    it('should respect the limit parameter', () => {
      const turns: Turn[] = Array.from({ length: 20 }, (_, i) =>
        createTurn({
          turnIndex: i,
          toolCall: { toolId: `${i}`, toolName: 'Read', input: {}, isError: false },
          tokenDelta: 1000,
        })
      );

      const consumers = getTopConsumers(turns, 5);

      expect(consumers).toHaveLength(5);
    });

    it('should exclude turns without tool calls', () => {
      const turns: Turn[] = [
        createTurn({ toolCall: null, tokenDelta: 10000 }),
        createTurn({
          toolCall: { toolId: '1', toolName: 'Read', input: {}, isError: false },
          tokenDelta: 1000,
        }),
      ];

      const consumers = getTopConsumers(turns);

      expect(consumers).toHaveLength(1);
      expect(consumers[0].toolName).toBe('Read');
    });
  });

  describe('aggregateByUserMessage', () => {
    it('should group consecutive turns with same prompt', () => {
      const turns: Turn[] = [
        createTurn({ turnIndex: 0, userPrompt: 'Fix the bug', tokenDelta: 5000, toolCall: { toolId: '1', toolName: 'Read', input: {}, isError: false } }),
        createTurn({ turnIndex: 1, userPrompt: 'Fix the bug', tokenDelta: 3000, toolCall: { toolId: '2', toolName: 'Edit', input: {}, isError: false } }),
        createTurn({ turnIndex: 2, userPrompt: 'Fix the bug', tokenDelta: 2000, toolCall: { toolId: '3', toolName: 'Bash', input: {}, isError: false } }),
      ];

      const stats = aggregateByUserMessage(turns);

      expect(stats).toHaveLength(1);
      expect(stats[0].userPrompt).toBe('Fix the bug');
      expect(stats[0].turnCount).toBe(3);
      expect(stats[0].totalTokens).toBe(10000);
      expect(stats[0].toolCount).toBe(3);
      expect(stats[0].startTurn).toBe(0);
      expect(stats[0].endTurn).toBe(2);
    });

    it('should handle turns without userPrompt (initial context)', () => {
      const turns: Turn[] = [
        createTurn({ turnIndex: 0, userPrompt: undefined, tokenDelta: 5000 }),
        createTurn({ turnIndex: 1, userPrompt: undefined, tokenDelta: 3000 }),
      ];

      const stats = aggregateByUserMessage(turns);

      expect(stats).toHaveLength(1);
      expect(stats[0].userPrompt).toBe('(initial context)');
      expect(stats[0].totalTokens).toBe(8000);
    });

    it('should separate different user prompts', () => {
      const turns: Turn[] = [
        createTurn({ turnIndex: 0, userPrompt: 'First request', tokenDelta: 5000 }),
        createTurn({ turnIndex: 1, userPrompt: 'First request', tokenDelta: 3000 }),
        createTurn({ turnIndex: 2, userPrompt: 'Second request', tokenDelta: 4000 }),
        createTurn({ turnIndex: 3, userPrompt: 'Second request', tokenDelta: 2000 }),
      ];

      const stats = aggregateByUserMessage(turns);

      expect(stats).toHaveLength(2);
      expect(stats[0].userPrompt).toBe('First request');
      expect(stats[0].totalTokens).toBe(8000);
      expect(stats[1].userPrompt).toBe('Second request');
      expect(stats[1].totalTokens).toBe(6000);
    });

    it('should count tools correctly', () => {
      const turns: Turn[] = [
        createTurn({ turnIndex: 0, userPrompt: 'Test', tokenDelta: 1000, toolCall: { toolId: '1', toolName: 'Read', input: {}, isError: false } }),
        createTurn({ turnIndex: 1, userPrompt: 'Test', tokenDelta: 1000, toolCall: null }), // No tool
        createTurn({ turnIndex: 2, userPrompt: 'Test', tokenDelta: 1000, toolCall: { toolId: '2', toolName: 'Bash', input: {}, isError: false } }),
      ];

      const stats = aggregateByUserMessage(turns);

      expect(stats[0].toolCount).toBe(2);
    });

    it('should sort by total tokens descending', () => {
      const turns: Turn[] = [
        createTurn({ turnIndex: 0, userPrompt: 'Small request', tokenDelta: 100 }),
        createTurn({ turnIndex: 1, userPrompt: 'Large request', tokenDelta: 10000 }),
        createTurn({ turnIndex: 2, userPrompt: 'Medium request', tokenDelta: 1000 }),
      ];

      const stats = aggregateByUserMessage(turns);

      expect(stats).toHaveLength(3);
      expect(stats[0].userPrompt).toBe('Large request');
      expect(stats[1].userPrompt).toBe('Medium request');
      expect(stats[2].userPrompt).toBe('Small request');
    });

    it('should handle empty turns', () => {
      const stats = aggregateByUserMessage([]);
      expect(stats).toHaveLength(0);
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost based on Opus 4.6 rates', () => {
      const cost = calculateCost({
        inputTokens: 1_000_000,  // $15
        outputTokens: 1_000_000, // $75
        cacheCreation: 1_000_000, // $18.75
        cacheRead: 1_000_000,     // $1.50
      });

      expect(cost).toBeCloseTo(110.25, 2);
    });

    it('should handle small values', () => {
      const cost = calculateCost({
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreation: 0,
        cacheRead: 0,
      });

      // 1000 * 15/1M + 500 * 75/1M = 0.015 + 0.0375 = 0.0525
      expect(cost).toBeCloseTo(0.0525, 4);
    });
  });

  describe('generateReport', () => {
    it('should generate a complete session report', () => {
      const turns: Turn[] = [
        createTurn({
          turnIndex: 0,
          timestamp: '2025-02-19T10:00:00Z',
          toolCall: { toolId: '1', toolName: 'Read', input: {}, isError: false },
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 1000, cache_read_input_tokens: 0 },
          contextTokens: 1100,
          tokenDelta: 1100,
        }),
        createTurn({
          turnIndex: 1,
          timestamp: '2025-02-19T10:05:00Z',
          toolCall: { toolId: '2', toolName: 'Bash', input: {}, isError: false },
          usage: { input_tokens: 200, output_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 1100 },
          contextTokens: 1300,
          tokenDelta: 200,
        }),
      ];

      const report = generateReport('test-session', 'test-project', turns);

      expect(report.sessionId).toBe('test-session');
      expect(report.projectPath).toBe('test-project');
      expect(report.totalTurns).toBe(2);
      expect(report.peakContext).toBe(1300);
      expect(report.toolStats).toHaveLength(2);
      expect(report.compactEvents).toHaveLength(0);
      expect(report.segments).toHaveLength(1);
    });
  });
});
