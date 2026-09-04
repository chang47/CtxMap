/**
 * Mass Aggregation Engine
 * Aggregates all sessions to find patterns, spot anomalies, and provide insights
 */

import type {
  SessionReport,
  Turn,
  MassAggregation,
  FilePattern,
  FileInteractionPattern,
  ToolPattern,
  AggregatedToolStats,
  InsightPattern,
  DailyTotal,
  ProjectSummary,
  AggregateOptions,
  ToolSizeStats,
} from './types.js';
import { listSessions, parseJsonlFile, parseTurns, getSessionMetadata, loadSubagentTurns } from './parser.js';
import { generateReport } from './attribution.js';

/**
 * Aggregate all sessions across all projects (or filter by project/date)
 */
export async function aggregateAllSessions(options: AggregateOptions = {}): Promise<MassAggregation> {
  const sessions = await listSessions();

  let filteredSessions = sessions;

  // Filter by project if specified (supports substring matching)
  if (options.projectPath) {
    const normalized = options.projectPath.replace(/[\\/:]/g, '-');
    const projectPath = options.projectPath;
    filteredSessions = sessions.filter(s =>
      s.projectPath === normalized ||
      s.projectPath === projectPath ||
      s.projectPath.includes(projectPath) ||
      s.projectPath.includes(normalized)
    );
  }

  // Filter by date if specified
  if (options.since) {
    const sinceDate = new Date(options.since);
    filteredSessions = filteredSessions.filter(s => s.timestamp >= sinceDate);
  }

  // Process each session
  const reports: SessionReport[] = [];
  for (const session of filteredSessions) {
    try {
      const entries = await parseJsonlFile(session.filePath);
      const turns = parseTurns(entries);
      if (turns.length > 0) {
        const metadata = getSessionMetadata(entries);
        const { turns: subagentTurns, count: subagentCount } = await loadSubagentTurns(session.filePath);
        const report = generateReport(metadata.sessionId, session.projectPath, turns, subagentTurns, subagentCount);
        reports.push(report);
      }
    } catch {
      // Skip unparseable sessions
    }
  }

  return buildMassAggregation(reports);
}

/**
 * Build mass aggregation from session reports
 */
