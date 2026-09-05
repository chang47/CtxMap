/**
 * The actionable linter (issue #1 §4).
 *
 * Descriptive reporting (where the tokens went) is table stakes. The reason to
 * run CtxMap is this: concrete, fixable findings computed from the transcript —
 * "you read this file 44×", "this Bash returned 460KB into context", "your cache
 * got invalidated at turn 312". Each finding names the fix.
 *
 * These are the transcript-computable analogues of the context-lint detectors
 * (software-factory/tools/context-lint): oversized output, repeated reads,
 * cache-busting/invalidation, dead-weight reads.
 */

import type { Turn, FileStats, ToolSizeStats, Finding, ModelPricing } from './types.js';

// Thresholds (deliberately conservative to avoid noisy, low-value findings).
const OVERSIZED_BYTES = 50_000;        // a single tool result this big is worth flagging
const OVERSIZED_HIGH_BYTES = 150_000;  // …and this big is a high-severity flag
const REPEAT_MIN_COUNT = 3;            // read the same file N+ times
const REPEAT_MIN_AVG_TOKENS = 2_000;   // …and it's non-trivial in size
const HOT_CHURN_MIN = 15;              // edit+write a single file this many times
const CACHE_MIN_CREATION = 20_000;     // cache re-created this much in one turn
const CACHE_MIN_USD = 0.5;             // …and only flag if the extra cost is meaningful
const DEADWEIGHT_MIN_BYTES = 40_000;   // a single large read, loaded once

const BYTES_PER_TOKEN = 4; // rough bytes→tokens for size→token estimates

function usd(tokens: number, ratePerMillion: number): number {
  return (tokens / 1_000_000) * ratePerMillion;
}

export interface FindingsInput {
  turns: Turn[];
  fileStats: FileStats[];
  toolSizeStats: ToolSizeStats[];
  pricing: ModelPricing;
}

/**
 * Compute the ranked findings for a session. Ordered high → low severity, then
 * by estimated wasted tokens.
 */
