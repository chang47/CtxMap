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
}

export interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
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

export const MODEL_WINDOW = 200_000; // Claude Opus 4.6, Sonnet, Haiku all have 200K context

// Pricing rates (per 1M tokens) - Claude Opus 4.6
export const PRICING = {
  opus: {
    input: 15.0,
    output: 75.0,
    cacheCreation: 18.75,
    cacheRead: 1.50,
  },
  sonnet: {
    input: 3.0,
    output: 15.0,
    cacheCreation: 3.75,
    cacheRead: 0.30,
  },
  haiku: {
    input: 0.25,
    output: 1.25,
    cacheCreation: 0.30,
    cacheRead: 0.03,
  },
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
