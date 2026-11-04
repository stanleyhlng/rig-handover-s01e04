import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight, type DigestNight, type DigestRow } from '../src/digest/index.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function row(night: DigestNight | null, job: string): DigestRow {
  const found = night?.rows.find((r) => r.job === job);
  if (!found) throw new Error(`no row for ${job}`);
  return found;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  it('gives 5 jobs sorted by job and 1 bad line', async () => {
    const night = await readNight('runs', '2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries, last status from the latest entry', async () => {
    const night = await readNight('runs', '2026-10-28');
    expect(row(night, 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    const sync = row(night, 'lane/sync');
    expect(sync.runs).toBe(8); // the truncated last line is not counted
    expect(sync.retries).toBe(1);
    expect(sync.lastStatus).toBe('ok');
  });

  it('keeps the last error of a failed job', async () => {
    const night = await readNight('runs', '2026-10-28');
    const backup = row(night, 'notes/backup');
    expect(backup.lastStatus).toBe('fail');
    expect(backup.lastError).toBe('quota exceeded');
    expect(backup.owner).toBe('lane-07');
  });

  it('keeps a row whose owner is null', async () => {
    const night = await readNight('runs', '2026-10-28');
    expect(row(night, 'digest/render').owner).toBeNull();
  });

  it('keeps the time offset as written', async () => {
    const night = await readNight('runs', '2026-10-28');
    const rotate = row(night, 'rig/rotate-logs');
    expect(rotate.firstAt).toBe('2026-10-28T23:00:02+01:00');
    expect(rotate.lastAt).toBe('2026-10-28T23:00:02+01:00');
    expect(row(night, 'lane/sync').lastAt).toBe('2026-10-29T05:00:04+01:00');
  });
});

describe('readNight edge cases', () => {
  it('returns null when there is no file for the night', async () => {
    expect(await readNight(tmp, '2026-01-01')).toBeNull();
    expect(await readNight(join(tmp, 'missing-dir'), '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not a date', async () => {
    expect(await readNight(tmp, '../runs/2026-10-28')).toBeNull();
  });

  it('gives no rows and no bad lines for an empty file', async () => {
    writeFileSync(join(tmp, '2026-02-01.jsonl'), '');
    expect(await readNight(tmp, '2026-02-01')).toEqual({ rows: [], badLines: 0 });
  });

  it('counts lines missing or with invalid at, job or status, and never throws', async () => {
    const lines = [
      '{"at":"2026-02-02T01:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      'not json',
      '[]',
      '{"job":"a","status":"ok","owner":"x"}',
      '{"at":"yesterday","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-02-02T02:00:00+01:00","status":"ok","owner":"x"}',
      '{"at":"2026-02-02T02:00:00+01:00","job":"","status":"ok","owner":"x"}',
      '{"at":"2026-02-02T02:00:00+01:00","job":"a","owner":"x"}',
      '{"at":"2026-02-02T02:00:00+01:00","job":"a","status":"done","owner":"x"}',
      '',
    ];
    writeFileSync(join(tmp, '2026-02-02.jsonl'), lines.join('\n'));
    const night = await readNight(tmp, '2026-02-02');
    expect(night?.badLines).toBe(8);
    expect(night?.rows).toHaveLength(1);
    expect(row(night, 'a').runs).toBe(1);
  });

  it('orders entries by time, not by line, and keeps each offset', async () => {
    const lines = [
      '{"at":"2026-02-03T02:00:00+01:00","job":"b","status":"fail","owner":"x","error":"boom"}',
      '{"at":"2026-02-03T00:30:00Z","job":"b","status":"retry","owner":"x","error":"slow"}',
    ];
    writeFileSync(join(tmp, '2026-02-03.jsonl'), lines.join('\n') + '\n');
    const b = row(await readNight(tmp, '2026-02-03'), 'b');
    // 00:30Z is 01:30+01:00: earlier than 02:00+01:00
    expect(b.firstAt).toBe('2026-02-03T00:30:00Z');
    expect(b.lastAt).toBe('2026-02-03T02:00:00+01:00');
    expect(b.lastStatus).toBe('fail');
    expect(b.lastError).toBe('boom');
    expect(b.retries).toBe(1);
  });
});
