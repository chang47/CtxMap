/**
 * JSONL Transcript Parser
 * Reads and parses Claude Code session transcript files
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type {
  JsonlEntry,
  AssistantMessage,
  Turn,
  ToolCall,
  Usage,
} from './types.js';

const CLAUDE_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '', '.claude');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');

/**
 * Get the Claude projects directory
 */
export function getClaudeProjectsDir(): string {
  return PROJECTS_DIR;
}

/**
 * List all available sessions across all projects
 */
export async function listSessions(): Promise<Array<{ sessionId: string; projectPath: string; filePath: string; timestamp: Date }>> {
  const sessions: Array<{ sessionId: string; projectPath: string; filePath: string; timestamp: Date }> = [];

  const projectDirs = await glob('*/', {
    cwd: PROJECTS_DIR,
  });

  for (const projectDir of projectDirs) {
    // Remove trailing slash from directory name
    const dirName = projectDir.replace(/[/\\]$/, '');
    const jsonlFiles = await glob('*.jsonl', {
      cwd: path.join(PROJECTS_DIR, dirName),
      absolute: true,
    });

    for (const file of jsonlFiles) {
      const stat = await fs.promises.stat(file);
      const sessionId = path.basename(file, '.jsonl');
      sessions.push({
        sessionId,
        projectPath: dirName,
        filePath: file,
        timestamp: stat.mtime,
      });
    }
  }

  // Sort by timestamp descending (most recent first)
  sessions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return sessions;
}

/**
 * Find the latest session file
 */
export async function findLatestSession(projectPath?: string): Promise<string | null> {
  const sessions = await listSessions();

  if (projectPath) {
    // Normalize project path to match directory format
    const normalizedProject = projectPath.replace(/[\\/:]/g, '-');
    const filtered = sessions.filter(s =>
      s.projectPath === normalizedProject || s.projectPath === projectPath
    );
    return filtered.length > 0 ? filtered[0].filePath : null;
  }

  return sessions.length > 0 ? sessions[0].filePath : null;
}

/**
 * Find a specific session by ID
 */
export async function findSession(sessionId: string): Promise<{ filePath: string; projectPath: string } | null> {
  const sessions = await listSessions();
  const match = sessions.find(s =>
    s.sessionId === sessionId || s.sessionId.startsWith(sessionId)
  );
  return match ? { filePath: match.filePath, projectPath: match.projectPath } : null;
}

/**
 * Parse a JSONL file into entries
 */
export async function parseJsonlFile(filePath: string): Promise<JsonlEntry[]> {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const entries: JsonlEntry[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as JsonlEntry;
      entries.push(entry);
    } catch (e) {
      // Skip malformed lines
      console.warn(`Skipping malformed JSONL line: ${line.substring(0, 100)}...`);
    }
  }

  return entries;
}

/**
 * Get the first non-tool text content from a message
 */
function getTextContent(message: AssistantMessage): string | null {
  for (const content of message.content) {
    if (content.type === 'text') {
      return content.text;
    }
  }
  return null;
}

/**
 * Extract tool call from assistant message
 */
function extractToolCall(message: AssistantMessage): ToolCall | null {
  for (const content of message.content) {
    if (content.type === 'tool_use') {
      return {
        toolId: content.id,
        toolName: content.name,
        input: content.input,
        isError: false,
      };
    }
  }
  return null;
}

/**
 * Find tool result for a given tool use ID from user entries
 */
function findToolResult(
  toolUseId: string,
  entries: JsonlEntry[],
  startIndex: number
): string | undefined {
  for (let i = startIndex; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.type === 'user' && entry.message?.role === 'user') {
      const content = entry.message.content;
      // Skip if content is a string (not tool results)
      if (typeof content === 'string') continue;

      for (const item of content) {
        if (typeof item === 'object' && item.type === 'tool_result' && item.tool_use_id === toolUseId) {
          return item.content;
        }
      }
    }
  }
  return undefined;
}

/**
 * Calculate total context tokens from usage
 */
function calculateContextTokens(usage: Usage): number {
  return (
    usage.input_tokens +
    (usage.cache_creation_input_tokens || 0) +
    (usage.cache_read_input_tokens || 0)
  );
}

/**
 * Extract text from user message content
 * Handles both string and array content formats
 */
