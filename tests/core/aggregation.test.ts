import { describe, it, expect } from 'vitest';
import type { SessionReport, MassAggregation, FilePattern, FileInteractionPattern, ToolPattern } from '../../src/core/types.js';

// Helper to create a minimal session report for testing
function createSessionReport(overrides: Partial<SessionReport> = {}): SessionReport {
  return {
    sessionId: 'test-session-123',
    projectPath: 'test-project',
    startTimestamp: '2025-02-19T10:00:00Z',
    endTimestamp: '2025-02-19T11:00:00Z',
    duration: '1h 0m',
    totalTurns: 10,
    totalInputTokens: 5000,
    totalOutputTokens: 2000,
    totalCacheCreation: 1000,
    totalCacheRead: 500,
    totalContextTokens: 6000,
    peakContext: 80000,
    peakContextPercent: 40,
    modelWindow: 200000,
    estimatedCost: 0.25,
    segments: [],
    compactEvents: [],
    topConsumers: [],
    userRequestStats: [],
    toolStats: [],
    fileStats: [],
    toolSizeStats: [],
    ...overrides,
  };
}

describe('aggregation types', () => {
  describe('MassAggregation', () => {
    it('should define correct structure for empty aggregation', () => {
      const agg: MassAggregation = {
        startDate: '',
        endDate: '',
        totalSessions: 0,
        totalTurns: 0,
        projects: [],
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheCreation: 0,
        totalCacheRead: 0,
        totalCost: 0,
        filePatterns: [],
        fileInteractionPatterns: [],
        toolPatterns: [],
        aggregatedToolStats: [],
        insights: [],
        dailyTotals: [],
      };

      expect(agg.totalSessions).toBe(0);
      expect(agg.filePatterns).toEqual([]);
      expect(agg.fileInteractionPatterns).toEqual([]);
      expect(agg.insights).toEqual([]);
    });

    it('should define correct structure for populated aggregation', () => {
      const agg: MassAggregation = {
        startDate: '2025-02-01',
        endDate: '2025-02-19',
        totalSessions: 10,
        totalTurns: 150,
        projects: [
          { projectPath: 'project-a', sessionCount: 5, totalCost: 1.25, totalTokens: 50000 },
          { projectPath: 'project-b', sessionCount: 5, totalCost: 0.75, totalTokens: 30000 },
        ],
        totalInputTokens: 50000,
        totalOutputTokens: 20000,
        totalCacheCreation: 10000,
        totalCacheRead: 5000,
        totalCost: 2.00,
        filePatterns: [],
        fileInteractionPatterns: [],
        toolPatterns: [],
        aggregatedToolStats: [],
        insights: [],
        dailyTotals: [],
      };

      expect(agg.totalSessions).toBe(10);
      expect(agg.projects).toHaveLength(2);
      expect(agg.totalCost).toBe(2.00);
    });
  });

  describe('FilePattern', () => {
    it('should track file read patterns', () => {
      const pattern: FilePattern = {
        filePath: '/src/index.ts',
        readCount: 15,
        sessionCount: 8,
        totalSizeBytes: 45000,
        sessionPercent: 80,
        readRatioVsAverage: 3.5,
        projects: ['project-a'],
      };

      expect(pattern.readCount).toBe(15);
      expect(pattern.sessionPercent).toBe(80);
      expect(pattern.readRatioVsAverage).toBe(3.5);
    });
  });

  describe('FileInteractionPattern', () => {
    it('should track file interactions across all tools', () => {
      const pattern: FileInteractionPattern = {
        filePath: '/src/index.ts',
        readCount: 10,
        editCount: 5,
        writeCount: 2,
        totalInteractions: 17,
        sessionCount: 4,
        sessionPercent: 40,
        totalSizeBytes: 25000,
        projects: ['project-a'],
      };

      expect(pattern.readCount).toBe(10);
      expect(pattern.editCount).toBe(5);
      expect(pattern.writeCount).toBe(2);
      expect(pattern.totalInteractions).toBe(17);
      expect(pattern.sessionPercent).toBe(40);
    });

    it('should correctly calculate total interactions', () => {
      const read = 8;
      const edit = 12;
      const write = 3;
      const totalInteractions = read + edit + write;

      expect(totalInteractions).toBe(23);
    });
  });

  describe('ToolPattern', () => {
    it('should track tool usage patterns', () => {
      const pattern: ToolPattern = {
        toolName: 'Bash',
        totalCount: 50,
        sessionCount: 10,
        totalOutputBytes: 150000,
        averageOutputBytes: 3000,
      };

      expect(pattern.toolName).toBe('Bash');
      expect(pattern.totalCount).toBe(50);
      expect(pattern.averageOutputBytes).toBe(3000);
    });
  });

  describe('InsightPattern', () => {
    it('should define all insight types', () => {
      const types = ['frequent_file', 'test_churn', 'context_bloat', 'long_session', 'high_churn'] as const;
      const severities = ['info', 'notice', 'warning'] as const;

      for (const type of types) {
        for (const severity of severities) {
          const insight = {
            type,
            severity,
            description: 'Test description',
            affectedSessions: 5,
            details: { key: 'value' },
            recommendation: 'Test recommendation',
          };

          expect(insight.type).toBe(type);
          expect(insight.severity).toBe(severity);
        }
      }
    });
  });

  describe('DailyTotal', () => {
    it('should track daily aggregated totals', () => {
      const daily = {
        date: '2025-02-19',
        sessions: 3,
        inputTokens: 15000,
        outputTokens: 6000,
        cost: 0.75,
        peakContext: 120000,
      };

      expect(daily.date).toBe('2025-02-19');
      expect(daily.sessions).toBe(3);
      expect(daily.cost).toBe(0.75);
    });
  });
});

