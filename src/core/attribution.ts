/**
 * Token Attribution Engine
 * Calculates token deltas, detects compacts, and aggregates statistics
 */

import type {
  Turn,
  CompactEvent,
  SessionSegment,
  ToolStats,
  FileStats,
  TopConsumer,
  SessionReport,
  ToolCall,
} from './types.js';
import { formatToolDescription } from './parser.js';

const MODEL_WINDOW = 200_000;
const COMPACT_THRESHOLD = 0.5;

// Pricing rates (per 1M tokens) - Claude Opus 4.6
const PRICING = {
  input: 15.0,
  output: 75.0,
  cacheCreation: 18.75,
  cacheRead: 1.50,
};

/**
 * Detect compact events from turns
 * A compact is detected when context tokens drop significantly (>50%)
 */
export function detectCompacts(turns: Turn[]): CompactEvent[] {
  const compacts: CompactEvent[] = [];

  for (let i = 1; i < turns.length; i++) {
    const prev = turns[i - 1].contextTokens;
    const curr = turns[i].contextTokens;

    // Drop of 50%+ indicates compact
    if (prev > 0 && curr < prev * COMPACT_THRESHOLD) {
      compacts.push({
        turnIndex: i,
        timestamp: turns[i].timestamp,
        beforeTokens: prev,
        afterTokens: curr,
        tokensSaved: prev - curr,
      });
    }
  }

  return compacts;
}

/**
 * Segment session by compact events
 */
export function segmentSession(turns: Turn[], compacts: CompactEvent[]): SessionSegment[] {
  if (turns.length === 0) return [];

  const segments: SessionSegment[] = [];
  let segmentStart = 0;
  let segmentIndex = 0;

  // Add implicit compact point at the end
  const compactPoints = [...compacts, { turnIndex: turns.length }];

  for (const compact of compactPoints) {
    const segmentTurns = turns.slice(segmentStart, compact.turnIndex);

    if (segmentTurns.length > 0) {
      const peakContext = Math.max(...segmentTurns.map(t => t.contextTokens));
      const peakContextPercent = (peakContext / MODEL_WINDOW) * 100;
      const totalTokens = segmentTurns.reduce((sum, t) => sum + t.tokenDelta, 0);

      const startTs = segmentTurns[0].timestamp;
      const endTs = segmentTurns[segmentTurns.length - 1].timestamp;

      segments.push({
        index: segmentIndex,
        label: segmentIndex === 0 ? 'Pre-compact' : `Post-compact #${segmentIndex}`,
        startTurn: segmentStart,
        endTurn: compact.turnIndex - 1,
        turns: segmentTurns,
        peakContext,
        peakContextPercent,
        totalTokens,
        duration: calculateDuration(startTs, endTs),
        startTimestamp: startTs,
        endTimestamp: endTs,
      });

      segmentIndex++;
    }

    segmentStart = compact.turnIndex;
  }

  return segments;
}

/**
 * Calculate duration between two ISO timestamps
 */
