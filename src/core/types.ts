/**
 * Core type definitions for CtxMap
 * Based on Claude Code JSONL transcript structure
 */

// ============================================================================
// JSONL Transcript Types (Raw parsing)
// ============================================================================

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface TextContent {
  type: 'text';
  text: string;
}

export type MessageContent = ToolUse | TextContent;

export interface AssistantMessage {
  role: 'assistant';
  content: MessageContent[];
  usage?: Usage;
  model?: string; // e.g. "claude-opus-4-8-20260101" — the model that served this turn
}

export interface ToolResultBlock {
  type?: string;   // 'text' | 'tool_reference' | 'image' | …
  text?: string;
}

export interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  // The transcript stores this either as a plain string or as an array of
  // content blocks. Normalize with normalizeToolResultContent() before sizing.
  content: string | ToolResultBlock[];
  is_error?: boolean;
}

export interface UserMessage {
  role: 'user';
  content: (ToolResult | TextContent)[] | string; // Can be array or plain string
}

export interface JsonlEntry {
  type: 'assistant' | 'user' | 'summary';
  timestamp: string;
  sessionId: string;
  isSidechain?: boolean;
  message?: AssistantMessage | UserMessage;
  // For summary entries
  summary?: string;
  leafUuid?: string;
}

// ============================================================================
// Parsed & Analyzed Types
// ============================================================================

export interface ToolCall {
  toolId: string;
  toolName: string;
  input: Record<string, unknown>;
  result?: string;
  isError: boolean;
}

export interface Turn {
  turnIndex: number;
  timestamp: string;
  toolCall: ToolCall | null;
  usage: Usage;
  contextTokens: number;
  tokenDelta: number;
  outputTokens: number;
  userPrompt?: string; // The user message that triggered this turn
  resultSize?: number; // Size of tool result in bytes (if applicable)
  model?: string; // The model that served this turn (from the transcript's message.model)
}

export interface CompactEvent {
  turnIndex: number;
  timestamp: string;
  beforeTokens: number;
  afterTokens: number;
  tokensSaved: number;
}

export interface SessionSegment {
  index: number;
  label: string;
  startTurn: number;
  endTurn: number;
  turns: Turn[];
  peakContext: number;
  peakContextPercent: number;
  totalTokens: number;
  duration: string;
  startTimestamp: string;
  endTimestamp: string;
}

// ============================================================================
// Aggregation Types
// ============================================================================

export interface ToolStats {
  toolName: string;
  count: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreation: number;
  totalCacheRead: number;
  totalContextTokens: number;
  percentOfSession: number;
}

export interface FileStats {
  filePath: string;
  toolName: string;
  count: number;
  totalTokens: number;
  avgTokens: number;
}

export interface ToolSizeStats {
  toolName: string;
  count: number;
  totalSizeBytes: number;
  avgSizeBytes: number;
  files: Array<{ path: string; sizeBytes: number; count: number }>;
}

export interface TopConsumer {
  description: string;
  tokens: number;
  cumulative: number;
  toolName: string;
  turnIndex: number;
}

export interface UserRequestStats {
  userPrompt: string;      // The user's message (truncated for display)
  turnCount: number;       // How many turns this request spanned
  totalTokens: number;     // Total token delta for this request
  toolCount: number;       // Number of tool calls made
  startTurn: number;       // First turn index
  endTurn: number;         // Last turn index
}

// ============================================================================
// Report Types
// ============================================================================