describe('session report aggregation helpers', () => {
  it('should calculate total cost from multiple reports', () => {
    const reports = [
      createSessionReport({ estimatedCost: 0.50 }),
      createSessionReport({ estimatedCost: 0.30 }),
      createSessionReport({ estimatedCost: 0.20 }),
    ];

    const totalCost = reports.reduce((sum, r) => sum + r.estimatedCost, 0);
    expect(totalCost).toBeCloseTo(1.00, 2);
  });

  it('should count unique projects', () => {
    const reports = [
      createSessionReport({ projectPath: 'project-a' }),
      createSessionReport({ projectPath: 'project-a' }),
      createSessionReport({ projectPath: 'project-b' }),
    ];

    const uniqueProjects = new Set(reports.map(r => r.projectPath));
    expect(uniqueProjects.size).toBe(2);
  });

  it('should find peak context across sessions', () => {
    const reports = [
      createSessionReport({ peakContext: 50000 }),
      createSessionReport({ peakContext: 120000 }),
      createSessionReport({ peakContext: 80000 }),
    ];

    const maxPeak = Math.max(...reports.map(r => r.peakContext));
    expect(maxPeak).toBe(120000);
  });

  it('should count sessions with high context (100K+)', () => {
    const reports = [
      createSessionReport({ peakContext: 50000 }),
      createSessionReport({ peakContext: 120000 }),
      createSessionReport({ peakContext: 150000 }),
      createSessionReport({ peakContext: 80000 }),
    ];

    const highContextSessions = reports.filter(r => r.peakContext >= 100000);
    expect(highContextSessions).toHaveLength(2);
  });

  it('should count long sessions (50+ turns)', () => {
    const reports = [
      createSessionReport({ totalTurns: 30 }),
      createSessionReport({ totalTurns: 75 }),
      createSessionReport({ totalTurns: 60 }),
      createSessionReport({ totalTurns: 25 }),
    ];

    const longSessions = reports.filter(r => r.totalTurns >= 50);
    expect(longSessions).toHaveLength(2);
  });

  it('should aggregate tool size stats across sessions', () => {
    const reports = [
      createSessionReport({
        toolSizeStats: [
          { toolName: 'Read', count: 5, totalSizeBytes: 25000, avgSizeBytes: 5000, files: [] },
          { toolName: 'Bash', count: 3, totalSizeBytes: 15000, avgSizeBytes: 5000, files: [] },
        ],
      }),
      createSessionReport({
        toolSizeStats: [
          { toolName: 'Read', count: 3, totalSizeBytes: 15000, avgSizeBytes: 5000, files: [] },
          { toolName: 'Edit', count: 2, totalSizeBytes: 5000, avgSizeBytes: 2500, files: [] },
        ],
      }),
    ];

    // Aggregate by tool name
    const toolTotals = new Map<string, { count: number; bytes: number }>();
    for (const report of reports) {
      for (const stat of report.toolSizeStats) {
        const existing = toolTotals.get(stat.toolName) || { count: 0, bytes: 0 };
        existing.count += stat.count;
        existing.bytes += stat.totalSizeBytes;
        toolTotals.set(stat.toolName, existing);
      }
    }

    expect(toolTotals.get('Read')?.count).toBe(8);
    expect(toolTotals.get('Read')?.bytes).toBe(40000);
    expect(toolTotals.get('Bash')?.count).toBe(3);
    expect(toolTotals.get('Edit')?.count).toBe(2);
  });

  it('should aggregate file interactions across Read, Edit, Write tools', () => {
    const reports = [
      createSessionReport({
        sessionId: 'session-1',
        toolSizeStats: [
          {
            toolName: 'Read',
            count: 3,
            totalSizeBytes: 15000,
            avgSizeBytes: 5000,
            files: [
              { path: 'file.ts', sizeBytes: 5000, count: 2 },
              { path: 'other.ts', sizeBytes: 5000, count: 1 },
            ],
          },
          {
            toolName: 'Edit',
            count: 2,
            totalSizeBytes: 2000,
            avgSizeBytes: 1000,
            files: [
              { path: 'file.ts', sizeBytes: 1000, count: 2 },
            ],
          },
        ],
      }),
      createSessionReport({
        sessionId: 'session-2',
        toolSizeStats: [
          {
            toolName: 'Read',
            count: 2,
            totalSizeBytes: 10000,
            avgSizeBytes: 5000,
            files: [
              { path: 'file.ts', sizeBytes: 5000, count: 1 },
            ],
          },
          {
            toolName: 'Write',
            count: 1,
            totalSizeBytes: 3000,
            avgSizeBytes: 3000,
            files: [
              { path: 'file.ts', sizeBytes: 3000, count: 1 },
            ],
          },
        ],
      }),
    ];

    // Aggregate file interactions
    const fileMap = new Map<string, { read: number; edit: number; write: number }>();
    for (const report of reports) {
      for (const stat of report.toolSizeStats) {
        if (!['Read', 'Edit', 'Write'].includes(stat.toolName)) continue;
        for (const file of stat.files) {
          const existing = fileMap.get(file.path) || { read: 0, edit: 0, write: 0 };
          if (stat.toolName === 'Read') existing.read += file.count;
          else if (stat.toolName === 'Edit') existing.edit += file.count;
          else if (stat.toolName === 'Write') existing.write += file.count;
          fileMap.set(file.path, existing);
        }
      }
    }

    const fileTs = fileMap.get('file.ts');
    expect(fileTs?.read).toBe(3);  // 2 from session-1, 1 from session-2
    expect(fileTs?.edit).toBe(2);  // 2 from session-1
    expect(fileTs?.write).toBe(1); // 1 from session-2
    expect(fileTs?.read + fileTs?.edit + fileTs?.write).toBe(6);
  });

  it('should calculate file session percentages correctly', () => {
    const totalSessions = 10;
    const fileSessionCount = 7;
    const sessionPercent = (fileSessionCount / totalSessions) * 100;

    expect(sessionPercent).toBe(70);
  });

  it('should calculate read ratio vs average', () => {
    const fileReads = [5, 15, 3, 8, 2, 12, 4, 6, 1, 9]; // 10 files
    const avgReads = fileReads.reduce((a, b) => a + b, 0) / fileReads.length; // 6.5

    const ratio = 15 / avgReads;
    expect(ratio).toBeCloseTo(2.31, 1);
  });

  it('should aggregate daily totals correctly', () => {
    const reports = [
      createSessionReport({
        startTimestamp: '2025-02-19T10:00:00Z',
        estimatedCost: 0.25,
        totalInputTokens: 5000,
        totalOutputTokens: 2000,
        peakContext: 80000,
      }),
      createSessionReport({
        startTimestamp: '2025-02-19T14:00:00Z',
        estimatedCost: 0.35,
        totalInputTokens: 7000,
        totalOutputTokens: 3000,
        peakContext: 100000,
      }),
      createSessionReport({
        startTimestamp: '2025-02-20T10:00:00Z',
        estimatedCost: 0.20,
        totalInputTokens: 4000,
        totalOutputTokens: 1500,
        peakContext: 60000,
      }),
    ];

    // Aggregate by date
    const dailyMap = new Map<string, { sessions: number; cost: number }>();
    for (const report of reports) {
      const date = report.startTimestamp.substring(0, 10);
      const existing = dailyMap.get(date) || { sessions: 0, cost: 0 };
      existing.sessions++;
      existing.cost += report.estimatedCost;
      dailyMap.set(date, existing);
    }

    const feb19 = dailyMap.get('2025-02-19');
    expect(feb19?.sessions).toBe(2);
    expect(feb19?.cost).toBeCloseTo(0.60, 2);

    const feb20 = dailyMap.get('2025-02-20');
    expect(feb20?.sessions).toBe(1);
    expect(feb20?.cost).toBeCloseTo(0.20, 2);
  });
});
