#!/usr/bin/env node

/**
 * CtxMap CLI
 * Command-line interface for Claude Code token usage analysis
 */

import { Command } from 'commander';
import {
  listSessions,
  findLatestSession,
  findSession,
  parseJsonlFile,
  parseTurns,
  getSessionMetadata,
  loadSubagentTurns,
} from '../core/parser.js';
import { generateReport } from '../core/attribution.js';
import { aggregateAllSessions } from '../core/aggregation.js';
import { writeReport } from './report.js';
import {
  formatReport,
  formatSessionList,
  formatComparison,
  formatJson,
  formatMarkdown,
  formatTurnByTurn,
  formatSizeReport,
  formatMassAggregation,
  formatMassAggregationJson,
  formatMassAggregationMarkdown,
} from './formatters.js';

const program = new Command();

program
  .name('ctxmap')
  .description('Claude Code token usage analysis and visualization')
  .version('0.1.0');

// Analyze command
program
  .command('analyze')
  .description('Analyze token usage for a session')
  .option('-s, --session <id>', 'Session ID to analyze')
  .option('-l, --latest', 'Analyze the latest session')
  .option('-p, --project <path>', 'Project path to search for sessions')
  .option('-f, --format <format>', 'Output format (table, json, markdown)', 'table')
  .option('-t, --top <n>', 'Number of top consumers to show', '10')
  .option('--by-size', 'Show size-based aggregation instead of token deltas')
  .action(async (options) => {
    try {
      let sessionFile: string | null = null;
      let projectPath = '';

      if (options.session) {
        const found = await findSession(options.session);
        if (!found) {
          console.error(`Session not found: ${options.session}`);
          process.exit(1);
        }
        sessionFile = found.filePath;
        projectPath = found.projectPath;
      } else if (options.latest) {
        sessionFile = await findLatestSession(options.project);
        if (!sessionFile) {
          console.error('No sessions found');
          process.exit(1);
        }
        // Extract project path from file path
        const parts = sessionFile.split(/[/\\]/);
        const projectsIdx = parts.findIndex(p => p === 'projects');
        if (projectsIdx >= 0 && projectsIdx + 1 < parts.length) {
          projectPath = parts[projectsIdx + 1];
        }
      } else {
        // Default to latest
        sessionFile = await findLatestSession(options.project);
        if (!sessionFile) {
          console.error('No sessions found. Run some Claude Code sessions first.');
          process.exit(1);
        }
        const parts = sessionFile.split(/[/\\]/);
        const projectsIdx = parts.findIndex(p => p === 'projects');
        if (projectsIdx >= 0 && projectsIdx + 1 < parts.length) {
          projectPath = parts[projectsIdx + 1];
        }
      }

      console.error(`Analyzing: ${sessionFile}`);

      // Parse and analyze
      const entries = await parseJsonlFile(sessionFile);
      const turns = parseTurns(entries);

      if (turns.length === 0) {
        console.error('No turns with usage data found in this session.');
        process.exit(0);
      }

      const metadata = getSessionMetadata(entries);
      const { turns: subagentTurns, count: subagentCount } = await loadSubagentTurns(sessionFile);
      const report = generateReport(metadata.sessionId, projectPath, turns, subagentTurns, subagentCount);

      // Output in requested format
      switch (options.format) {
        case 'json':
          console.log(formatJson(report));
          break;
        case 'markdown':
          console.log(formatMarkdown(report));
          break;
        case 'turns':
          console.log(formatTurnByTurn(report));
          break;
        default:
          // Check for --by-size flag
          if (options.bySize) {
            console.log(formatSizeReport(report));
          } else {
            console.log(formatReport(report));
          }
      }
    } catch (error) {
      console.error('Error analyzing session:', error);
      process.exit(1);
    }
  });