export interface SessionReport {
  sessionId: string;
  projectPath: string;
  startTimestamp: string;
  endTimestamp: string;
  duration: string;
  totalTurns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreation: number;
  totalCacheRead: number;
  totalContextTokens: number;
  peakContext: number;
  peakContextPercent: number;
  modelWindow: number;
  primaryModel?: string;    // Human-readable label of the session's dominant model (drives modelWindow)
  estimatedCost: number;
  segments: SessionSegment[];
  compactEvents: CompactEvent[];
  topConsumers: TopConsumer[];
  userRequestStats: UserRequestStats[];
  toolStats: ToolStats[];
  fileStats: FileStats[];
  toolSizeStats: ToolSizeStats[];
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AnalysisOptions {
  sessionPath?: string;
  sessionId?: string;
  latest?: boolean;
  projectPath?: string;
  compare?: string[];
  format?: 'table' | 'json' | 'markdown';
  topN?: number;
}

// ============================================================================
// Constants
// ============================================================================

export type ModelFamily = 'opus' | 'sonnet-5' | 'sonnet' | 'haiku' | 'fable' | 'unknown';

export interface ModelPricing {
  input: number;         // $ per 1M input tokens
  output: number;        // $ per 1M output tokens
  cacheCreation: number; // $ per 1M cache-write tokens (1.25x input)
  cacheRead: number;     // $ per 1M cache-read tokens (0.10x input)
}

export interface ModelInfo {
  family: ModelFamily;
  label: string;
  window: number;        // context window in tokens
  pricing: ModelPricing; // per-1M-token rates
}

// Default context window for the 1M-window model families (Opus, Sonnet, Fable).
export const DEFAULT_WINDOW = 1_000_000;

// Per-model context windows + pricing (per 1M tokens), current as of 2026-09-04.
// Cache-write = 1.25x input, cache-read = 0.10x input.
// Sonnet is split: Sonnet 5 = $2/$10, older Sonnet (4.x/3.x) = $3/$15.
export const MODELS: Record<ModelFamily, ModelInfo> = {
  opus:       { family: 'opus',     label: 'Opus',     window: 1_000_000, pricing: { input: 5.0,  output: 25.0, cacheCreation: 6.25,  cacheRead: 0.50 } },
  'sonnet-5': { family: 'sonnet-5', label: 'Sonnet 5', window: 1_000_000, pricing: { input: 2.0,  output: 10.0, cacheCreation: 2.50,  cacheRead: 0.20 } },
  sonnet:     { family: 'sonnet',   label: 'Sonnet',   window: 1_000_000, pricing: { input: 3.0,  output: 15.0, cacheCreation: 3.75,  cacheRead: 0.30 } },
  haiku:      { family: 'haiku',    label: 'Haiku',    window: 200_000,   pricing: { input: 1.0,  output: 5.0,  cacheCreation: 1.25,  cacheRead: 0.10 } },
  fable:      { family: 'fable',    label: 'Fable',    window: 1_000_000, pricing: { input: 10.0, output: 50.0, cacheCreation: 12.50, cacheRead: 1.00 } },
  // Fallback when the transcript carries no (or an unrecognized) model id. Priced/sized as Opus-class.
  unknown:    { family: 'unknown',  label: 'Unknown',  window: 1_000_000, pricing: { input: 5.0,  output: 25.0, cacheCreation: 6.25,  cacheRead: 0.50 } },
};

/**
 * Resolve a raw transcript model id (e.g. "claude-opus-4-8-20260101",
 * "claude-sonnet-5", "claude-3-5-sonnet-20241022") to its ModelInfo.
 * Order matters: fable/opus/haiku are checked before sonnet, and Sonnet 5 is
 * distinguished from older Sonnet by an explicit "sonnet 5" token so that
 * "claude-3-5-sonnet" (a 3.5 model) does NOT match the Sonnet-5 rate.
 */
export function resolveModel(modelId: string | undefined | null): ModelInfo {
  if (!modelId) return MODELS.unknown;
  const id = modelId.toLowerCase();
  if (id.includes('fable')) return MODELS.fable;
  if (id.includes('opus')) return MODELS.opus;
  if (id.includes('haiku')) return MODELS.haiku;
  if (id.includes('sonnet')) {
    return /sonnet-?5/.test(id) ? MODELS['sonnet-5'] : MODELS.sonnet;
  }
  return MODELS.unknown;
}

/**
 * @deprecated Use MODELS / resolveModel(). Kept for backward compatibility.
 * Represents the default 1M-token window; per-model windows now live in MODELS.
 */
export const MODEL_WINDOW = DEFAULT_WINDOW;

/**
 * @deprecated Use MODELS / resolveModel(). Kept for backward compatibility with
 * any external callers; values reflect current per-1M rates.
 */
export const PRICING = {
  opus: MODELS.opus.pricing,
  sonnet: MODELS.sonnet.pricing,
  haiku: MODELS.haiku.pricing,
};

// Performance zones
export const PERFORMANCE_ZONES = {
  optimal: 10_000,      // <10K: Optimal performance
  moderate: 50_000,     // 10K-50K: Moderate performance
  degraded: 100_000,    // 50K-100K: Some degradation
  critical: 150_000,    // 100K-150K: Significant degradation
};

export const COMPACT_THRESHOLD = 0.5; // 50% drop indicates compact

// ============================================================================
// Mass Aggregation Types
// ============================================================================

export interface MassAggregation {
  // Time range covered
  startDate: string;
  endDate: string;