function extractUserText(entry: JsonlEntry): string | undefined {
  if (entry.type !== 'user' || !entry.message || entry.message.role !== 'user') {
    return undefined;
  }

  const content = entry.message.content;

  // Handle string content (direct text)
  if (typeof content === 'string') {
    // Filter out system/meta messages
    if (content.startsWith('<local-command-') ||
        content.startsWith('<command-name>') ||
        content.includes('[Request interrupted by user]')) {
      return undefined;
    }
    return content;
  }

  // Handle array content
  for (const item of content) {
    if (item.type === 'text') {
      // Filter out system messages
      if (item.text.includes('[Request interrupted by user]')) {
        return undefined;
      }
      return item.text;
    }
  }
  return undefined;
}

/**
 * Find the most recent user message with text content
 */
function findUserPrompt(entries: JsonlEntry[], startIndex: number): string | undefined {
  for (let i = startIndex - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.isSidechain) continue;

    const text = extractUserText(entry);
    if (text) {
      return text;
    }

    // Stop if we hit another assistant message (that's a different conversation turn)
    if (entry.type === 'assistant') {
      break;
    }
  }
  return undefined;
}

/**
 * Parse entries into turns with token attribution
 */
export function parseTurns(entries: JsonlEntry[]): Turn[] {
  const turns: Turn[] = [];
  let turnIndex = 0;
  let previousContext = 0;
  let lastUserPrompt: string | undefined;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Skip non-assistant entries, sidechain, or entries without usage
    if (
      entry.type !== 'assistant' ||
      entry.isSidechain ||
      !entry.message ||
      entry.message.role !== 'assistant' ||
      !entry.message.usage
    ) {
      continue;
    }

    const message = entry.message as AssistantMessage;
    // We've already checked that usage exists above
    const usage = message.usage!;
    const contextTokens = calculateContextTokens(usage);
    const tokenDelta = previousContext > 0 ? contextTokens - previousContext : contextTokens;

    // Extract tool call
    const toolCall = extractToolCall(message);

    // Find tool result for context
    let resultSize: number | undefined;
    if (toolCall) {
      const result = findToolResult(toolCall.toolId, entries, i + 1);
      if (result) {
        toolCall.result = result;
        resultSize = result.length; // Store size in bytes
      }
    }

    // Find the user prompt that triggered this turn
    const userPrompt = findUserPrompt(entries, i);

    const turn: Turn = {
      turnIndex,
      timestamp: entry.timestamp,
      toolCall,
      usage,
      contextTokens,
      tokenDelta,
      outputTokens: usage.output_tokens,
      userPrompt,
      resultSize,
    };

    turns.push(turn);
    previousContext = contextTokens;
    turnIndex++;
  }

  return turns;
}

/**
 * Get session metadata from entries
 */
export function getSessionMetadata(
  entries: JsonlEntry[]
): { sessionId: string; startTimestamp: string; endTimestamp: string } {
  // Find first entry with a sessionId (not all entry types have it)
  const firstWithSessionId = entries.find(e => e.sessionId);
  const lastWithSessionId = [...entries].reverse().find(e => e.sessionId);

  // Find first/last entry with a timestamp
  const firstWithTimestamp = entries.find(e => e.timestamp);
  const lastWithTimestamp = [...entries].reverse().find(e => e.timestamp);

  return {
    sessionId: firstWithSessionId?.sessionId || '',
    startTimestamp: firstWithTimestamp?.timestamp || '',
    endTimestamp: lastWithTimestamp?.timestamp || '',
  };
}

/**
 * Format a description for a tool call (for display)
 */
export function formatToolDescription(toolCall: ToolCall): string {
  const { toolName, input } = toolCall;

  switch (toolName) {
    case 'Read':
      return `Read ${formatPath(input.file_path as string)}`;
    case 'Edit':
      return `Edit ${formatPath(input.file_path as string)}`;
    case 'Write':
      return `Write ${formatPath(input.file_path as string)}`;
    case 'Bash':
      return `Bash ${truncate(input.command as string, 30)}`;
    case 'Glob':
      return `Glob ${input.pattern as string}`;
    case 'Grep':
      return `Grep "${truncate(input.pattern as string, 20)}"`;
    case 'Task':
      return `Task (${input.subagent_type as string})`;
    case 'WebFetch':
      return `WebFetch ${truncate(input.url as string, 30)}`;
    case 'WebSearch':
      return `WebSearch "${truncate(input.query as string, 25)}"`;
    default:
      return `${toolName} ${truncate(JSON.stringify(input).substring(0, 30), 30)}`;
  }
}

/**
 * Format a file path for display
 */
function formatPath(filePath: string | undefined): string {
  if (!filePath) return '(unknown)';
  const parts = filePath.split(/[/\\]/);
  if (parts.length <= 2) return filePath;
  return parts.slice(-2).join('/');
}

/**
 * Truncate a string with ellipsis
 */
function truncate(str: string | undefined, maxLength: number): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}
