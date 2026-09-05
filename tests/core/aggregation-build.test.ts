import { describe, it, expect } from 'vitest';
import { buildMassAggregation } from '../../src/core/aggregation.js';
import type { SessionReport } from '../../src/core/types.js';

// Direct coverage for the pure aggregation core (previously the test file
// re-implemented this logic inline because only the IO wrapper was exported).

function report(o: Partial<SessionReport> = {}): SessionReport {
  return {
    sessionId: 's', projectPath: 'projA',
    startTimestamp: '2026-09-01T00:00:00Z', endTimestamp: '2026-09-01T01:00:00Z',
    duration: '1h', totalTurns: 10,
    totalInputTokens: 100, totalOutputTokens: 50, totalCacheCreation: 1000, totalCacheRead: 5000,
    totalContextTokens: 6000, peakContext: 6000, peakContextPercent: 1, modelWindow: 1_000_000,
    estimatedCost: 1, segments: [], compactEvents: [], topConsumers: [], userRequestStats: [],
    toolStats: [], fileStats: [], toolSizeStats: [], findings: [],
    ...o,
  } as SessionReport;
}

describe('buildMassAggregation', () => {
  it('returns an empty aggregation for no reports', () => {
    const agg = buildMassAggregation([]);
    expect(agg.totalSessions).toBe(0);
    expect(agg.totalCost).toBe(0);
    expect(agg.projects).toEqual([]);
  });

  it('sums totals and groups by project', () => {
    const agg = buildMassAggregation([
      report({ projectPath: 'projA', estimatedCost: 2, totalTurns: 10, totalContextTokens: 6000 }),
      report({ projectPath: 'projA', estimatedCost: 3, totalTurns: 5, totalContextTokens: 4000 }),
      report({ projectPath: 'projB', estimatedCost: 1, totalTurns: 7, totalContextTokens: 1000 }),
    ]);
    expect(agg.totalSessions).toBe(3);
    expect(agg.totalCost).toBeCloseTo(6, 5);
    expect(agg.totalTurns).toBe(22);
    const projA = agg.projects.find((p) => p.projectPath === 'projA')!;
    expect(projA.sessionCount).toBe(2);
    expect(projA.totalCost).toBeCloseTo(5, 5);
    expect(agg.projects[0].sessionCount).toBe(2); // sorted by session count desc
  });

  it('computes the date range from earliest start to latest end', () => {
    const agg = buildMassAggregation([
      report({ startTimestamp: '2026-09-03T00:00:00Z', endTimestamp: '2026-09-03T02:00:00Z' }),
      report({ startTimestamp: '2026-09-01T00:00:00Z', endTimestamp: '2026-09-05T00:00:00Z' }),
    ]);
    expect(agg.startDate).toBe('2026-09-01');
    expect(agg.endDate).toBe('2026-09-05');
  });
});