  // Session counts
  totalSessions: number;
  totalTurns: number;
  projects: ProjectSummary[];

  // Token totals
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreation: number;
  totalCacheRead: number;
  totalCost: number;

  // Cross-session patterns
  filePatterns: FilePattern[];
  fileInteractionPatterns: FileInteractionPattern[];
  toolPatterns: ToolPattern[];
  aggregatedToolStats: AggregatedToolStats[]; // Summary view by context tokens
  insights: InsightPattern[];

  // Time series (daily aggregation)
  dailyTotals: DailyTotal[];
}

export interface ProjectSummary {
  projectPath: string;
  sessionCount: number;
  totalCost: number;
  totalTokens: number;
}

export interface FilePattern {
  filePath: string;
  // How many times this file was read
  readCount: number;
  // How many unique sessions it appeared in
  sessionCount: number;
  // Total size loaded across all reads
  totalSizeBytes: number;
  // Percentage of sessions this file appeared in
  sessionPercent: number;
  // How many times more than average this file is read
  readRatioVsAverage: number;
  // Which projects is this file in
  projects: string[];
}

export interface ToolPattern {
  toolName: string;

  // Counts
  totalCount: number;           // Total invocations across all sessions
  sessionCount: number;         // How many sessions used this tool

  // Size-based (from toolSizeStats)
  totalOutputBytes: number;
  averageOutputBytes: number;

  // Token-based (from toolStats)
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreation: number;
  totalCacheRead: number;
  totalContextTokens: number;   // Token deltas attributed to this tool

  // Per-tool file breakdown
  files: Array<{
    path: string;
    count: number;              // Times this file was used with this tool
    totalSizeBytes: number;
    sessionCount: number;       // How many sessions this file appeared in
  }>;

  // Percentage of all sessions
  sessionPercent: number;
}

/**
 * Aggregated token-based stats per tool (for summary view)
 */
export interface AggregatedToolStats {
  toolName: string;
  totalCount: number;
  sessionCount: number;

  // Token deltas
  totalContextTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreation: number;
  totalCacheRead: number;

  // Size
  totalOutputBytes: number;

  // Percentage of all sessions
  sessionPercent: number;
}

export interface FileInteractionPattern {
  filePath: string;
  // Breakdown by operation type
  readCount: number;
  editCount: number;
  writeCount: number;
  totalInteractions: number;  // read + edit + write
  // Cross-session metrics
  sessionCount: number;       // How many sessions touched this file
  sessionPercent: number;     // % of all sessions
  // Size metrics (from reads)
  totalSizeBytes: number;
  // Which projects
  projects: string[];
}

export interface InsightPattern {
  type: 'frequent_file' | 'test_churn' | 'context_bloat' | 'long_session' | 'high_churn';
  severity: 'info' | 'notice' | 'warning';
  description: string;
  affectedSessions: number;
  details: Record<string, unknown>;
  recommendation: string;
}

export interface DailyTotal {
  date: string; // YYYY-MM-DD
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  peakContext: number;
}

export interface AggregateOptions {
  projectPath?: string;
  since?: string; // YYYY-MM-DD
  format?: 'table' | 'json' | 'markdown';
}
