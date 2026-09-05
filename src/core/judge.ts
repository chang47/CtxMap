/**
 * LLM-as-judge for benchmarking quality (opt-in).
 *
 * The benchmark's quality axis (👍/👌/👎) is the one thing a transcript can't give
 * us. This module prepares an automated judge: it extracts the task and the final
 * result from a session transcript and builds a rubric prompt, then parses the
 * judge's verdict. The actual API call lives in the CLI `judge` command (dynamic
 * import of the Anthropic SDK) so the read-only core never pulls in the SDK and
 * never makes network calls on its own.
 */

import type { JsonlEntry, BenchRating } from './types.js';

export interface JudgeInput {
  task: string;        // the first substantive user prompt
  finalOutput: string; // the last assistant text turn(s)
}

const MAX_TASK = 4_000;   // chars — keep the judge prompt bounded
const MAX_OUTPUT = 8_000;

function clip(s: string, max: number): string {
  s = s.trim();
  return s.length > max ? s.slice(0, max) + '\n…[truncated]' : s;
}

/** Pull a user message's text out of an entry, skipping tool results/meta. */
function userText(entry: JsonlEntry): string | undefined {
  if (entry.type !== 'user' || !entry.message || entry.message.role !== 'user') return undefined;
  const content = entry.message.content;
  if (typeof content === 'string') {
    if (content.startsWith('<') || content.includes('[Request interrupted')) return undefined;
    return content;
  }
  for (const item of content) {
    if (item.type === 'text' && !item.text.includes('[Request interrupted')) return item.text;
  }
  return undefined;
}

/** Pull an assistant message's text out of an entry. */
function assistantText(entry: JsonlEntry): string | undefined {
  if (entry.type !== 'assistant' || !entry.message || entry.message.role !== 'assistant') return undefined;
  const content = entry.message.content;
  if (!Array.isArray(content)) return undefined;
  const texts = content.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text);
  return texts.length ? texts.join('\n') : undefined;
}

/**
 * Extract the task (first real user prompt) and the final output (last assistant
 * text turn) from a transcript — the two things the judge needs.
 */
export function extractJudgeInput(entries: JsonlEntry[]): JudgeInput {
  let task = '';
  for (const e of entries) {
    if (e.isSidechain) continue;
    const t = userText(e);
    if (t && t.trim()) { task = t; break; }
  }
  let finalOutput = '';
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].isSidechain) continue;
    const t = assistantText(entries[i]);
    if (t && t.trim()) { finalOutput = t; break; }
  }
  return { task: clip(task, MAX_TASK), finalOutput: clip(finalOutput, MAX_OUTPUT) };
}

/** Build the judge system + user prompt from the extracted input. */
export function buildJudgePrompt(input: JudgeInput): { system: string; user: string } {
  const system =
    'You are grading how well an AI assistant handled a task, from the task and the ' +
    "assistant's final response. Judge only observable quality: did it do what was asked, " +
    'completely and correctly, without leaving the user to clean up. You cannot run code or ' +
    'see the repo — judge from the text. Reply with ONLY a JSON object: ' +
    '{"rating":"good|ok|bad","rationale":"<=160 chars"}. ' +
    'good = fully did the task well; ok = partially, or with caveats; bad = failed or wrong.';
  const user =
    `TASK (first user message):\n${input.task || '(none found)'}\n\n` +
    `ASSISTANT FINAL RESPONSE:\n${input.finalOutput || '(none found)'}\n\n` +
    'Grade it. JSON only.';
  return { system, user };
}

/**
 * Parse the judge's reply into a rating + rationale. Tolerant of surrounding
 * prose: extracts the first JSON object. Returns null if no valid rating found.
 */
export function parseJudgeResponse(text: string): { rating: BenchRating; rationale: string } | null {
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as { rating?: string; rationale?: string };
    const r = (obj.rating || '').toLowerCase().trim();
    if (r !== 'good' && r !== 'ok' && r !== 'bad') return null;
    return { rating: r as BenchRating, rationale: (obj.rationale || '').slice(0, 200) };
  } catch {
    return null;
  }
}
