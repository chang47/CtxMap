/**
 * Local tag store for benchmarking.
 *
 * CtxMap only READS transcripts, so a run's workflow name and manual quality
 * rating (the one axis we can't derive from the transcript) live here instead:
 * a small JSON file keyed by sessionId. This is the exact per-run unit a hosted
 * benchmarking service would persist per user — the platform seed.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { SessionTag } from './types.js';

const STORE_DIR = path.join(os.homedir(), '.ctxmap');
const STORE_PATH = path.join(STORE_DIR, 'tags.json');

export type TagStore = Record<string, SessionTag>;

/** Load all tags. Returns {} when the store is missing or unreadable. */
export function loadTags(): TagStore {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as TagStore) : {};
  } catch {
    return {};
  }
}

/** Get the tag for one session (undefined if untagged). */
export function getTag(sessionId: string): SessionTag | undefined {
  return loadTags()[sessionId];
}

/**
 * Upsert a tag for a session: merge the given fields into any existing tag.
 * Returns the merged tag.
 */
export function upsertTag(sessionId: string, patch: SessionTag): SessionTag {
  const store = loadTags();
  const merged: SessionTag = {
    ...store[sessionId],
    ...patch,
    taggedAt: new Date().toISOString(),
  };
  store[sessionId] = merged;
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  return merged;
}

export function tagStorePath(): string {
  return STORE_PATH;
}
