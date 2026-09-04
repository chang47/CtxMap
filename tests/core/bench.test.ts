import { describe, it, expect } from 'vitest';
import { rollupBenchRows } from '../../src/core/bench.js';
import type { BenchRunRow } from '../../src/core/types.js';

function row(overrides: Partial<BenchRunRow> = {}): BenchRunRow {
  return {
    sessionId: Math.random().toString(36).slice(2),
    projectPath: 'p',
    model: 'Opus',
    workflow: 'bugfix',
    cost: 1,
    turns: 10,
    peakContextPercent: 20,
    startTimestamp: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('rollupBenchRows', () => {
  it('groups runs into workflow × model cells with avg/median cost and quality', () => {
    const rows: BenchRunRow[] = [
      row({ workflow: 'docs', model: 'Haiku', cost: 0.10, rating: 'good' }),
      row({ workflow: 'docs', model: 'Haiku', cost: 0.30, rating: 'good' }),
      row({ workflow: 'docs', model: 'Haiku', cost: 0.20, rating: 'ok' }),
      row({ workflow: 'docs', model: 'Opus', cost: 1.00, rating: 'bad' }),
    ];

    const { cells } = rollupBenchRows(rows);
    const haiku = cells.find((c) => c.workflow === 'docs' && c.model === 'Haiku')!;
    const opus = cells.find((c) => c.workflow === 'docs' && c.model === 'Opus')!;

    expect(haiku.runs).toBe(3);
    expect(haiku.avgCost).toBeCloseTo(0.2, 5); // (0.1+0.3+0.2)/3
    expect(haiku.medianCost).toBeCloseTo(0.2, 5);
    expect(haiku.good).toBe(2);
    expect(haiku.ok).toBe(1);
    expect(haiku.qualityScore).toBeCloseTo((2 + 0.5) / 3, 5); // good*1 + ok*0.5 over 3 rated
    expect(opus.runs).toBe(1);
    expect(opus.qualityScore).toBe(0); // one bad
  });

  it('orders models cheapest-first and handles a model label with a space', () => {
    const rows: BenchRunRow[] = [
      row({ model: 'Opus', cost: 3 }),
      row({ model: 'Sonnet 5', cost: 1 }), // label with a space must not break the key
      row({ model: 'Haiku', cost: 0.2 }),
    ];
    const { models, cells } = rollupBenchRows(rows);
    expect(models).toEqual(['Haiku', 'Sonnet 5', 'Opus']);
    // The spaced label produced its own distinct cell (not split apart).
    expect(cells.find((c) => c.model === 'Sonnet 5')?.runs).toBe(1);
  });

  it('sorts workflows alphabetically with (untagged) last; qualityScore null when unrated', () => {
    const rows: BenchRunRow[] = [
      row({ workflow: '(untagged)' }),
      row({ workflow: 'zeta' }),
      row({ workflow: 'alpha' }),
    ];
    const { workflows, cells } = rollupBenchRows(rows);
    expect(workflows).toEqual(['alpha', 'zeta', '(untagged)']);
    expect(cells.every((c) => c.qualityScore === null)).toBe(true); // no ratings given
  });
});
