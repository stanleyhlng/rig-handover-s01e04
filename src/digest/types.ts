// One row per job in a night's run log (runs/<night>.jsonl).
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number; // all entries for the job
  retries: number; // entries with status "retry"
  lastStatus: 'ok' | 'retry' | 'fail';
  lastError: string | null;
  firstAt: string; // as written in the log, offset included
  lastAt: string; // as written in the log, offset included
};

export type DigestNight = {
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that did not parse; counted, never thrown
};

// readNight(runsDir, night): Promise<DigestNight | null>
// null = no file for that night (the page returns 404).
// An empty file gives { rows: [], badLines: 0 }.
// Implemented in ./read.ts; re-exported here so imports from types.ts keep working.
export { readNight } from './read.js';