function buildMassAggregation(reports: SessionReport[]): MassAggregation {
  if (reports.length === 0) {
    return {
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
  }

  // Sort reports by start timestamp
  const sortedReports = [...reports].sort((a, b) =>
    a.startTimestamp.localeCompare(b.startTimestamp)
  );

  // Calculate date range
  const startDate = sortedReports[0].startTimestamp.substring(0, 10);
  const endDate = sortedReports[sortedReports.length - 1].endTimestamp.substring(0, 10);

  // Aggregate projects
  const projectMap = new Map<string, { count: number; cost: number; tokens: number }>();
  for (const report of reports) {
    const existing = projectMap.get(report.projectPath) || { count: 0, cost: 0, tokens: 0 };
    existing.count++;
    existing.cost += report.estimatedCost;
    existing.tokens += report.totalContextTokens;
    projectMap.set(report.projectPath, existing);
  }

  const projects: ProjectSummary[] = Array.from(projectMap.entries())
    .map(([projectPath, stats]) => ({
      projectPath,
      sessionCount: stats.count,
      totalCost: stats.cost,
      totalTokens: stats.tokens,
    }))
    .sort((a, b) => b.sessionCount - a.sessionCount);

  // Calculate totals
  const totalTurns = reports.reduce((sum, r) => sum + r.totalTurns, 0);
  const totalInputTokens = reports.reduce((sum, r) => sum + r.totalInputTokens, 0);
  const totalOutputTokens = reports.reduce((sum, r) => sum + r.totalOutputTokens, 0);
  const totalCacheCreation = reports.reduce((sum, r) => sum + r.totalCacheCreation, 0);
  const totalCacheRead = reports.reduce((sum, r) => sum + r.totalCacheRead, 0);
  const totalCost = reports.reduce((sum, r) => sum + r.estimatedCost, 0);

  // Detect patterns
  const filePatterns = detectFilePatterns(reports);
  const fileInteractionPatterns = detectFileInteractions(reports);
  const toolPatterns = detectToolPatterns(reports);
  const aggregatedToolStats = buildAggregatedToolStats(reports);
  const insights = detectInsights(reports, filePatterns, toolPatterns, fileInteractionPatterns);
  const dailyTotals = aggregateDailyTotals(reports);

  return {
    startDate,
    endDate,
    totalSessions: reports.length,
    totalTurns,
    projects,
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreation,
    totalCacheRead,
    totalCost,
    filePatterns,
    fileInteractionPatterns,
    toolPatterns,
    aggregatedToolStats,
    insights,
    dailyTotals,
  };
}

/**
 * Detect file patterns across sessions
 */
function detectFilePatterns(reports: SessionReport[]): FilePattern[] {
  // Track each file across all sessions
  const fileMap = new Map<string, {
    readCount: number;
    sessions: Set<string>;
    totalSizeBytes: number;
    projects: Set<string>;
  }>();

  for (const report of reports) {
    const readStats = report.toolSizeStats.find(s => s.toolName === 'Read');
    if (!readStats) continue;

    for (const file of readStats.files) {
      const existing = fileMap.get(file.path);
      if (existing) {
        existing.readCount += file.count;
        existing.sessions.add(report.sessionId);
        existing.totalSizeBytes += file.sizeBytes;
        existing.projects.add(report.projectPath);
      } else {
        fileMap.set(file.path, {
          readCount: file.count,
          sessions: new Set([report.sessionId]),
          totalSizeBytes: file.sizeBytes,
          projects: new Set([report.projectPath]),
        });
      }
    }
  }

  // Calculate average reads per file
  const totalReads = Array.from(fileMap.values()).reduce((sum, f) => sum + f.readCount, 0);
  const avgReads = fileMap.size > 0 ? totalReads / fileMap.size : 1;

  const totalSessions = reports.length;

  // Convert to FilePattern array
  const patterns: FilePattern[] = [];
  for (const [filePath, data] of fileMap) {
    patterns.push({
      filePath,
      readCount: data.readCount,
      sessionCount: data.sessions.size,
      totalSizeBytes: data.totalSizeBytes,
      sessionPercent: (data.sessions.size / totalSessions) * 100,
      readRatioVsAverage: avgReads > 0 ? data.readCount / avgReads : 0,
      projects: Array.from(data.projects),
    });
  }

  // Sort by read count descending
  return patterns.sort((a, b) => b.readCount - a.readCount);
}

/**
 * Detect file interaction patterns across all tools (Read, Edit, Write)
 */
function detectFileInteractions(reports: SessionReport[]): FileInteractionPattern[] {
  const totalSessions = reports.length;
  const fileMap = new Map<string, {
    readCount: number;
    editCount: number;
    writeCount: number;
    sessions: Set<string>;
    totalSizeBytes: number;
    projects: Set<string>;
  }>();

  for (const report of reports) {
    // Process each tool type
    for (const stat of report.toolSizeStats) {
      const toolName = stat.toolName;

      // Only process file-based tools
      if (!['Read', 'Edit', 'Write'].includes(toolName)) continue;

      for (const file of stat.files) {
        const existing = fileMap.get(file.path);
        if (existing) {
          if (toolName === 'Read') existing.readCount += file.count;
          else if (toolName === 'Edit') existing.editCount += file.count;
          else if (toolName === 'Write') existing.writeCount += file.count;
          existing.sessions.add(report.sessionId);
          existing.totalSizeBytes += file.sizeBytes;
          existing.projects.add(report.projectPath);
        } else {
          fileMap.set(file.path, {
            readCount: toolName === 'Read' ? file.count : 0,
            editCount: toolName === 'Edit' ? file.count : 0,
            writeCount: toolName === 'Write' ? file.count : 0,
            sessions: new Set([report.sessionId]),
            totalSizeBytes: file.sizeBytes,
            projects: new Set([report.projectPath]),
          });
        }
      }
    }
  }

  // Convert to FileInteractionPattern array
  const patterns: FileInteractionPattern[] = [];
  for (const [filePath, data] of fileMap) {
    const totalInteractions = data.readCount + data.editCount + data.writeCount;
    patterns.push({
      filePath,
      readCount: data.readCount,
      editCount: data.editCount,
      writeCount: data.writeCount,
      totalInteractions,
      sessionCount: data.sessions.size,
      sessionPercent: totalSessions > 0 ? (data.sessions.size / totalSessions) * 100 : 0,
      totalSizeBytes: data.totalSizeBytes,
      projects: Array.from(data.projects),
    });
  }

  // Sort by total interactions descending
  return patterns.sort((a, b) => b.totalInteractions - a.totalInteractions);
}

/**
 * Detect tool patterns across sessions
 * Aggregates both token-based stats (from toolStats) and size-based stats (from toolSizeStats)
 */
function detectToolPatterns(reports: SessionReport[]): ToolPattern[] {
  const totalSessions = reports.length;

  const toolMap = new Map<string, {
    // Counts
    totalCount: number;
    sessions: Set<string>;

    // Size-based (from toolSizeStats)
    totalOutputBytes: number;

    // Token-based (from toolStats)
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheCreation: number;
    totalCacheRead: number;
    totalContextTokens: number;

    // Per-tool file breakdown
    files: Map<string, { count: number; totalSizeBytes: number; sessions: Set<string> }>;
  }>();

  for (const report of reports) {
    // Aggregate from toolSizeStats (size-based + files)
    for (const stat of report.toolSizeStats) {
      let existing = toolMap.get(stat.toolName);
      if (!existing) {
        existing = {
          totalCount: 0,
          sessions: new Set(),
          totalOutputBytes: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCacheCreation: 0,
          totalCacheRead: 0,
          totalContextTokens: 0,
          files: new Map(),
        };
        toolMap.set(stat.toolName, existing);
      }

      existing.totalCount += stat.count;
      existing.sessions.add(report.sessionId);
      existing.totalOutputBytes += stat.totalSizeBytes;

      // Aggregate files
      for (const file of stat.files) {
        const fileEntry = existing.files.get(file.path);
        if (fileEntry) {
          fileEntry.count += file.count;
          fileEntry.totalSizeBytes += file.sizeBytes;
          fileEntry.sessions.add(report.sessionId);
        } else {
          existing.files.set(file.path, {
            count: file.count,
            totalSizeBytes: file.sizeBytes,
            sessions: new Set([report.sessionId]),
          });
        }
      }
    }

    // Aggregate from toolStats (token-based)
    for (const stat of report.toolStats) {
      let existing = toolMap.get(stat.toolName);
      if (!existing) {
        existing = {
          totalCount: 0,
          sessions: new Set(),
          totalOutputBytes: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCacheCreation: 0,
          totalCacheRead: 0,
          totalContextTokens: 0,
          files: new Map(),
        };
        toolMap.set(stat.toolName, existing);
      }

      existing.totalInputTokens += stat.totalInputTokens;
      existing.totalOutputTokens += stat.totalOutputTokens;
      existing.totalCacheCreation += stat.totalCacheCreation;
      existing.totalCacheRead += stat.totalCacheRead;
      existing.totalContextTokens += stat.totalContextTokens;
    }
  }

  const patterns: ToolPattern[] = [];
  for (const [toolName, data] of toolMap) {
    // Convert files map to array, sorted by count descending
    const files = Array.from(data.files.entries())
      .map(([path, fileData]) => ({
        path,
        count: fileData.count,
        totalSizeBytes: fileData.totalSizeBytes,
        sessionCount: fileData.sessions.size,
      }))
      .sort((a, b) => b.count - a.count);

    patterns.push({
      toolName,
      totalCount: data.totalCount,
      sessionCount: data.sessions.size,
      totalOutputBytes: data.totalOutputBytes,
      averageOutputBytes: data.totalCount > 0 ? Math.round(data.totalOutputBytes / data.totalCount) : 0,
      totalInputTokens: data.totalInputTokens,
      totalOutputTokens: data.totalOutputTokens,
      totalCacheCreation: data.totalCacheCreation,
      totalCacheRead: data.totalCacheRead,
      totalContextTokens: data.totalContextTokens,
      files,
      sessionPercent: totalSessions > 0 ? (data.sessions.size / totalSessions) * 100 : 0,
    });
  }

  return patterns.sort((a, b) => b.totalCount - a.totalCount);
}

/**
 * Build aggregated tool stats for summary view (sorted by context tokens)
 */
function buildAggregatedToolStats(reports: SessionReport[]): AggregatedToolStats[] {
  const totalSessions = reports.length;
  const toolMap = new Map<string, {
    totalCount: number;
    sessions: Set<string>;
    totalContextTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheCreation: number;
    totalCacheRead: number;
    totalOutputBytes: number;
  }>();

  // Aggregate from toolStats for token-based stats
  for (const report of reports) {
    for (const stat of report.toolStats) {
      let existing = toolMap.get(stat.toolName);
      if (!existing) {
        existing = {
          totalCount: 0,
          sessions: new Set(),
          totalContextTokens: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCacheCreation: 0,
          totalCacheRead: 0,
          totalOutputBytes: 0,
        };
        toolMap.set(stat.toolName, existing);
      }

      existing.totalCount += stat.count;
      existing.sessions.add(report.sessionId);
      existing.totalContextTokens += stat.totalContextTokens;
      existing.totalInputTokens += stat.totalInputTokens;
      existing.totalOutputTokens += stat.totalOutputTokens;
      existing.totalCacheCreation += stat.totalCacheCreation;
      existing.totalCacheRead += stat.totalCacheRead;
    }

    // Also get size from toolSizeStats
    for (const stat of report.toolSizeStats) {
      const existing = toolMap.get(stat.toolName);
      if (existing) {
        existing.totalOutputBytes += stat.totalSizeBytes;
      }
    }
  }

  const stats: AggregatedToolStats[] = [];
  for (const [toolName, data] of toolMap) {
    stats.push({
      toolName,
      totalCount: data.totalCount,
      sessionCount: data.sessions.size,
      totalContextTokens: data.totalContextTokens,
      totalInputTokens: data.totalInputTokens,
      totalOutputTokens: data.totalOutputTokens,
      totalCacheCreation: data.totalCacheCreation,
      totalCacheRead: data.totalCacheRead,
      totalOutputBytes: data.totalOutputBytes,
      sessionPercent: totalSessions > 0 ? (data.sessions.size / totalSessions) * 100 : 0,
    });
  }

  // Sort by context tokens descending
  return stats.sort((a, b) => b.totalContextTokens - a.totalContextTokens);
}

/**
 * Detect insight patterns
 */
function detectInsights(
  reports: SessionReport[],
  filePatterns: FilePattern[],
  toolPatterns: ToolPattern[],
  fileInteractionPatterns: FileInteractionPattern[]
): InsightPattern[] {
  const insights: InsightPattern[] = [];

  // 1. Frequent files (read in 50%+ of sessions or 3x average)
  insights.push(...detectFrequentFiles(filePatterns, reports.length));

  // 2. Test churn
  insights.push(...detectTestChurn(toolPatterns, reports.length));

  // 3. Context bloat
  insights.push(...detectContextBloat(reports));

  // 4. Long sessions
  insights.push(...detectLongSessions(reports));

  // 5. High churn files (files edited 5+ times across sessions)
  insights.push(...detectHighChurn(fileInteractionPatterns));

  // Sort by severity
  const severityOrder = { warning: 0, notice: 1, info: 2 };
  return insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

/**
 * Detect frequently read files
 */
function detectFrequentFiles(filePatterns: FilePattern[], totalSessions: number): InsightPattern[] {
  const insights: InsightPattern[] = [];

  // Files that appear in 50%+ of sessions
  const ubiquitousFiles = filePatterns.filter(f => f.sessionPercent >= 50);
  for (const file of ubiquitousFiles.slice(0, 3)) {
    insights.push({
      type: 'frequent_file',
      severity: 'notice',
      description: `${shortenPath(file.filePath)} appears in ${file.sessionPercent.toFixed(0)}% of your sessions`,
      affectedSessions: file.sessionCount,
      details: { filePath: file.filePath, readCount: file.readCount },
      recommendation: 'Consider adding to CLAUDE.md for persistent context',
    });
  }

  // Files read 3x more than average
  const heavyFiles = filePatterns.filter(f => f.readRatioVsAverage >= 3 && f.sessionPercent < 50);
  for (const file of heavyFiles.slice(0, 2)) {
    insights.push({
      type: 'frequent_file',
      severity: 'info',
      description: `${shortenPath(file.filePath)} is read ${file.readRatioVsAverage.toFixed(1)}x more than average`,
      affectedSessions: file.sessionCount,
      details: { filePath: file.filePath, readCount: file.readCount },
      recommendation: 'Review if this file needs to be read so often',
    });
  }

  return insights;
}

/**
 * Detect test output churn patterns
 */
function detectTestChurn(toolPatterns: ToolPattern[], totalSessions: number): InsightPattern[] {
  const insights: InsightPattern[] = [];

  // Find Bash commands (likely tests)
  const bashPattern = toolPatterns.find(p => p.toolName === 'Bash');
  if (!bashPattern) return insights;

  // Check if output is significant
  const totalMB = bashPattern.totalOutputBytes / (1024 * 1024);
  if (totalMB >= 0.5 && bashPattern.totalCount >= 10) {
    insights.push({
      type: 'test_churn',
      severity: totalMB >= 2 ? 'notice' : 'info',
      description: `Bash commands executed ${bashPattern.totalCount} times, outputting ${totalMB.toFixed(1)}MB total`,
      affectedSessions: bashPattern.sessionCount,
      details: { count: bashPattern.totalCount, totalBytes: bashPattern.totalOutputBytes },
      recommendation: 'Consider --reporter=basic for tests to reduce output size',
    });
  }

  return insights;
}

/**
 * Detect context bloat patterns
 */
function detectContextBloat(reports: SessionReport[]): InsightPattern[] {
  const insights: InsightPattern[] = [];

  // Sessions that hit 100K+ context
  const highContextSessions = reports.filter(r => r.peakContext >= 100_000);
  if (highContextSessions.length >= 3) {
    insights.push({
      type: 'context_bloat',
      severity: highContextSessions.length >= 10 ? 'warning' : 'notice',
      description: `${highContextSessions.length} sessions reached 100K+ context window`,
      affectedSessions: highContextSessions.length,
      details: { sessions: highContextSessions.map(s => s.sessionId.substring(0, 8)) },
      recommendation: 'Consider breaking large tasks into smaller sessions',
    });
  }

  return insights;
}

/**
 * Detect long sessions
 */
function detectLongSessions(reports: SessionReport[]): InsightPattern[] {
  const insights: InsightPattern[] = [];

  // Sessions with 50+ turns
  const longSessions = reports.filter(r => r.totalTurns >= 50);
  if (longSessions.length >= 2) {
    insights.push({
      type: 'long_session',
      severity: longSessions.length >= 5 ? 'notice' : 'info',
      description: `${longSessions.length} sessions had 50+ turns`,
      affectedSessions: longSessions.length,
      details: { sessions: longSessions.map(s => ({ id: s.sessionId.substring(0, 8), turns: s.totalTurns })) },
      recommendation: 'Consider starting fresh sessions for new tasks',
    });
  }

  return insights;
}

/**
 * Detect high churn files (files edited 5+ times across sessions)
 */
function detectHighChurn(fileInteractionPatterns: FileInteractionPattern[]): InsightPattern[] {
  const insights: InsightPattern[] = [];

  // Files edited 5+ times across sessions
  const highChurnFiles = fileInteractionPatterns.filter(f => f.editCount >= 5);
  if (highChurnFiles.length >= 3) {
    insights.push({
      type: 'high_churn',
      severity: 'info',
      description: `${highChurnFiles.length} files edited 5+ times across sessions`,
      affectedSessions: highChurnFiles.reduce((sum, f) => sum + f.sessionCount, 0),
      details: { files: highChurnFiles.slice(0, 3).map(f => f.filePath) },
      recommendation: 'Consider if these files need refactoring or better tooling',
    });
  }

  return insights;
}

/**
 * Aggregate daily totals
 */
function aggregateDailyTotals(reports: SessionReport[]): DailyTotal[] {
  const dailyMap = new Map<string, {
    sessions: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    peakContext: number;
  }>();

  for (const report of reports) {
    // Use start date for aggregation
    const date = report.startTimestamp.substring(0, 10);
    const existing = dailyMap.get(date) || {
      sessions: 0,
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      peakContext: 0,
    };

    existing.sessions++;
    existing.inputTokens += report.totalInputTokens;
    existing.outputTokens += report.totalOutputTokens;
    existing.cost += report.estimatedCost;
    existing.peakContext = Math.max(existing.peakContext, report.peakContext);

    dailyMap.set(date, existing);
  }

  // Convert to array and sort by date
  return Array.from(dailyMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Shorten a file path for display
 */
function shortenPath(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  if (parts.length <= 2) return filePath;
  return parts.slice(-2).join('/');
}