// Turns command - full turn-by-turn breakdown
program
  .command('turns')
  .description('Show turn-by-turn breakdown of a session (like Chrome DevTools timeline)')
  .option('-s, --session <id>', 'Session ID to analyze')
  .option('-l, --latest', 'Analyze the latest session')
  .option('-p, --project <path>', 'Project path to search for sessions')
  .action(async (options) => {
    try {
      let sessionFile: string | null = null;
      let projectPath = '';

      if (options.session) {
        const found = await findSession(options.session);
        if (!found) {
          console.error(`Session not found: ${options.session}`);
          process.exit(1);
        }
        sessionFile = found.filePath;
        projectPath = found.projectPath;
      } else {
        sessionFile = await findLatestSession(options.project);
        if (!sessionFile) {
          console.error('No sessions found.');
          process.exit(1);
        }
        const parts = sessionFile.split(/[/\\]/);
        const projectsIdx = parts.findIndex(p => p === 'projects');
        if (projectsIdx >= 0 && projectsIdx + 1 < parts.length) {
          projectPath = parts[projectsIdx + 1];
        }
      }

      console.error(`Analyzing: ${sessionFile}`);

      const entries = await parseJsonlFile(sessionFile);
      const turns = parseTurns(entries);

      if (turns.length === 0) {
        console.error('No turns with usage data found.');
        process.exit(0);
      }

      const metadata = getSessionMetadata(entries);
      const { turns: subagentTurns, count: subagentCount } = await loadSubagentTurns(sessionFile);
      const report = generateReport(metadata.sessionId, projectPath, turns, subagentTurns, subagentCount);

      console.log(formatTurnByTurn(report));
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Sessions command
program
  .command('sessions')
  .description('List all available sessions')
  .option('-p, --project <path>', 'Filter by project path')
  .action(async (options) => {
    try {
      let sessions = await listSessions();

      if (options.project) {
        const normalized = options.project.replace(/[\\/:]/g, '-');
        sessions = sessions.filter(s =>
          s.projectPath === normalized || s.projectPath === options.project
        );
      }

      if (sessions.length === 0) {
        console.log('No sessions found.');
        return;
      }

      console.log(formatSessionList(sessions));
    } catch (error) {
      console.error('Error listing sessions:', error);
      process.exit(1);
    }
  });

// Compare command
program
  .command('compare')
  .description('Compare token usage across multiple sessions')
  .option('-s, --sessions <ids>', 'Comma-separated session IDs to compare')
  .option('-l, --latest <n>', 'Compare the latest N sessions', '3')
  .action(async (options) => {
    try {
      let sessionIds: string[] = [];

      if (options.sessions) {
        sessionIds = options.sessions.split(',').map((s: string) => s.trim());
      } else {
        // Get latest N sessions
        const sessions = await listSessions();
        const n = parseInt(options.latest, 10) || 3;
        sessionIds = sessions.slice(0, n).map(s => s.sessionId);
      }

      if (sessionIds.length === 0) {
        console.error('No sessions to compare');
        process.exit(1);
      }

      const reports = [];

      for (const id of sessionIds) {
        const found = await findSession(id);
        if (!found) {
          console.error(`Session not found: ${id}`);
          continue;
        }

        const entries = await parseJsonlFile(found.filePath);
        const turns = parseTurns(entries);

        if (turns.length > 0) {
          const metadata = getSessionMetadata(entries);
          const { turns: subagentTurns, count: subagentCount } = await loadSubagentTurns(found.filePath);
          const report = generateReport(metadata.sessionId, found.projectPath, turns, subagentTurns, subagentCount);
          reports.push(report);
        }
      }

      if (reports.length === 0) {
        console.error('No valid sessions to compare');
        process.exit(1);
      }

      console.log(formatComparison(reports));
    } catch (error) {
      console.error('Error comparing sessions:', error);
      process.exit(1);
    }
  });

// Aggregate command
program
  .command('aggregate')
  .description('Aggregate all sessions and find patterns')
  .option('-p, --project <path>', 'Filter to specific project (substring match)')
  .option('--since <date>', 'Only include sessions since date (YYYY-MM-DD)')
  .option('-f, --format <format>', 'Output format (table, json, markdown)', 'table')
  .action(async (options) => {
    try {
      console.error('Aggregating sessions...');
      const aggregation = await aggregateAllSessions({
        projectPath: options.project,
        since: options.since,
        format: options.format,
      });

      switch (options.format) {
        case 'json':
          console.log(formatMassAggregationJson(aggregation));
          break;
        case 'markdown':
          console.log(formatMassAggregationMarkdown(aggregation));
          break;
        default:
          console.log(formatMassAggregation(aggregation));
      }
    } catch (error) {
      console.error('Error aggregating sessions:', error);
      process.exit(1);
    }
  });

// Report command - write a single self-contained HTML report for one session
program
  .command('report')
  .description('Write a single self-contained HTML report for a session (no server)')
  .option('-s, --session <id>', 'Session ID to report on')
  .option('-l, --latest', 'Report on the latest session (default)')
  .option('-p, --project <path>', 'Latest session within a project')
  .option('--input <file>', 'Analyze a specific transcript .jsonl file directly')
  .option('-o, --output <path>', 'Output HTML path', 'ctxmap-report.html')
  .option('--open', 'Open the report in the default browser after writing')
  .option('--no-subagents', 'Exclude subagent transcripts from the totals')
  .option('--json <path>', 'Also write the raw ReportEnvelope JSON to this path')
  .action(async (options) => {
    try {
      const { outPath, envelope } = await writeReport({
        session: options.session,
        project: options.project,
        input: options.input,
        output: options.output,
        open: options.open,
        subagents: options.subagents, // commander sets false for --no-subagents
        json: options.json,
      });
      const r = envelope.data as import('../core/types.js').SessionReport;
      const cost = `$${r.estimatedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      console.error(`✓ wrote ${outPath}  (session ${r.sessionId.slice(0, 8)} · ${r.totalTurns} turns · ${cost})`);
      if (!options.open) console.error(`  open it → open "${outPath}"`);
    } catch (error) {
      console.error('Error writing report:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Parse and run
program.parse();
