/**
 * Development server for CtxMap Dashboard
 * Generates data.json and starts Vite dev server with live reload
 */

import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { watch, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import type { MassAggregation, AggregateOptions } from '../core/types.js';
import { aggregateAllSessions } from '../core/aggregation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Start the dashboard server with live reload
 */
export async function startServer(port: number, options: AggregateOptions = {}): Promise<void> {
  const publicDir = join(__dirname, '../../src/web/public');
  const dataPath = join(publicDir, 'data.json');

  // Initial data load
  await regenerateData(options, dataPath, publicDir);

  // Start file watcher for live reload
  const claudeProjectsDir = join(homedir(), '.claude', 'projects');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  if (existsSync(claudeProjectsDir)) {
    console.error(`Watching for changes in ${claudeProjectsDir}`);

    const watcher = watch(claudeProjectsDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return;

      // Only react to .jsonl file changes
      if (filename.endsWith('.jsonl')) {
        // Debounce: wait 2 seconds after last change before regenerating
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
          console.error(`\nDetected change: ${filename}`);
          await regenerateData(options, dataPath, publicDir);
        }, 2000);
      }
    });

    watcher.on('error', (err) => {
      console.error('File watcher error:', err);
    });

    process.on('SIGINT', () => {
      watcher.close();
      process.exit(0);
    });
  } else {
    console.error(`Warning: ${claudeProjectsDir} not found, live reload disabled`);
  }

  // Start Vite dev server
  console.error(`\nStarting dashboard at http://localhost:${port}`);
  console.error('Live reload enabled - data will update as you use Claude Code\n');

  const vite = spawn('npx', ['vite', '--port', String(port)], {
    stdio: 'inherit',
    shell: true,
  });

  vite.on('close', (code) => {
    process.exit(code ?? 0);
  });

  vite.on('error', (err) => {
    console.error('Failed to start Vite:', err);
    process.exit(1);
  });
}

/**
 * Regenerate data.json from all sessions
 */
async function regenerateData(
  options: AggregateOptions,
  dataPath: string,
  publicDir: string
): Promise<void> {
  try {
    const aggregationData = await aggregateAllSessions(options);

    await mkdir(publicDir, { recursive: true });
    await writeFile(dataPath, JSON.stringify(aggregationData, null, 2));

    const timestamp = new Date().toLocaleTimeString();
    console.error(`[${timestamp}] Updated data.json (${aggregationData.totalSessions} sessions)`);
  } catch (err) {
    console.error('Failed to regenerate data:', err);
  }
}

function getEmptyAggregation(): MassAggregation {
  return {
    startDate: '',
    endDate: '',
    totalSessions: 0,
    totalTurns: 0,
    projects: [],
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreation: 0,
    totalCacheRead: 0,
    totalCost: 0,
    filePatterns: [],
    fileInteractionPatterns: [],
    toolPatterns: [],
    aggregatedToolStats: [],
    insights: [],
    dailyTotals: [],
  };
}
