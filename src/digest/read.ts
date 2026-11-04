import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DigestNight, DigestRow } from './types.js';

type Status = DigestRow['lastStatus'];

// One parsed line of runs/<night>.jsonl.
type Entry = {
  at: string; // as written, offset included
  instant: number; // ms since epoch, for ordering only
  job: string;
  status: Status;
  owner: string | null;
  error: string | null;
};

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
// ISO 8601 date-time with an explicit offset (Z or ±hh:mm).
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const STATUSES: readonly string[] = ['ok', 'retry', 'fail'] satisfies Status[];

function isStatus(v: unknown): v is Status {
  return typeof v === 'string' && STATUSES.includes(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Parse one line at the edge. null = bad line (counted by the caller).
function parseLine(line: string): Entry | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  const { at, job, status, owner, error } = value;
  if (typeof at !== 'string' || !AT.test(at)) return null;
  const instant = Date.parse(at);
  if (Number.isNaN(instant)) return null;
  if (typeof job !== 'string' || job.trim() === '') return null;
  if (!isStatus(status)) return null;

  return {
    at,
    instant,
    job,
    status,
    owner: typeof owner === 'string' ? owner : null,
    error: typeof error === 'string' ? error : null,
  };
}

// Fold a night's entries into one row per job, sorted by job.
function digest(entries: Entry[]): DigestRow[] {
  const byJob = new Map<string, { first: Entry; last: Entry; runs: number; retries: number }>();
  for (const e of entries) {
    const acc = byJob.get(e.job);
    if (!acc) {
      byJob.set(e.job, { first: e, last: e, runs: 1, retries: e.status === 'retry' ? 1 : 0 });
      continue;
    }
    acc.runs += 1;
    if (e.status === 'retry') acc.retries += 1;
    if (e.instant < acc.first.instant) acc.first = e;
    // Ties keep file order: a later line at the same instant is the latest entry.
    if (e.instant >= acc.last.instant) acc.last = e;
  }

  return [...byJob.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([job, { first, last, runs, retries }]) => ({
      job,
      owner: last.owner,
      runs,
      retries,
      lastStatus: last.status,
      lastError: last.error,
      firstAt: first.at,
      lastAt: last.at,
    }));
}

// null = no file for that night (or a night that isn't a YYYY-MM-DD name).
// An empty file gives { rows: [], badLines: 0 }. Bad lines are counted, never thrown.
export async function readNight(runsDir: string, night: string): Promise<DigestNight | null> {
  if (!NIGHT.test(night)) return null;

  let text: string;
  try {
    text = await readFile(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    const code = isRecord(err) ? err.code : undefined;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw err;
  }

  const entries: Entry[] = [];
  let badLines = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue; // blank lines (and the trailing newline) are not entries
    const entry = parseLine(line);
    if (entry) entries.push(entry);
    else badLines += 1;
  }

  return { rows: digest(entries), badLines };
}
