/**
 * CLI Formatters
 * Rich terminal output for session reports
 */

import type {
  SessionReport,
  SessionSegment,
  TopConsumer,
  UserRequestStats,
  ToolStats,
  ToolSizeStats,
  FileStats,
  CompactEvent,
  MassAggregation,
  InsightPattern,
  FileInteractionPattern,
} from '../core/types.js';

const PERFORMANCE_ZONES = {
  optimal: 10_000,
  moderate: 50_000,
  degraded: 100_000,
  critical: 150_000,
};

/**
 * Format a number with thousands separators
 */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format tokens with K suffix for large numbers
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return n.toString();
}

/**
 * Format currency
 */
export function formatCurrency(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

/**
 * Format percentage
 */
export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

/**
 * Get performance zone indicator
 */
function getPerformanceIndicator(contextTokens: number): string {
  if (contextTokens <= PERFORMANCE_ZONES.optimal) {
    return ''; // Optimal - no warning
  } else if (contextTokens <= PERFORMANCE_ZONES.moderate) {
    return '⚡'; // Moderate
  } else if (contextTokens <= PERFORMANCE_ZONES.degraded) {
    return '⚠️'; // Some degradation
  } else {
    return '🔴'; // Significant degradation
  }
}

/**
 * Get performance zone description
 */
function getPerformanceZone(contextTokens: number): string {
  if (contextTokens <= PERFORMANCE_ZONES.optimal) {
    return 'optimal';
  } else if (contextTokens <= PERFORMANCE_ZONES.moderate) {
    return 'moderate';
  } else if (contextTokens <= PERFORMANCE_ZONES.degraded) {
    return 'degraded';
  } else if (contextTokens <= PERFORMANCE_ZONES.critical) {
    return 'significant degradation';
  } else {
    return 'critical';
  }
}

/**
 * Create a simple ASCII bar
 */
function createBar(percent: number, width: number = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Format a session report for terminal output
 */
export function formatReport(report: SessionReport): string {
  const lines: string[] = [];
  const width = 62;

  // Header
  lines.push('╭' + '─'.repeat(width - 2) + '╮');
  lines.push(formatLine('│ CtxMap - Session Token Analysis', width));
  lines.push(
    formatLine(
      `│ Session: ${report.sessionId.substring(0, 8)}... | Duration: ${report.duration} | Total: ${formatTokens(report.peakContext)} tokens`,
      width
    )
  );
  lines.push('├' + '─'.repeat(width - 2) + '┤');

  // Segments
  for (let i = 0; i < report.segments.length; i++) {
    const segment = report.segments[i];
    lines.push(formatSegment(segment, i + 1, width));

    // Show compact event if exists
    if (i < report.compactEvents.length) {
      const compact = report.compactEvents[i];
      lines.push('├' + '─'.repeat(width - 2) + '┤');
      lines.push(
        formatLine(
          `│ ⚡ COMPACT at Turn ${compact.turnIndex} (context dropped from ${formatTokens(compact.beforeTokens)} → ${formatTokens(compact.afterTokens)})`,
          width
        )
      );
      lines.push('├' + '─'.repeat(width - 2) + '┤');
    }
  }

  // Top user requests (replaces misleading "TOP TOKEN CONSUMERS")
  lines.push(formatLine('│ TOP USER REQUESTS (by token consumption)', width));
  lines.push('├' + '─'.repeat(width - 2) + '┤');

  if (report.userRequestStats && report.userRequestStats.length > 0) {
    // Table header
    lines.push(formatLine('│ Request                       │ Turns │ Tokens  │ Tools', width));
    lines.push('├' + '─'.repeat(width - 2) + '┤');

    for (const req of report.userRequestStats.slice(0, 8)) {
      // Truncate prompt for display
      const prompt = req.userPrompt.length > 28
        ? req.userPrompt.substring(0, 25) + '...'
        : req.userPrompt;
      const promptCol = prompt.padEnd(28).substring(0, 28);
      const turns = String(req.turnCount).padStart(5);
      const tokens = formatTokens(req.totalTokens).padStart(8);
      const tools = String(req.toolCount).padStart(5);
      lines.push(formatLine(`│ ${promptCol} │ ${turns} │ ${tokens} │ ${tools}`, width));
    }
  } else if (report.topConsumers.length > 0) {
    // Fallback to old format if userRequestStats not available
    lines.push(formatLine('│ Action                 │ Tokens  │ Cumulative', width));
    lines.push('├' + '─'.repeat(width - 2) + '┤');

    for (const consumer of report.topConsumers.slice(0, 8)) {
      const desc = consumer.description.padEnd(22).substring(0, 22);
      const tokens = `+${formatTokens(consumer.tokens)}`.padStart(7);
      const cum = formatTokens(consumer.cumulative).padStart(10);
      lines.push(formatLine(`│ ${desc} │ ${tokens} │ ${cum}`, width));
    }
  }

  // By tool type
  lines.push('├' + '─'.repeat(width - 2) + '┤');
  lines.push(formatLine('│ BY TOOL TYPE (Full Session)', width));
  lines.push('├' + '─'.repeat(width - 2) + '┤');

  if (report.toolStats.length > 0) {
    lines.push(formatLine('│ Tool           │ Count │ Tokens    │ % Total', width));
    lines.push('├' + '─'.repeat(width - 2) + '┤');

    for (const stat of report.toolStats) {
      const tool = stat.toolName.padEnd(14).substring(0, 14);
      const count = formatNumber(stat.count).padStart(5);
      const tokens = formatTokens(stat.totalContextTokens).padStart(9);
      const pct = formatPercent(stat.percentOfSession).padStart(7);
      lines.push(formatLine(`│ ${tool} │ ${count} │ ${tokens} │ ${pct}`, width));
    }
  }

  // By tool type (file size) - shows actual content fed into context
  lines.push('├' + '─'.repeat(width - 2) + '┤');
  lines.push(formatLine('│ BY TOOL TYPE (File Size)', width));
  lines.push('├' + '─'.repeat(width - 2) + '┤');

  if (report.toolSizeStats && report.toolSizeStats.length > 0) {
    for (const stat of report.toolSizeStats.slice(0, 4)) {
      // Tool header with total stats
      const fileCount = `${stat.files.length} file${stat.files.length !== 1 ? 's' : ''}`;
      const totalSize = formatKB(stat.totalSizeBytes);
      lines.push(formatLine(`│ ${stat.toolName} (${fileCount}, ${totalSize} total)`, width));

      // Show top 5 files per tool
      const topFiles = stat.files.slice(0, 5);
      for (const file of topFiles) {
        const pathParts = file.path.split(/[/\\]/);
        const shortPath = pathParts.slice(-2).join('/');
        const path = shortPath.substring(0, 32);
        const size = formatKB(file.sizeBytes).padStart(9);
        const count = file.count > 1 ? ` (${file.count}x)` : '';
        lines.push(formatLine(`│   ${path.padEnd(34)} ${size}${count}`, width));
      }

      // Show "+N more" indicator if there are more files
      const remaining = stat.files.length - topFiles.length;
      if (remaining > 0) {
        lines.push(formatLine(`│   ... (+${remaining} more)`, width));
      }

      lines.push('├' + '─'.repeat(width - 2) + '┤');
    }
  }

  // Summary
  lines.push('├' + '─'.repeat(width - 2) + '┤');
  lines.push(formatLine('│ SESSION SUMMARY', width));
  lines.push('├' + '─'.repeat(width - 2) + '┤');

  const peakIndicator = getPerformanceIndicator(report.peakContext);
  lines.push(
    formatLine(
      `│ Peak Context: ${formatTokens(report.peakContext)} (${formatPercent(report.peakContextPercent)}) ${peakIndicator}`,
      width
    )
  );

  if (report.peakContext > PERFORMANCE_ZONES.optimal) {
    lines.push(
      formatLine(
        `│ ⚠️  Performance zone: ${getPerformanceZone(report.peakContext)} (optimal <10K)`,
        width
      )
    );
  }

  lines.push(
    formatLine(
      `│ Total Input: ${formatTokens(report.totalInputTokens)} | Output: ${formatTokens(report.totalOutputTokens)}${report.totalThinkingTokens > 0 ? ` (${formatTokens(report.totalThinkingTokens)} thinking)` : ''}`,
      width
    )
  );

  if (report.totalCacheCreation > 0 || report.totalCacheRead > 0) {
    lines.push(
      formatLine(
        `│ Cache: ${formatTokens(report.totalCacheCreation)} created | ${formatTokens(report.totalCacheRead)} read`,
        width
      )
    );
  }

  const rateLabel = report.primaryModel ? `${report.primaryModel} rates` : 'per-model rates';
  lines.push(formatLine(`│ ESTIMATED COST: ${formatCurrency(report.estimatedCost)} (${rateLabel})`, width));
  if (report.subagentCount && report.subagentCount > 0) {
    lines.push(
      formatLine(
        `│   ├─ main thread: ${formatCurrency(report.mainThreadCost ?? report.estimatedCost)}`,
        width
      )
    );
    lines.push(
      formatLine(
        `│   └─ ${report.subagentCount} subagent${report.subagentCount === 1 ? '' : 's'} (${report.subagentTurns ?? 0} turns): ${formatCurrency(report.subagentCost ?? 0)}`,
        width
      )
    );
  }

  // Footer
  lines.push('╰' + '─'.repeat(width - 2) + '╯');

  // What to fix — the actionable findings (the differentiator)
  if (report.findings && report.findings.length > 0) {
    lines.push('');
    lines.push(`WHAT TO FIX — ${report.findings.length} finding${report.findings.length === 1 ? '' : 's'}`);
    const sevMark: Record<string, string> = { high: '🔴', medium: '🟡', low: '⚪' };
    for (const f of report.findings.slice(0, 8)) {
      const cost = f.wastedUsd
        ? `  ~${formatCurrency(f.wastedUsd)}`
        : f.wastedTokens
          ? `  ~${formatTokens(f.wastedTokens)} tok`
          : '';
      lines.push(`  ${sevMark[f.severity] ?? '•'} ${f.title}${cost}`);
      lines.push(`     fix: ${f.fix}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a segment section
 */
function formatSegment(segment: SessionSegment, index: number, width: number): string {
  const lines: string[] = [];

  lines.push(
    formatLine(
      `│ SEGMENT ${index}: ${segment.label} (Turns ${segment.startTurn + 1}-${segment.endTurn + 1})`,
      width
    )
  );

  const indicator = getPerformanceIndicator(segment.peakContext);
  lines.push(
    formatLine(
      `│ Peak context: ${formatTokens(segment.peakContext)} (${formatPercent(segment.peakContextPercent)}) | Duration: ${segment.duration} ${indicator}`,
      width
    )
  );

  if (segment.peakContext > PERFORMANCE_ZONES.optimal) {
    lines.push(
      formatLine(`│ ⚠️  Performance degradation zone (optimal <10K)`, width)
    );
  }

  return lines.join('\n');
}

/**
 * Format a line to exact width with padding
 */
function formatLine(text: string, width: number): string {
  const contentWidth = width - 2; // Account for │ and closing space
  if (text.length >= contentWidth) {
    return text.substring(0, width - 1) + '│';
  }
  return text + ' '.repeat(width - 1 - text.length) + '│';
}

/**
 * Format a list of sessions
 */
export function formatSessionList(
  sessions: Array<{ sessionId: string; projectPath: string; timestamp: Date }>
): string {
  const lines: string[] = [];

  lines.push('Available Sessions:');
  lines.push('─'.repeat(80));
  lines.push(
    'Session ID'.padEnd(12) +
    ' | ' +
    'Project'.padEnd(30) +
    ' | ' +
    'Last Modified'
  );
  lines.push('─'.repeat(80));

  for (const session of sessions.slice(0, 20)) {
    const id = session.sessionId.substring(0, 8).padEnd(12);
    const project = session.projectPath.substring(0, 28).padEnd(30);
    const time = session.timestamp.toLocaleString();
    lines.push(`${id} | ${project} | ${time}`);
  }

  if (sessions.length > 20) {
    lines.push(`... and ${sessions.length - 20} more sessions`);
  }

  return lines.join('\n');
}

/**
 * Format comparison between sessions
 */
export function formatComparison(reports: SessionReport[]): string {
  const lines: string[] = [];
  const width = 80;

  lines.push('╭' + '─'.repeat(width - 2) + '╮');
  lines.push(formatLine('│ CtxMap - Session Comparison', width));
  lines.push('├' + '─'.repeat(width - 2) + '┤');

  // Header row
  const headers = 'Session'.padEnd(12) +
    ' | ' + 'Turns'.padStart(5) +
    ' | ' + 'Peak Ctx'.padStart(10) +
    ' | ' + 'Cost'.padStart(8) +
    ' | ' + 'Compacts';
  lines.push(formatLine('│ ' + headers, width));
  lines.push('├' + '─'.repeat(width - 2) + '┤');

  for (const report of reports) {
    const id = report.sessionId.substring(0, 8).padEnd(12);
    const turns = formatNumber(report.totalTurns).padStart(5);
    const peak = formatTokens(report.peakContext).padStart(10);
    const cost = formatCurrency(report.estimatedCost).padStart(8);
    const compacts = report.compactEvents.length.toString();

    lines.push(formatLine(`│ ${id} | ${turns} | ${peak} | ${cost} | ${compacts}`, width));
  }

  lines.push('╰' + '─'.repeat(width - 2) + '╯');

  return lines.join('\n');
}

/**
 * Format JSON output
 */
export function formatJson(report: SessionReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Format Markdown output
 */
export function formatMarkdown(report: SessionReport): string {
  const lines: string[] = [];

  lines.push(`# CtxMap Session Analysis`);
  lines.push('');
  lines.push(`**Session:** \`${report.sessionId.substring(0, 8)}...\``);
  lines.push(`**Duration:** ${report.duration}`);
  lines.push(`**Total Turns:** ${report.totalTurns}`);
  lines.push('');

  lines.push(`## Summary`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Peak Context | ${formatTokens(report.peakContext)} (${formatPercent(report.peakContextPercent)}) |`);
  lines.push(`| Total Input | ${formatTokens(report.totalInputTokens)} |`);
  lines.push(`| Total Output | ${formatTokens(report.totalOutputTokens)} |`);
  lines.push(`| Estimated Cost | ${formatCurrency(report.estimatedCost)} |`);
  lines.push('');

  if (report.userRequestStats && report.userRequestStats.length > 0) {
    lines.push(`## Top User Requests`);
    lines.push('');
    lines.push(`| Request | Turns | Tokens | Tools |`);
    lines.push(`|---------|-------|--------|-------|`);
    for (const req of report.userRequestStats.slice(0, 10)) {
      const prompt = req.userPrompt.length > 50 ? req.userPrompt.substring(0, 47) + '...' : req.userPrompt;
      lines.push(`| ${prompt} | ${req.turnCount} | ${formatTokens(req.totalTokens)} | ${req.toolCount} |`);
    }
    lines.push('');
  } else if (report.topConsumers.length > 0) {
    lines.push(`## Top Token Consumers`);
    lines.push('');
    lines.push(`| Action | Tokens | Cumulative |`);
    lines.push(`|--------|--------|------------|`);
    for (const consumer of report.topConsumers.slice(0, 10)) {
      lines.push(`| ${consumer.description} | +${formatTokens(consumer.tokens)} | ${formatTokens(consumer.cumulative)} |`);
    }
    lines.push('');
  }

  lines.push(`## By Tool Type`);
  lines.push('');
  lines.push(`| Tool | Count | Tokens | % of Session |`);
  lines.push(`|------|-------|--------|--------------|`);
  for (const stat of report.toolStats) {
    lines.push(`| ${stat.toolName} | ${stat.count} | ${formatTokens(stat.totalContextTokens)} | ${formatPercent(stat.percentOfSession)} |`);
  }

  return lines.join('\n');
}

/**
 * Format a size-based report (emphasizes content size over token deltas)
 */
export function formatSizeReport(report: SessionReport): string {
  const lines: string[] = [];
  const width = 80;

  // Header
  lines.push('╭' + '─'.repeat(width - 2) + '╮');
  lines.push(formatLine('│ CtxMap - Size Analysis (Content Fed Into Context)', width));
  lines.push(
    formatLine(
      `│ Session: ${report.sessionId.substring(0, 8)}... | ${report.totalTurns} turns | Duration: ${report.duration}`,
      width
    )
  );
  lines.push('├' + '─'.repeat(width - 2) + '┤');

  // Total size
  const totalSizeBytes = report.toolSizeStats.reduce((sum, t) => sum + t.totalSizeBytes, 0);
  lines.push(formatLine(`│ TOTAL CONTENT LOADED: ${formatKB(totalSizeBytes)}`, width));
  lines.push('├' + '─'.repeat(width - 2) + '┤');

  // By tool type (size)
  lines.push(formatLine('│ BY TOOL TYPE (File Size)', width));
  lines.push('├' + '─'.repeat(width - 2) + '┤');

  if (report.toolSizeStats && report.toolSizeStats.length > 0) {
    lines.push(formatLine('│ Tool           │ Count │ Total Size │ Avg Size', width));
    lines.push('├' + '─'.repeat(width - 2) + '┤');

    for (const stat of report.toolSizeStats) {
      const tool = stat.toolName.padEnd(14).substring(0, 14);
      const count = formatNumber(stat.count).padStart(5);
      const total = formatKB(stat.totalSizeBytes).padStart(10);
      const avg = formatKB(stat.avgSizeBytes).padStart(9);
      lines.push(formatLine(`│ ${tool} │ ${count} │ ${total} │ ${avg}`, width));
    }
  }

  // Top files by size per tool
  lines.push('├' + '─'.repeat(width - 2) + '┤');
  lines.push(formatLine('│ TOP FILES BY SIZE (per tool)', width));
  lines.push('├' + '─'.repeat(width - 2) + '┤');

  for (const toolStat of report.toolSizeStats.slice(0, 5)) {
    if (toolStat.files.length === 0) continue;

    lines.push(formatLine(`│ ${toolStat.toolName}:`, width));

    for (const file of toolStat.files.slice(0, 3)) {
      const pathParts = file.path.split(/[/\\]/);
      const shortPath = pathParts.slice(-2).join('/');
      const path = shortPath.substring(0, 40);
      const size = formatKB(file.sizeBytes).padStart(10);
      const count = `(${file.count}x)`.padStart(6);
      lines.push(formatLine(`│   ${path.padEnd(42)} ${size} ${count}`, width));
    }
  }

  // Summary
  lines.push('├' + '─'.repeat(width - 2) + '┤');
  lines.push(formatLine('│ COMPARISON: Size vs Token Delta', width));
  lines.push('├' + '─'.repeat(width - 2) + '┤');
  lines.push(
    formatLine(
      `│ Total Size Loaded: ${formatKB(totalSizeBytes)} | Total Token Delta: ${formatTokens(report.totalContextTokens)}`,
      width
    )
  );
  lines.push(
    formatLine(
      `│ Note: Token delta = model response cost, Size = actual content fed`,
      width
    )
  );
  lines.push(formatLine(`│ Peak Context: ${formatTokens(report.peakContext)} | Cost: ${formatCurrency(report.estimatedCost)}`, width));

  // Footer
  lines.push('╰' + '─'.repeat(width - 2) + '╯');

  return lines.join('\n');
}

/**
 * Format bytes as KB or MB
 */
function formatKB(bytes: number | undefined): string {
  if (bytes === undefined || bytes === 0) return '-';
  const kb = bytes / 1024;
  if (kb >= 1024) {
    return `${(kb / 1024).toFixed(1)}MB`;
  }
  return `${kb.toFixed(1)}KB`;
}

/**
 * Format a turn-by-turn breakdown
 */
export function formatTurnByTurn(report: SessionReport): string {
  const lines: string[] = [];
  const width = 140;

  // Header
  lines.push('╭' + '─'.repeat(width - 2) + '╮');
  lines.push(formatLine('│ CtxMap - Turn-by-Turn Breakdown', width));
  lines.push(formatLine(`│ Session: ${report.sessionId.substring(0, 12)}... | ${report.totalTurns} turns | ${report.duration}`, width));
  lines.push('╞' + '─'.repeat(width - 2) + '╡');

  // Compact markers for quick reference
  const compactTurns = new Set(report.compactEvents.map(c => c.turnIndex));

  // Calculate total KB for the session
  const totalKB = report.segments.reduce((sum, seg) =>
    sum + seg.turns.reduce((s, t) => s + (t.resultSize || 0), 0), 0
  );

  // Column headers - now includes both Delta and Size
  lines.push(formatLine('│ Turn │ Context    │  Delta │   Size │ Tool             │ Action', width));
  lines.push('├' + '─'.repeat(width - 2) + '┤');

  let lastUserPrompt: string | undefined;

  for (const segment of report.segments) {
    // Calculate segment total
    const segmentKB = segment.turns.reduce((s, t) => s + (t.resultSize || 0), 0);

    // Segment header
    lines.push(formatLine(`│ ─── ${segment.label} (Turns ${segment.startTurn + 1}-${segment.endTurn + 1}) ─── Peak: ${formatTokens(segment.peakContext)} ─── Size: (${formatKB(segmentKB)}) ───`, width));

    for (const turn of segment.turns) {
      // Show user prompt if it's new/different from last one
      if (turn.userPrompt && turn.userPrompt !== lastUserPrompt) {
        const truncatedPrompt = turn.userPrompt.substring(0, width - 8);
        lines.push(formatLine(`│ 👤 "${truncatedPrompt}${turn.userPrompt.length > width - 8 ? '...' : ''}"`, width));
        lastUserPrompt = turn.userPrompt;
      }

      const turnNum = String(turn.turnIndex + 1).padStart(4);
      const context = formatTokens(turn.contextTokens).padStart(9);

      // Format token delta
      const delta = (turn.tokenDelta >= 0 ? '+' : '') + formatTokens(turn.tokenDelta);
      const deltaStr = delta.padStart(7);

      // Highlight significant token deltas
      let deltaDisplay = deltaStr;
      if (turn.tokenDelta > 5000) {
        deltaDisplay = `🔥${deltaStr.substring(1)}`;
      } else if (turn.tokenDelta > 1000) {
        deltaDisplay = `⚠️${deltaStr.substring(1)}`;
      }

      // Format size - show KB for tool results
      const size = formatKB(turn.resultSize).padStart(7);

      // Highlight large sizes
      let sizeDisplay = size;
      if (turn.resultSize && turn.resultSize > 50 * 1024) { // > 50KB
        sizeDisplay = `🔥${size.substring(1)}`;
      } else if (turn.resultSize && turn.resultSize > 10 * 1024) { // > 10KB
        sizeDisplay = `⚠️${size.substring(1)}`;
      }

      // Get the tool that caused this delta
      const toolName = turn.toolCall?.toolName || '(text)';
      const tool = toolName.substring(0, 16).padEnd(16);

      // Format action description
      let action = '';
      if (turn.toolCall) {
        const input = turn.toolCall.input;
        switch (turn.toolCall.toolName) {
          case 'Read':
            action = String(input.file_path || '').split(/[/\\]/).slice(-2).join('/');
            break;
          case 'Bash':
            action = String(input.command || '').substring(0, 50);
            break;
          case 'Edit':
            action = String(input.file_path || '').split(/[/\\]/).slice(-2).join('/');
            break;
          case 'Write':
            action = String(input.file_path || '').split(/[/\\]/).slice(-2).join('/');
            break;
          case 'Task':
            action = String(input.description || input.subagent_type || '').substring(0, 50);
            break;
          case 'TaskOutput':
            action = `task: ${String(input.task_id || '').substring(0, 8)}`;
            break;
          case 'Grep':
            action = `"${String(input.pattern || '').substring(0, 25)}"`;
            break;
          case 'Glob':
            action = String(input.pattern || '');
            break;
          default:
            action = JSON.stringify(input).substring(0, 50);
        }
      } else {
        action = '(model response)';
      }

      const row = `│ ${turnNum} │ ${context} │ ${deltaDisplay} │ ${sizeDisplay} │ ${tool} │ ${action.substring(0, 50)}`;
      lines.push(formatLine(row, width));

      // Mark compact events
      if (compactTurns.has(turn.turnIndex + 1)) {
        const compact = report.compactEvents.find(c => c.turnIndex === turn.turnIndex + 1);
        if (compact) {
          lines.push(formatLine(`│      ⚡ COMPACT: ${formatTokens(compact.beforeTokens)} → ${formatTokens(compact.afterTokens)} (saved ${formatTokens(compact.tokensSaved)})`, width));
        }
      }
    }
  }

  // Summary
  lines.push('╞' + '─'.repeat(width - 2) + '╡');
  lines.push(formatLine(`│ SUMMARY: Peak ${formatTokens(report.peakContext)} (${formatPercent(report.peakContextPercent)}) | Total Size: (${formatKB(totalKB)}) | Cost: ${formatCurrency(report.estimatedCost)}`, width));
  lines.push('╰' + '─'.repeat(width - 2) + '╯');

  return lines.join('\n');
}

/**
 * Format mass aggregation for terminal output
 */
export function formatMassAggregation(agg: MassAggregation): string {
  const lines: string[] = [];
  const width = 70;

  if (agg.totalSessions === 0) {
    return 'No sessions found to aggregate.';
  }

  // Header
  lines.push('╭' + '─'.repeat(width - 2) + '╮');
  lines.push(formatLine(
    `│ CtxMap - Mass Aggregation (${agg.totalSessions} sessions, ${agg.projects.length} projects)`,
    width
  ));
  lines.push(formatLine(`│ Date range: ${agg.startDate || 'N/A'} to ${agg.endDate || 'N/A'}`, width));
  lines.push('├' + '─'.repeat(width - 2) + '┤');

  // Overview
  lines.push(formatLine('│ OVERVIEW', width));
  lines.push(formatLine(
    `│   Sessions: ${formatNumber(agg.totalSessions)} | Turns: ${formatNumber(agg.totalTurns)} | Cost: ${formatCurrency(agg.totalCost)}`,
    width
  ));
  lines.push(formatLine(
    `│   Input: ${formatTokens(agg.totalInputTokens)} | Output: ${formatTokens(agg.totalOutputTokens)} | Cache Read: ${formatTokens(agg.totalCacheRead)}`,
    width
  ));

  // BY TOOL TYPE - detailed breakdown
  if (agg.toolPatterns.length > 0) {
    lines.push('├' + '─'.repeat(width - 2) + '┤');
    lines.push(formatLine('│ BY TOOL TYPE', width));

    // Show top tools with file breakdowns
    for (const tool of agg.toolPatterns.slice(0, 5)) {
      lines.push('├' + '─'.repeat(width - 2) + '┤');
      lines.push(formatLine(
        `│ ${tool.toolName} (${formatNumber(tool.totalCount)} uses, ${tool.sessionCount} sessions)`,
        width
      ));

      // Stats line
      const sizeStr = formatKB(tool.totalOutputBytes);
      const ctxStr = formatTokens(tool.totalContextTokens);
      lines.push(formatLine(
        `│   Size: ${sizeStr} total | Context: ${ctxStr} tokens`,
        width
      ));

      // Top files for this tool (if any)
      if (tool.files.length > 0) {
        const topFiles = tool.files.slice(0, 10);
        for (const file of topFiles) {
          const path = shortenPath(file.path, 24);
          const countStr = `${formatNumber(file.count)}x`.padStart(5);
          const sessStr = `${file.sessionCount} sess`;
          const sizeStr = formatKB(file.totalSizeBytes).padStart(8);
          lines.push(formatLine(
            `│     ${path.padEnd(24)} ${countStr} × ${sessStr.padEnd(7)} ${sizeStr}`,
            width
          ));
        }
        if (tool.files.length > 10) {
          lines.push(formatLine(`│     ... (+${tool.files.length - 10} more)`, width));
        }
      }
    }
  }

  // Top files across all tools (Read + Edit + Write)
  lines.push('├' + '─'.repeat(width - 2) + '┤');
  lines.push(formatLine('│ TOP FILES ACROSS ALL TOOLS', width));

  const topInteractions = (agg.fileInteractionPatterns || []).slice(0, 5);
  if (topInteractions.length > 0) {
    for (const file of topInteractions) {
      const path = shortenPath(file.filePath, 26);
      const totalStr = `${file.totalInteractions} total`.padStart(9);
      const breakdown = `${file.readCount}R ${file.editCount}E ${file.writeCount}W`;
      const sessions = `${file.sessionCount} sess`;
      const size = formatKB(file.totalSizeBytes);
      lines.push(formatLine(`│   ${path.padEnd(26)} ${totalStr} │ ${breakdown.padEnd(9)} │ ${sessions.padEnd(6)} │ ${size}`, width));
    }
  } else {
    lines.push(formatLine('│   No file data available', width));
  }

  // Insights
  if (agg.insights.length > 0) {
    lines.push('├' + '─'.repeat(width - 2) + '┤');
    lines.push(formatLine('│ INSIGHTS', width));

    for (const insight of agg.insights.slice(0, 6)) {
      const icon = getInsightIcon(insight.type);
      const severity = insight.severity.toUpperCase();
      lines.push('├' + '─'.repeat(width - 2) + '┤');
      lines.push(formatLine(`│ ${icon} ${insight.type.replace(/_/g, ' ').toUpperCase()} (${severity})`, width));
      lines.push(formatLine(`│   ${insight.description}`, width));
      lines.push(formatLine(`│   -> ${insight.recommendation}`, width));
    }
  }

  // Usage by week (aggregate daily to weekly)
  lines.push('├' + '─'.repeat(width - 2) + '┤');
  lines.push(formatLine('│ USAGE BY WEEK', width));

  const weeklyTotals = aggregateToWeekly(agg.dailyTotals);
  for (const week of weeklyTotals.slice(-6)) {
    const weekLabel = `Week of ${week.date}:`.padEnd(16);
    const sessions = `${week.sessions} sess`.padStart(8);
    const cost = formatCurrency(week.cost).padStart(8);
    const bar = createProportionalBar(week.cost, Math.max(...weeklyTotals.map(w => w.cost)), 20);
    lines.push(formatLine(`│   ${weekLabel} ${sessions} | ${cost} ${bar}`, width));
  }

  // Footer
  lines.push('╰' + '─'.repeat(width - 2) + '╯');

  return lines.join('\n');
}

/**
 * Get icon for insight type
 */
function getInsightIcon(type: InsightPattern['type']): string {
  switch (type) {
    case 'frequent_file': return '📌';
    case 'test_churn': return '🔄';
    case 'context_bloat': return '📊';
    case 'long_session': return '⏱️';
    case 'high_churn': return '🔧';
    default: return '💡';
  }
}

/**
 * Shorten a file path for display
 */
function shortenPath(filePath: string, maxLength: number): string {
  const parts = filePath.split(/[/\\]/);
  if (parts.length <= 2) {
    return filePath.length > maxLength ? filePath.substring(0, maxLength - 3) + '...' : filePath;
  }
  const shortened = parts.slice(-2).join('/');
  return shortened.length > maxLength ? shortened.substring(0, maxLength - 3) + '...' : shortened;
}

/**
 * Aggregate daily totals to weekly
 */
function aggregateToWeekly(dailyTotals: Array<{ date: string; sessions: number; cost: number; inputTokens: number; outputTokens: number; peakContext: number }>): Array<{ date: string; sessions: number; cost: number }> {
  const weekMap = new Map<string, { sessions: number; cost: number }>();

  for (const day of dailyTotals) {
    // Get the Monday of the week
    const date = new Date(day.date);
    const dayOfWeek = date.getDay();
    const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    const weekKey = monday.toISOString().substring(0, 10);

    const existing = weekMap.get(weekKey) || { sessions: 0, cost: 0 };
    existing.sessions += day.sessions;
    existing.cost += day.cost;
    weekMap.set(weekKey, existing);
  }

  return Array.from(weekMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Create a proportional bar (based on value relative to max)
 */
function createProportionalBar(value: number, maxValue: number, width: number): string {
  if (maxValue === 0) return '░'.repeat(width);
  const filled = Math.round((value / maxValue) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/**
 * Format mass aggregation as JSON
 */
export function formatMassAggregationJson(agg: MassAggregation): string {
  return JSON.stringify(agg, null, 2);
}

/**
 * Format mass aggregation as Markdown
 */
export function formatMassAggregationMarkdown(agg: MassAggregation): string {
  const lines: string[] = [];

  lines.push(`# CtxMap - Mass Aggregation`);
  lines.push('');
  lines.push(`**Sessions:** ${agg.totalSessions} | **Projects:** ${agg.projects.length}`);
  lines.push(`**Date Range:** ${agg.startDate || 'N/A'} to ${agg.endDate || 'N/A'}`);
  lines.push('');

  lines.push(`## Overview`);
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Turns | ${formatNumber(agg.totalTurns)} |`);
  lines.push(`| Total Cost | ${formatCurrency(agg.totalCost)} |`);
  lines.push(`| Total Input | ${formatTokens(agg.totalInputTokens)} |`);
  lines.push(`| Total Output | ${formatTokens(agg.totalOutputTokens)} |`);
  lines.push(`| Cache Read | ${formatTokens(agg.totalCacheRead)} |`);
  lines.push('');

  // Tool Details
  if (agg.toolPatterns.length > 0) {
    lines.push(`## By Tool Type`);
    lines.push('');

    for (const tool of agg.toolPatterns.slice(0, 5)) {
      lines.push(`### ${tool.toolName}`);
      lines.push('');
      lines.push(`- **Uses:** ${formatNumber(tool.totalCount)} across ${tool.sessionCount} sessions`);
      lines.push(`- **Size:** ${formatKB(tool.totalOutputBytes)} total`);
      lines.push(`- **Context:** ${formatTokens(tool.totalContextTokens)} tokens`);

      if (tool.files.length > 0) {
        lines.push('');
        lines.push(`| File | Count | Sessions | Size |`);
        lines.push(`|------|-------|----------|------|`);
        for (const file of tool.files.slice(0, 10)) {
          lines.push(`| ${shortenPath(file.path, 40)} | ${file.count} | ${file.sessionCount} | ${formatKB(file.totalSizeBytes)} |`);
        }
        if (tool.files.length > 10) {
          lines.push(`| ... (+${tool.files.length - 10} more) | | | |`);
        }
      }
      lines.push('');
    }
  }

  if (agg.fileInteractionPatterns && agg.fileInteractionPatterns.length > 0) {
    lines.push(`## Top Files Across All Tools`);
    lines.push('');
    lines.push(`| File | Total | R/E/W | Sessions | Size |`);
    lines.push(`|------|-------|-------|----------|------|`);
    for (const file of agg.fileInteractionPatterns.slice(0, 10)) {
      const breakdown = `${file.readCount}R/${file.editCount}E/${file.writeCount}W`;
      lines.push(`| ${shortenPath(file.filePath, 40)} | ${file.totalInteractions} | ${breakdown} | ${file.sessionCount} | ${formatKB(file.totalSizeBytes)} |`);
    }
    lines.push('');
  }

  if (agg.insights.length > 0) {
    lines.push(`## Insights`);
    lines.push('');
    for (const insight of agg.insights) {
      const icon = getInsightIcon(insight.type);
      lines.push(`### ${icon} ${insight.type.replace(/_/g, ' ').toUpperCase()} (${insight.severity})`);
      lines.push('');
      lines.push(`${insight.description}`);
      lines.push('');
      lines.push(`**Recommendation:** ${insight.recommendation}`);
      lines.push('');
    }
  }

  const weeklyTotals = aggregateToWeekly(agg.dailyTotals);
  if (weeklyTotals.length > 0) {
    lines.push(`## Weekly Usage`);
    lines.push('');
    lines.push(`| Week | Sessions | Cost |`);
    lines.push(`|------|----------|------|`);
    for (const week of weeklyTotals) {
      lines.push(`| ${week.date} | ${week.sessions} | ${formatCurrency(week.cost)} |`);
    }
  }

  return lines.join('\n');
}
