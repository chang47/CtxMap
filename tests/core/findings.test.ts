import { describe, it, expect } from 'vitest';
import { computeFindings } from '../../src/core/findings.js';
import type { Turn, FileStats, ToolSizeStats, ModelPricing } from '../../src/core/types.js';

const PRICING: ModelPricing = { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 };

function turn(overrides: Partial<Turn> = {}): Turn {
  return {
    turnIndex: 0,
    timestamp: '2026-09-01T00:00:00Z',
    toolCall: null,
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    contextTokens: 100_000,
    tokenDelta: 0,
    outputTokens: 0,
    ...overrides,
  };
}

const empty = { turns: [] as Turn[], fileStats: [] as FileStats[], toolSizeStats: [] as ToolSizeStats[], pricing: PRICING };

describe('computeFindings', () => {
  it('flags an oversized single tool output as high severity', () => {
    const toolSizeStats: ToolSizeStats[] = [
      { toolName: 'Bash', count: 1, totalSizeBytes: 200_000, avgSizeBytes: 200_000,
        files: [{ path: 'git worktree remove', sizeBytes: 200_000, count: 1 }] },
    ];
    const f = computeFindings({ ...empty, toolSizeStats });
    const o = f.find((x) => x.rule === 'oversized-output');
    expect(o).toBeTruthy();
    expect(o!.severity).toBe('high'); // >= 150KB
    expect(o!.fix).toMatch(/head|tail|grep/i);
  });

  it('flags a repeatedly-read file (hot-file) and estimates redundant reloads', () => {
    const fileStats: FileStats[] = [
      { filePath: '/a/log.md', toolName: 'Read', count: 5, totalTokens: 15000, avgTokens: 3000 },
    ];
    const f = computeFindings({ ...empty, fileStats });
    const r = f.find((x) => x.rule === 'hot-file');
    expect(r).toBeTruthy();
    expect(r!.wastedTokens).toBe(12000); // (5-1) * 3000
    expect(r!.title).toContain('5×');
    expect(r!.title).toContain('5R/0E/0W');
  });

  it('flags heavy edit/write churn on one file (no false token claim)', () => {
    const fileStats: FileStats[] = [
      { filePath: '/a/log.md', toolName: 'Edit', count: 40, totalTokens: 20000, avgTokens: 500 },
    ];
    const f = computeFindings({ ...empty, fileStats });
    const r = f.find((x) => x.rule === 'hot-file');
    expect(r).toBeTruthy();
    expect(r!.title).toContain('0R/40E/0W');
    expect(r!.wastedTokens).toBeUndefined(); // churn is not claimed as waste
  });

  it('does NOT flag a file read only twice, a tiny file, or a lightly-edited file', () => {
    const fileStats: FileStats[] = [
      { filePath: '/a/x.md', toolName: 'Read', count: 2, totalTokens: 8000, avgTokens: 4000 }, // < 3 reads
      { filePath: '/a/y.md', toolName: 'Read', count: 9, totalTokens: 900, avgTokens: 100 },   // tiny
      { filePath: '/a/z.md', toolName: 'Edit', count: 5, totalTokens: 2000, avgTokens: 400 },  // < churn threshold
    ];
    const f = computeFindings({ ...empty, fileStats });
    expect(f.some((x) => x.rule === 'hot-file')).toBe(false);
  });

  it('collapses recurring cache re-creation into a single finding (not one per turn)', () => {
    // Alternate: high cache_read turn, then a turn that re-creates a big prefix
    // with cache_read collapsing — 3 such events, no compaction (context steady).
    const turns: Turn[] = [];
    for (let i = 0; i < 8; i++) {
      const recreate = i >= 2 && i % 2 === 0;
      turns.push(turn({
        turnIndex: i,
        contextTokens: 500_000, // steady: no compaction
        usage: recreate
          ? { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 100_000, cache_read_input_tokens: 1_000 }
          : { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 400_000 },
      }));
    }
    const f = computeFindings({ ...empty, turns });
    const cache = f.filter((x) => x.rule === 'cache-recreation');
    expect(cache).toHaveLength(1); // ONE finding, not one per event
    expect(cache[0].wastedTokens).toBeGreaterThan(0);
  });

  it('ranks high severity before low and returns [] on empty input', () => {
    expect(computeFindings(empty)).toEqual([]);
    const toolSizeStats: ToolSizeStats[] = [
      { toolName: 'Read', count: 1, totalSizeBytes: 200_000, avgSizeBytes: 200_000,
        files: [{ path: '/big', sizeBytes: 200_000, count: 1 }] }, // high oversized
    ];
    const fileStats: FileStats[] = [
      { filePath: '/a/log.md', toolName: 'Read', count: 4, totalTokens: 8000, avgTokens: 2000 }, // medium hot-file
    ];
    const f = computeFindings({ ...empty, toolSizeStats, fileStats });
    expect(f[0].severity).toBe('high');
  });
});