function calculateDuration(start: string, end: string): string {
  try {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const diffMs = endTime - startTime;

    if (isNaN(diffMs) || diffMs < 0) return '0m';

    const minutes = Math.floor(diffMs / 60000);
    const seconds = Math.floor((diffMs % 60000) / 1000);

    if (minutes === 0) {
      return `${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  } catch {
    return '0m';
  }
}

/**
 * Get the tool call that should be attributed for a turn's token delta.
 * If the current turn has no tool call but a positive delta, attribute to
 * the previous turn's tool call (the tool whose result is being processed).
 */
function getAttributedToolCall(turns: Turn[], turnIndex: number): ToolCall | null {
  const turn = turns[turnIndex];
  if (turn.toolCall) {
    return turn.toolCall;
  }
  // If no tool call but positive delta, attribute to previous turn's tool
  if (turn.tokenDelta > 0 && turnIndex > 0) {
    const prevTurn = turns[turnIndex - 1];
    if (prevTurn.toolCall) {
      return prevTurn.toolCall;
    }
  }
  return null;
}

/**
 * Aggregate tool statistics
 */
export function aggregateToolStats(turns: Turn[]): ToolStats[] {
  const toolMap = new Map<string, {
    count: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreation: number;
    cacheRead: number;
    contextTokens: number;
  }>();

  let totalContext = 0;

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    const attributedTool = getAttributedToolCall(turns, i);
    const toolName = attributedTool?.toolName || 'initial_context';
    const stats = toolMap.get(toolName) || {
      count: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheCreation: 0,
      cacheRead: 0,
      contextTokens: 0,
    };

    stats.count++;
    stats.inputTokens += turn.usage.input_tokens;
    stats.outputTokens += turn.usage.output_tokens;
    stats.cacheCreation += turn.usage.cache_creation_input_tokens || 0;
    stats.cacheRead += turn.usage.cache_read_input_tokens || 0;
    stats.contextTokens += turn.tokenDelta;
    totalContext += turn.tokenDelta;

    toolMap.set(toolName, stats);
  }

  const results: ToolStats[] = [];

  for (const [toolName, stats] of toolMap) {
    results.push({
      toolName,
      count: stats.count,
      totalInputTokens: stats.inputTokens,
      totalOutputTokens: stats.outputTokens,
      totalCacheCreation: stats.cacheCreation,
      totalCacheRead: stats.cacheRead,
      totalContextTokens: stats.contextTokens,
      percentOfSession: totalContext > 0 ? (stats.contextTokens / totalContext) * 100 : 0,
    });
  }

  // Sort by context tokens descending
  results.sort((a, b) => b.totalContextTokens - a.totalContextTokens);

  return results;
}

/**
 * Aggregate file-level statistics
 */
export function aggregateFileStats(turns: Turn[]): FileStats[] {
  const fileMap = new Map<string, {
    toolName: string;
    count: number;
    tokens: number;
  }>();

  for (const turn of turns) {
    if (!turn.toolCall) continue;

    const { toolName, input } = turn.toolCall;
    let filePath: string | undefined;

    // Extract file path from relevant tools
    switch (toolName) {
      case 'Read':
      case 'Edit':
      case 'Write':
      case 'NotebookEdit':
        filePath = input.file_path as string;
        break;
      case 'Glob':
        filePath = `pattern:${input.pattern as string}`;
        break;
      case 'Grep':
        filePath = `pattern:${input.pattern as string}`;
        break;
    }

    if (filePath) {
      const key = `${toolName}:${filePath}`;
      const stats = fileMap.get(key) || {
        toolName,
        count: 0,
        tokens: 0,
      };

      stats.count++;
      stats.tokens += turn.tokenDelta;

      fileMap.set(key, stats);
    }
  }

  const results: FileStats[] = [];

  for (const [key, stats] of fileMap) {
    const [, filePath] = key.split(':', 2) as [string, string];
    results.push({
      filePath,
      toolName: stats.toolName,
      count: stats.count,
      totalTokens: stats.tokens,
      avgTokens: Math.round(stats.tokens / stats.count),
    });
  }

  // Sort by total tokens descending
  results.sort((a, b) => b.totalTokens - a.totalTokens);

  return results;
}

/**
 * Get top token consumers
 */
export function getTopConsumers(turns: Turn[], limit: number = 10): TopConsumer[] {
  // Create attributed turns with proper tool attribution
  const attributedTurns = turns.map((turn, i) => ({
    ...turn,
    attributedTool: getAttributedToolCall(turns, i),
  }));

  // Sort by token delta descending, only include turns with positive delta and attribution
  const sortedTurns = attributedTurns
    .filter(t => t.tokenDelta > 0 && t.attributedTool)
    .sort((a, b) => b.tokenDelta - a.tokenDelta)
    .slice(0, limit);

  const consumers: TopConsumer[] = [];
  let cumulative = 0;

  for (const turn of sortedTurns) {
    cumulative += turn.tokenDelta;
    consumers.push({
      description: turn.attributedTool ? formatToolDescription(turn.attributedTool) : 'Unknown',
      tokens: turn.tokenDelta,
      cumulative,
      toolName: turn.attributedTool?.toolName || 'unknown',
      turnIndex: turn.turnIndex,
    });
  }

  return consumers;
}

/**
 * Calculate estimated cost based on usage
 */
export function calculateCost(usage: {
  inputTokens: number;
  outputTokens: number;
  cacheCreation: number;
  cacheRead: number;
}): number {
  const cost =
    (usage.inputTokens / 1_000_000) * PRICING.input +
    (usage.outputTokens / 1_000_000) * PRICING.output +
    (usage.cacheCreation / 1_000_000) * PRICING.cacheCreation +
    (usage.cacheRead / 1_000_000) * PRICING.cacheRead;

  return cost;
}

/**
 * Generate a complete session report
 */
export function generateReport(
  sessionId: string,
  projectPath: string,
  turns: Turn[]
): SessionReport {
  const compacts = detectCompacts(turns);
  const segments = segmentSession(turns, compacts);
  const toolStats = aggregateToolStats(turns);
  const fileStats = aggregateFileStats(turns);
  const topConsumers = getTopConsumers(turns);

  // Calculate totals
  const totalInputTokens = turns.reduce((sum, t) => sum + t.usage.input_tokens, 0);
  const totalOutputTokens = turns.reduce((sum, t) => sum + t.usage.output_tokens, 0);
  const totalCacheCreation = turns.reduce(
    (sum, t) => sum + (t.usage.cache_creation_input_tokens || 0),
    0
  );
  const totalCacheRead = turns.reduce(
    (sum, t) => sum + (t.usage.cache_read_input_tokens || 0),
    0
  );
  const totalContextTokens = turns.reduce((sum, t) => sum + t.tokenDelta, 0);
  const peakContext = Math.max(...turns.map(t => t.contextTokens), 0);
  const peakContextPercent = (peakContext / MODEL_WINDOW) * 100;

  const estimatedCost = calculateCost({
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cacheCreation: totalCacheCreation,
    cacheRead: totalCacheRead,
  });

  const startTimestamp = turns[0]?.timestamp || '';
  const endTimestamp = turns[turns.length - 1]?.timestamp || '';

  return {
    sessionId,
    projectPath,
    startTimestamp,
    endTimestamp,
    duration: calculateDuration(startTimestamp, endTimestamp),
    totalTurns: turns.length,
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreation,
    totalCacheRead,
    totalContextTokens,
    peakContext,
    peakContextPercent,
    modelWindow: MODEL_WINDOW,
    estimatedCost,
    segments,
    compactEvents: compacts,
    topConsumers,
    toolStats,
    fileStats,
  };
}
