/**
 * Development server for CtxMap Dashboard
 * Generates data.json and starts Vite dev server
 */

import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { MassAggregation, AggregateOptions } from '../core/types.js';
import { aggregateAllSessions } from '../core/aggregation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Start the dashboard server
 */
export async function startServer(port: number, options: AggregateOptions = {}): Promise<void> {
  // Run aggregation at startup
  console.error('Loading session data...');
  let aggregationData: MassAggregation;

  try {
    aggregationData = await aggregateAllSessions(options);
    console.error(`Loaded ${aggregationData.totalSessions} sessions`);
  } catch (err) {
    console.error('Failed to load session data:', err);
    aggregationData = getEmptyAggregation();
  }

  // Write data.json to src/web/public for Vite to serve
  const publicDir = join(__dirname, '../../src/web/public');
  const dataPath = join(publicDir, 'data.json');

  try {
    await mkdir(publicDir, { recursive: true });
    await writeFile(dataPath, JSON.stringify(aggregationData, null, 2));
    console.error(`Generated data.json`);
  } catch (err) {
    console.error('Failed to write data.json:', err);
  }

  // Start Vite dev server
  console.error(`Starting dashboard at http://localhost:${port}`);

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
