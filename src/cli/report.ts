/**
 * `ctxmap report` — produce a single self-contained HTML report for one session.
 *
 * Pipeline: resolve a session (or --input file) → parse → generateReport →
 * wrap in a lens-tagged ReportEnvelope → inject as window.__CTXMAP_DATA__ into
 * the pre-built single-file template (dist/report/report.html) → write one HTML
 * file. No server, no bundler, no network at runtime — just parse + inject + write.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import {
  findLatestSession,
  findSession,
  parseJsonlFile,
  parseTurns,
  getSessionMetadata,
  loadSubagentTurns,
} from '../core/parser.js';
import { generateReport } from '../core/attribution.js';
import type { ReportEnvelope, SessionReport, Turn } from '../core/types.js';

/**
 * Slim a SessionReport for embedding in the shareable HTML: derive a compact
 * per-turn context series for the chart, then drop the heavy per-turn data
 * (segment.turns carry raw tool output / file contents — large, and not safe to
 * ship in a file someone might share). All aggregated panels keep their data.
 */
function slimForReport(report: SessionReport): SessionReport {
  const contextSeries: Array<{ turn: number; context: number }> = [];
  for (const seg of report.segments) {
    for (const t of seg.turns) {
      contextSeries.push({ turn: t.turnIndex, context: t.contextTokens });
    }
  }
  const segments = report.segments.map((s) => ({ ...s, turns: [] }));

  // Trim userRequestStats: keep the heaviest 15 and truncate each prompt. The
  // raw list carries every user prompt in full (megabytes, and sensitive text
  // we should not bake into a shareable file).
  const userRequestStats = [...report.userRequestStats]
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 15)
    .map((u) => ({
      ...u,
      userPrompt: u.userPrompt.length > 120 ? u.userPrompt.slice(0, 120) + '…' : u.userPrompt,
    }));

  return { ...report, segments, contextSeries, userRequestStats };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ReportOptions {
  session?: string;
  project?: string;
  input?: string;
  output?: string;
  open?: boolean;
  subagents?: boolean; // default true; --no-subagents sets false
  json?: string;
}

/** Locate the built single-file template shipped in dist/report/. */
function templatePath(): string {
  return path.join(__dirname, '..', 'report', 'report.html');
}

/** Read the producing CtxMap version from package.json (best-effort). */
function ctxmapVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Escape a JSON string for safe embedding inside a <script> element. Prevents
 * transcript content (paths, prompts, tool output) from breaking out of the
 * script or injecting markup. U+2028/U+2029 are valid JSON but illegal in a JS
 * string literal, so they are escaped too. The pattern is built from a pure-ASCII
 * string (no literal control chars in source); the replacer emits each matched
 * char as its \uXXXX form.
 */
function escapeForScript(json: string): string {
  const pattern = new RegExp('[<>&\\u2028\\u2029]', 'g');
  return json.replace(pattern, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** Inject the envelope into the template just before </head>. */
function injectData(template: string, envelope: ReportEnvelope): string {
  const payload = escapeForScript(JSON.stringify(envelope));
  const tag = `<script>window.__CTXMAP_DATA__ = ${payload};</script>`;
  if (template.includes('</head>')) {
    return template.replace('</head>', `${tag}\n</head>`);
  }
  // Fallback: prepend to <body> if no head close is found.
  return template.replace('<body>', `<body>\n${tag}`);
}

function openInBrowser(file: string): void {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', file] : [file];
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.on('error', () => { /* opening is best-effort */ });
  child.unref();
}

/**
 * Resolve which transcript file to analyze and return its report envelope.
 */
async function buildEnvelope(options: ReportOptions): Promise<ReportEnvelope> {
  let filePath: string | null = null;
  let projectPath = '';

  if (options.input) {
    filePath = path.resolve(options.input);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Input file not found: ${filePath}`);
    }
    projectPath = path.dirname(filePath);
  } else if (options.session) {
    const found = await findSession(options.session);
    if (!found) throw new Error(`Session not found: ${options.session}`);
    filePath = found.filePath;
    projectPath = found.projectPath;
  } else {
    filePath = await findLatestSession(options.project);
    if (!filePath) throw new Error('No sessions found in ~/.claude/projects');
    projectPath = options.project ?? '';
  }

  const entries = await parseJsonlFile(filePath);
  const turns = parseTurns(entries);
  if (turns.length === 0) {
    throw new Error('No turns with usage data found in this transcript.');
  }

  const metadata = getSessionMetadata(entries);

  let subagentTurns: Turn[] = [];
  let subagentCount = 0;
  if (options.subagents !== false) {
    const sub = await loadSubagentTurns(filePath);
    subagentTurns = sub.turns;
    subagentCount = sub.count;
  }

  const report = generateReport(
    metadata.sessionId || path.basename(filePath, '.jsonl'),
    projectPath,
    turns,
    subagentTurns,
    subagentCount
  );

  return {
    kind: 'session',
    generatedAt: new Date().toISOString(),
    ctxmapVersion: ctxmapVersion(),
    data: slimForReport(report),
  };
}

/**
 * Low-level: inject a ready-made envelope into the template and write the file.
 * Shared by every lens (session, aggregate/bench, …) — the single delivery path.
 */
export function writeEnvelope(
  envelope: ReportEnvelope,
  options: { output?: string; open?: boolean; json?: string; defaultName?: string }
): string {
  const tplPath = templatePath();
  if (!fs.existsSync(tplPath)) {
    throw new Error(
      `Report template missing at ${tplPath}. Run \`npm run build:report\` (or reinstall) to build it.`
    );
  }
  const template = fs.readFileSync(tplPath, 'utf-8');
  const html = injectData(template, envelope);

  const outPath = path.resolve(options.output ?? options.defaultName ?? 'ctxmap-report.html');
  fs.writeFileSync(outPath, html, 'utf-8');

  if (options.json) {
    fs.writeFileSync(path.resolve(options.json), JSON.stringify(envelope, null, 2), 'utf-8');
  }
  if (options.open) {
    openInBrowser(outPath);
  }
  return outPath;
}

/** Also expose the version helper so other lenses can stamp envelopes. */
export function reportVersion(): string {
  return ctxmapVersion();
}

/**
 * Entry point for the `report` command. Returns the written file path plus the
 * envelope (so the caller can print a summary line).
 */
export async function writeReport(
  options: ReportOptions
): Promise<{ outPath: string; envelope: ReportEnvelope }> {
  const envelope = await buildEnvelope(options);
  const outPath = writeEnvelope(envelope, {
    output: options.output,
    open: options.open,
    json: options.json,
  });
  return { outPath, envelope };
}
