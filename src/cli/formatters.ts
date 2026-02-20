/**
 * CLI Formatters
 * Rich terminal output for session reports
 */

import type {
  SessionReport,
  SessionSegment,
  TopConsumer,
  ToolStats,
  FileStats,
  CompactEvent,
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

  // Top consumers
  lines.push(formatLine('│ TOP TOKEN CONSUMERS', width));
  lines.push('├' + '─'.repeat(width - 2) + '┤');

  if (report.topConsumers.length > 0) {
    // Table header
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
      `│ Total Input: ${formatTokens(report.totalInputTokens)} | Output: ${formatTokens(report.totalOutputTokens)}`,
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

  lines.push(formatLine(`│ ESTIMATED COST: ${formatCurrency(report.estimatedCost)} (Opus 4.6 rates)`, width));

  // Footer
  lines.push('╰' + '─'.repeat(width - 2) + '╯');

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

  if (report.topConsumers.length > 0) {
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
