import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Counts are over log entries by status (not per job). counts = null: the file couldn't be read.
export type NightCounts = { ok: number; retry: number; fail: number };
export type NightSummary = { night: string; counts: NightCounts | null };

// ISO 8601 date-time with an explicit offset, same rule as the digest reader.
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

// Tolerant like readNight: a line counts only if the digest would count it; bad lines are
// skipped, never thrown. An unreadable file gives null.
export function countNight(runsDir: string, night: string): NightCounts | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    let v: unknown;
    try {
      v = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof v !== 'object' || v === null || Array.isArray(v)) continue;
    const { at, job, status } = v as Record<string, unknown>;
    if (typeof at !== 'string' || !AT.test(at) || Number.isNaN(Date.parse(at))) continue;
    if (typeof job !== 'string' || job.trim() === '') continue;
    if (status === 'ok' || status === 'retry' || status === 'fail') counts[status] += 1;
  }
  return counts;
}

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((night) => ({ night, counts: countNight(config.runsDir, night) })),
  };
}