export function computeFindings(input: FindingsInput): Finding[] {
  const { turns, fileStats, toolSizeStats, pricing } = input;
  const findings: Finding[] = [];

  // 1. Oversized tool output — a single result that dumped a lot into context.
  //    Uses per-file sizeBytes from toolSizeStats (biggest single identifier per tool).
  for (const tool of toolSizeStats) {
    for (const f of tool.files) {
      const perCall = f.count > 0 ? f.sizeBytes / f.count : f.sizeBytes;
      if (perCall < OVERSIZED_BYTES) continue;
      const kb = Math.round(perCall / 1024);
      const estTokens = Math.round(perCall / BYTES_PER_TOKEN);
      // A single big-but-not-huge read is often a legitimate, necessary load — flag
      // it low. Escalate when it's genuinely huge, or repeated (repetition = the
      // waste, since each occurrence re-enters context).
      let severity: 'high' | 'medium' | 'low';
      if (perCall >= OVERSIZED_HIGH_BYTES || f.count >= 3) severity = 'high';
      else if (f.count >= 2) severity = 'medium';
      else severity = 'low';
      findings.push({
        rule: 'oversized-output',
        severity,
        title: `${tool.toolName} ${shortPath(f.path)} ~${kb}KB${f.count > 1 ? ` ×${f.count}` : ''}`,
        detail: `${tool.toolName} "${f.path}" put ~${kb}KB (~${estTokens.toLocaleString()} tokens) into context${f.count > 1 ? ` and did so ${f.count} times` : ''}. That payload rides along in context every turn after until compaction.`,
        fix:
          tool.toolName === 'Bash'
            ? 'Pipe the command through head/tail/grep so only the part you need enters context.'
            : 'Read a range or the specific section instead of the whole file.',
        wastedTokens: estTokens * Math.max(1, f.count),
        file: f.path,
      });
    }
  }

  // 2. Hot file — one file touched many times across Read/Edit/Write. Repeated
  //    large READS are wasteful (each reload re-enters context); heavy EDIT/WRITE
  //    churn is real context load worth surfacing even though it isn't pure waste.
  const perFile = new Map<string, { reads: number; edits: number; writes: number; avgReadTokens: number }>();
  for (const fs of fileStats) {
    const e = perFile.get(fs.filePath) ?? { reads: 0, edits: 0, writes: 0, avgReadTokens: 0 };
    if (fs.toolName === 'Read') { e.reads += fs.count; e.avgReadTokens = Math.max(e.avgReadTokens, fs.avgTokens); }
    else if (fs.toolName === 'Edit') e.edits += fs.count;
    else if (fs.toolName === 'Write') e.writes += fs.count;
    perFile.set(fs.filePath, e);
  }
  for (const [file, e] of perFile) {
    const touches = e.reads + e.edits + e.writes;
    const churn = e.edits + e.writes;
    const redundant =
      e.reads >= REPEAT_MIN_COUNT && e.avgReadTokens >= REPEAT_MIN_AVG_TOKENS
        ? (e.reads - 1) * e.avgReadTokens
        : 0;
    const heavyReads = redundant > 0;
    const heavyChurn = churn >= HOT_CHURN_MIN;
    if (!heavyReads && !heavyChurn) continue;

    const breakdown = `${e.reads}R/${e.edits}E/${e.writes}W`;
    let severity: 'high' | 'medium' | 'low';
    let fix: string;
    if (heavyReads) {
      severity = redundant >= 50_000 ? 'high' : 'medium';
      fix = 'Read it once and refer back, or narrow to the section you need — repeated full reads pile up in context.';
    } else {
      severity = churn >= HOT_CHURN_MIN * 3 ? 'medium' : 'low';
      fix = 'Heavy edit/write churn on one file — each operation and its result ride in context. If you keep rewriting the same regions, prefer fewer, larger edits.';
    }
    findings.push({
      rule: 'hot-file',
      severity,
      title: `Churned ${shortPath(file)} ${touches}× (${breakdown})`,
      detail: heavyReads
        ? `Read ${e.reads}× (~${Math.round(e.avgReadTokens).toLocaleString()} tokens each) plus ${churn} edit/write${churn === 1 ? '' : 's'}; ~${Math.round(redundant).toLocaleString()} tokens are redundant reloads.`
        : `Touched ${touches} times (${breakdown}). That's a lot of activity on one file — the operations and their results accumulate in context.`,
      fix,
      wastedTokens: heavyReads ? Math.round(redundant) : undefined,
      wastedUsd: heavyReads ? usd(redundant, pricing.input) : undefined,
      file,
    });
  }

  // 3. Cache re-creation — collapse ALL re-creation events into ONE session-level
  //    finding. A single event (large cache_creation while cache_read collapses,
  //    with no compaction) is expected right after a compaction or a 5-min cache
  //    TTL expiry, so per-turn flags are noise. But when it recurs across a
  //    session it is real, repeated cost worth surfacing once.
  let recreationEvents = 0;
  let recreationTokens = 0;
  for (let i = 2; i < turns.length; i++) {
    const cur = turns[i];
    const prev = turns[i - 1];
    const created = cur.usage.cache_creation_input_tokens || 0;
    const curRead = cur.usage.cache_read_input_tokens || 0;
    const prevRead = prev.usage.cache_read_input_tokens || 0;
    const compactedHere = cur.contextTokens < prev.contextTokens * 0.5;
    if (created >= CACHE_MIN_CREATION && !compactedHere && prevRead > 0 && curRead < prevRead * 0.5) {
      recreationEvents++;
      recreationTokens += created;
    }
  }
  // Discount the expected once-per-compaction rebuild: only the events beyond the
  // number of compactions are "extra" re-creations worth flagging.
  const extraEvents = recreationEvents; // count of qualifying events (compaction turns already excluded)
  const recreationUsd = usd(recreationTokens, pricing.cacheCreation - pricing.cacheRead);
  if (extraEvents >= 3 && recreationTokens >= CACHE_MIN_CREATION && recreationUsd >= CACHE_MIN_USD) {
    const wastedUsd = recreationUsd;
    findings.push({
      rule: 'cache-recreation',
      severity: extraEvents >= 8 ? 'high' : 'medium',
      title: `Cache re-created ${extraEvents}× (~${Math.round(recreationTokens / 1000)}K tokens)`,
      detail: `The cached prefix was re-written ${extraEvents} times across the session (~${Math.round(recreationTokens / 1000)}K tokens total), each billed at cache-write (~1.25× input) instead of cache-read (~0.1×). This happens when a long gap lets the 5-minute cache expire, or when something volatile in the prefix keeps changing.`,
      fix: 'For long-running / gappy agents, use the 1-hour cache TTL so the prefix survives idle gaps; and keep volatile content (timestamps, UUIDs, counters) out of the stable prefix.',
      wastedTokens: recreationTokens,
      wastedUsd,
    });
  }

  // 4. Dead-weight read — one big read, loaded once (candidate unused ballast).
  for (const tool of toolSizeStats) {
    if (tool.toolName !== 'Read') continue;
    for (const f of tool.files) {
      if (f.count !== 1 || f.sizeBytes < DEADWEIGHT_MIN_BYTES) continue;
      // Skip if already flagged as oversized (avoid double-listing the same file).
      if (f.sizeBytes >= OVERSIZED_BYTES) continue;
      const kb = Math.round(f.sizeBytes / 1024);
      findings.push({
        rule: 'dead-weight-read',
        severity: 'low',
        title: `Loaded ${shortPath(f.path)} once (~${kb}KB)`,
        detail: `A single ~${kb}KB read that entered context and stays there for the rest of the session. If it wasn't needed after the moment you read it, it's dead weight.`,
        fix: 'If you only needed part of it, read a range; large one-shot reads persist in context to the next compaction.',
        wastedTokens: Math.round(f.sizeBytes / BYTES_PER_TOKEN),
        file: f.path,
      });
    }
  }

  const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return findings.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || (b.wastedTokens ?? 0) - (a.wastedTokens ?? 0)
  );
}

function shortPath(p: string): string {
  const parts = p.split(/[/\\]/);
  return parts.length <= 2 ? p : parts.slice(-2).join('/');
}
