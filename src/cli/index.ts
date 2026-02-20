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
} from '../core/parser.js';
import { generateReport } from '../core/attribution.js';
import {
  formatReport,
  formatSessionList,
  formatComparison,
  formatJson,
  formatMarkdown,
  formatTurnByTurn,
  formatSizeReport,
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
      const report = generateReport(metadata.sessionId, projectPath, turns);

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
      const report = generateReport(metadata.sessionId, projectPath, turns);

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
          const report = generateReport(metadata.sessionId, found.projectPath, turns);
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

// Parse and run
program.parse();
