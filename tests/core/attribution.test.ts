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
      expect(segments[0].peakContextPercent).toBe(5); // 50000 / 1_000_000 (default window) * 100
    });

    it('should honor an explicit per-model window (Haiku = 200K)', () => {
      const turns: Turn[] = [
        createTurn({ turnIndex: 0, contextTokens: 10000 }),
        createTurn({ turnIndex: 1, contextTokens: 50000 }),
      ];

      const segments = segmentSession(turns, [], 200_000);

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

    it('should keep percentOfSession in 0–100% when a compaction drop occurs', () => {
      // A big negative delta (compaction) must not inflate the denominator math.
      const turns: Turn[] = [
        createTurn({
          toolCall: { toolId: '1', toolName: 'Read', input: {}, isError: false },
          contextTokens: 800_000,
          tokenDelta: 800_000,
        }),
        createTurn({
          toolCall: { toolId: '2', toolName: 'Bash', input: {}, isError: false },
          contextTokens: 60_000,
          tokenDelta: -740_000, // compaction: context dropped, not "consumption"
        }),
        createTurn({
          toolCall: { toolId: '3', toolName: 'Bash', input: {}, isError: false },
          contextTokens: 260_000,
          tokenDelta: 200_000,
        }),
      ];

      const stats = aggregateToolStats(turns);
      const total = stats.reduce((s, t) => s + t.percentOfSession, 0);

      for (const t of stats) {
        expect(t.percentOfSession).toBeGreaterThanOrEqual(0);
        expect(t.percentOfSession).toBeLessThanOrEqual(100);
      }
      expect(total).toBeCloseTo(100, 5); // gross positive growth: 800K + 200K
      expect(stats.find(s => s.toolName === 'Read')?.percentOfSession).toBeCloseTo(80, 5);
      expect(stats.find(s => s.toolName === 'Bash')?.percentOfSession).toBeCloseTo(20, 5);
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
    it('should default to Opus-class rates when no model is given', () => {
      const cost = calculateCost({
        inputTokens: 1_000_000,  // $5
        outputTokens: 1_000_000, // $25
        cacheCreation: 1_000_000, // $6.25
        cacheRead: 1_000_000,     // $0.50
      });

      expect(cost).toBeCloseTo(36.75, 2);
    });

    it('should price explicit Opus rates', () => {
      const cost = calculateCost(
        { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheCreation: 1_000_000, cacheRead: 1_000_000 },
        'claude-opus-4-8-20260101'
      );
      expect(cost).toBeCloseTo(36.75, 2); // 5 + 25 + 6.25 + 0.5
    });

    it('should price Sonnet 5 distinctly from older Sonnet', () => {
      const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheCreation: 0, cacheRead: 0 };
      expect(calculateCost(usage, 'claude-sonnet-5')).toBeCloseTo(12.0, 2); // $2 + $10
      expect(calculateCost(usage, 'claude-sonnet-4-6')).toBeCloseTo(18.0, 2); // $3 + $15
      // "3-5-sonnet" is a 3.5 model, NOT Sonnet 5 → older Sonnet rate.
      expect(calculateCost(usage, 'claude-3-5-sonnet-20241022')).toBeCloseTo(18.0, 2);
    });

    it('should price Haiku and Fable', () => {
      const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheCreation: 0, cacheRead: 0 };
      expect(calculateCost(usage, 'claude-haiku-4-5-20251001')).toBeCloseTo(6.0, 2);  // $1 + $5
      expect(calculateCost(usage, 'claude-fable-5-1')).toBeCloseTo(60.0, 2);          // $10 + $50
    });

    it('should price 1-hour cache writes higher than 5-minute writes', () => {
      const opus = 'claude-opus-4-8';
      // all 5-minute (no 1h breakdown) → Opus 5m write $6.25
      expect(calculateCost({ inputTokens: 0, outputTokens: 0, cacheCreation: 1_000_000, cacheRead: 0 }, opus)).toBeCloseTo(6.25, 2);
      // all 1-hour → Opus 1h write $10
      expect(calculateCost({ inputTokens: 0, outputTokens: 0, cacheCreation: 1_000_000, cacheCreation1h: 1_000_000, cacheRead: 0 }, opus)).toBeCloseTo(10.0, 2);
      // half/half → 0.5*6.25 + 0.5*10 = 8.125
      expect(calculateCost({ inputTokens: 0, outputTokens: 0, cacheCreation: 1_000_000, cacheCreation1h: 500_000, cacheRead: 0 }, opus)).toBeCloseTo(8.125, 3);
    });

    it('should handle small values at default (Opus) rates', () => {
      const cost = calculateCost({
        inputTokens: 1000,
        outputTokens: 500,
        cacheCreation: 0,
        cacheRead: 0,
      });

      // 1000 * 5/1M + 500 * 25/1M = 0.005 + 0.0125 = 0.0175
      expect(cost).toBeCloseTo(0.0175, 4);
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

    it('should use the dominant model window (Opus = 1M) and price per-turn', () => {
      const turns: Turn[] = [
        createTurn({
          turnIndex: 0,
          model: 'claude-opus-4-8-20260101',
          usage: { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          contextTokens: 100_000,
          tokenDelta: 100_000,
        }),
      ];

      const report = generateReport('s', 'p', turns);

      expect(report.modelWindow).toBe(1_000_000);
      expect(report.primaryModel).toBe('Opus');
      expect(report.peakContextPercent).toBeCloseTo(10, 5); // 100K / 1M
      expect(report.estimatedCost).toBeCloseTo(5.0, 2);     // 1M input * $5/1M
    });

    it('should size the window to Haiku (200K) for a Haiku-dominant session', () => {
      const turns: Turn[] = [
        createTurn({
          turnIndex: 0,
          model: 'claude-haiku-4-5-20251001',
          usage: { input_tokens: 100, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          contextTokens: 100_000,
          tokenDelta: 100_000,
        }),
      ];

      const report = generateReport('s', 'p', turns);

      expect(report.modelWindow).toBe(200_000);
      expect(report.primaryModel).toBe('Haiku');
      expect(report.peakContextPercent).toBeCloseTo(50, 5); // 100K / 200K
    });

    it('should fold subagent cost into the total but keep context on the main thread', () => {
      const mainTurns: Turn[] = [
        createTurn({
          turnIndex: 0,
          model: 'claude-opus-4-8',
          usage: { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          contextTokens: 500_000,
          tokenDelta: 500_000,
        }),
      ];
      const subagentTurns: Turn[] = [
        createTurn({
          turnIndex: 0,
          model: 'claude-haiku-4-5',
          usage: { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          contextTokens: 900_000, // huge, but must NOT affect the main-thread peak
          tokenDelta: 900_000,
        }),
      ];

      const report = generateReport('s', 'p', mainTurns, subagentTurns, 3);

      expect(report.mainThreadCost).toBeCloseTo(5.0, 2);   // Opus 1M input
      expect(report.subagentCost).toBeCloseTo(1.0, 2);     // Haiku 1M input
      expect(report.estimatedCost).toBeCloseTo(6.0, 2);    // folded total
      expect(report.subagentCount).toBe(3);
      expect(report.subagentTurns).toBe(1);
      // Context stays main-thread: peak reflects the main turn (500K), not 900K.
      expect(report.peakContext).toBe(500_000);
      expect(report.peakContextPercent).toBeCloseTo(50, 5);
    });

    it('should sum cost across mixed models per turn', () => {
      const turns: Turn[] = [
        createTurn({
          turnIndex: 0,
          model: 'claude-opus-4-8',
          usage: { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          contextTokens: 1_000_000,
          tokenDelta: 1_000_000,
        }),
        createTurn({
          turnIndex: 1,
          model: 'claude-haiku-4-5',
          usage: { input_tokens: 1_000_000, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          contextTokens: 1_000_000,
          tokenDelta: 0,
        }),
      ];

      const report = generateReport('s', 'p', turns);

      // Opus 1M input ($5) + Haiku 1M input ($1) = $6, NOT priced all-as-Opus ($10).
      expect(report.estimatedCost).toBeCloseTo(6.0, 2);
    });
  });
});
