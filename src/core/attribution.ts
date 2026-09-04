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
  ToolSizeStats,
  TopConsumer,
  UserRequestStats,
  SessionReport,
  ToolCall,
} from './types.js';
import { COMPACT_THRESHOLD, DEFAULT_WINDOW, resolveModel } from './types.js';
import { formatToolDescription } from './parser.js';

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
export function segmentSession(
  turns: Turn[],
  compacts: CompactEvent[],
  modelWindow: number = DEFAULT_WINDOW
): SessionSegment[] {
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
      const peakContextPercent = (peakContext / modelWindow) * 100;
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
 * Aggregate tool statistics by file size (actual KB fed into context)
 * This is more accurate than token deltas for understanding what content
 * is being loaded into context.
 */
export function aggregateToolSizeStats(turns: Turn[]): ToolSizeStats[] {
  // Track per-tool aggregated stats
  const toolMap = new Map<string, {
    count: number;
    totalSizeBytes: number;
    files: Map<string, { sizeBytes: number; count: number }>;
  }>();

  for (const turn of turns) {
    if (!turn.toolCall) continue;

    const { toolName, input } = turn.toolCall;
    const sizeBytes = turn.resultSize || 0;

    // Get or create tool entry
    let toolStats = toolMap.get(toolName);
    if (!toolStats) {
      toolStats = {
        count: 0,
        totalSizeBytes: 0,
        files: new Map(),
      };
      toolMap.set(toolName, toolStats);
    }

    toolStats.count++;
    toolStats.totalSizeBytes += sizeBytes;

    // Extract file/identifier for per-file breakdown
    let identifier: string | undefined;
    switch (toolName) {
      case 'Read':
      case 'Edit':
      case 'Write':
      case 'NotebookEdit':
        identifier = input.file_path as string;
        break;
      case 'Bash':
        // Use the command as the identifier, truncated
        const cmd = String(input.command || '');
        identifier = cmd.substring(0, 60) + (cmd.length > 60 ? '...' : '');
        break;
      case 'Glob':
        identifier = `pattern:${input.pattern as string}`;
        break;
      case 'Grep':
        identifier = `"${String(input.pattern || '').substring(0, 30)}"`;
        break;
      case 'Task':
        identifier = String(input.description || input.subagent_type || 'unknown');
        break;
      case 'TaskOutput':
        identifier = `task:${String(input.task_id || '').substring(0, 8)}`;
        break;
      default:
        identifier = JSON.stringify(input).substring(0, 50);
    }

    if (identifier) {
      const fileStats = toolStats.files.get(identifier);
      if (fileStats) {
        fileStats.sizeBytes += sizeBytes;
        fileStats.count++;
      } else {
        toolStats.files.set(identifier, { sizeBytes, count: 1 });
      }
    }
  }

  const results: ToolSizeStats[] = [];

  for (const [toolName, stats] of toolMap) {
    // Convert files map to sorted array
    const files = Array.from(stats.files.entries())
      .map(([path, fileStats]) => ({
        path,
        sizeBytes: fileStats.sizeBytes,
        count: fileStats.count,
      }))
      .sort((a, b) => b.sizeBytes - a.sizeBytes);

    results.push({
      toolName,
      count: stats.count,
      totalSizeBytes: stats.totalSizeBytes,
      avgSizeBytes: stats.count > 0 ? Math.round(stats.totalSizeBytes / stats.count) : 0,
      files,
    });
  }

  // Sort by total size descending
  results.sort((a, b) => b.totalSizeBytes - a.totalSizeBytes);

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
 * Aggregate turns by user message to show actual request-level token consumption
 * This gives a clearer picture of which user requests consumed the most tokens
 */
export function aggregateByUserMessage(turns: Turn[]): UserRequestStats[] {
  if (turns.length === 0) return [];

  const groups: Map<string, UserRequestStats> = new Map();

  for (const turn of turns) {
    const prompt = turn.userPrompt || '(initial context)';

    const existing = groups.get(prompt);

    if (existing) {
      // Update existing group
      existing.turnCount++;
      existing.totalTokens += turn.tokenDelta;
      existing.toolCount += turn.toolCall ? 1 : 0;
      existing.endTurn = turn.turnIndex;
    } else {
      // Create new group
      groups.set(prompt, {
        userPrompt: prompt,
        turnCount: 1,
        totalTokens: turn.tokenDelta,
        toolCount: turn.toolCall ? 1 : 0,
        startTurn: turn.turnIndex,
        endTurn: turn.turnIndex,
      });
    }
  }

  // Sort by total tokens descending
  return Array.from(groups.values()).sort((a, b) => b.totalTokens - a.totalTokens);
}

/**
 * Calculate estimated cost based on usage, priced at the given model's rates.
 * `model` is a raw transcript model id (e.g. "claude-opus-4-8-…"); when omitted
 * or unrecognized it falls back to Opus-class rates (see resolveModel/MODELS).
 */
export function calculateCost(
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreation: number;
    cacheRead: number;
  },
  model?: string
): number {
  const p = resolveModel(model).pricing;
  const cost =
    (usage.inputTokens / 1_000_000) * p.input +
    (usage.outputTokens / 1_000_000) * p.output +
    (usage.cacheCreation / 1_000_000) * p.cacheCreation +
    (usage.cacheRead / 1_000_000) * p.cacheRead;

  return cost;
}

/**
 * Sum per-turn cost, pricing each turn at its own model's rates. This is
 * billing-grade for mixed-model sessions (e.g. an Opus main loop with Haiku
 * subagent turns), where a single blended rate would be wrong.
 */
export function calculateSessionCost(turns: Turn[]): number {
  return turns.reduce(
    (sum, t) =>
      sum +
      calculateCost(
        {
          inputTokens: t.usage.input_tokens,
          outputTokens: t.usage.output_tokens,
          cacheCreation: t.usage.cache_creation_input_tokens || 0,
          cacheRead: t.usage.cache_read_input_tokens || 0,
        },
        t.model
      ),
    0
  );
}

/**
 * Determine the session's dominant model — the one that served the most turns.
 * Drives the session-level context window and %-of-window figures.
 */
export function getPrimaryModel(turns: Turn[]): string | undefined {
  const counts = new Map<string, number>();
  for (const t of turns) {
    if (!t.model) continue;
    counts.set(t.model, (counts.get(t.model) || 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [model, count] of counts) {
    if (count > bestCount) {
      best = model;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Generate a complete session report
 */
export function generateReport(
  sessionId: string,
  projectPath: string,
  turns: Turn[],
  subagentTurns: Turn[] = [],
  subagentCount: number = 0
): SessionReport {
  const compacts = detectCompacts(turns);

  // Resolve the session's dominant model → its context window drives all
  // %-of-window figures (per-model: Opus/Sonnet/Fable 1M, Haiku 200K).
  const primaryModelId = getPrimaryModel(turns);
  const primaryModel = resolveModel(primaryModelId);
  const modelWindow = primaryModel.window;

  const segments = segmentSession(turns, compacts, modelWindow);
  const toolStats = aggregateToolStats(turns);
  const fileStats = aggregateFileStats(turns);
  const toolSizeStats = aggregateToolSizeStats(turns);
  const topConsumers = getTopConsumers(turns);
  const userRequestStats = aggregateByUserMessage(turns);

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
  const peakContextPercent = (peakContext / modelWindow) * 100;

  // Price each turn at its own model's rates (billing-grade for mixed-model sessions).
  // Subagents run on their own transcripts (often Haiku) — fold their spend into
  // the session total so "what this session cost" is complete, while the context /
  // segment / turn-table analysis above stays on the main thread (subagents have
  // their own separate context windows).
  const mainThreadCost = calculateSessionCost(turns);
  const subagentCost = calculateSessionCost(subagentTurns);
  const estimatedCost = mainThreadCost + subagentCost;

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
    modelWindow,
    primaryModel: primaryModel.label,
    estimatedCost,
    mainThreadCost,
    subagentCount,
    subagentTurns: subagentTurns.length,
    subagentCost,
    segments,
    compactEvents: compacts,
    topConsumers,
    userRequestStats,
    toolStats,
    fileStats,
    toolSizeStats,
  };
}
