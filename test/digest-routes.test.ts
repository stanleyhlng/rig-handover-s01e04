import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Routes run against a temp runs dir. runs/ is never written; the real night is copied in.
const here = dirname(fileURLToPath(import.meta.url));
const REAL_NIGHT = '2026-10-28';

let runsDir: string;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  copyFileSync(join(here, '..', 'runs', `${REAL_NIGHT}.jsonl`), join(runsDir, `${REAL_NIGHT}.jsonl`));
  writeFileSync(
    join(runsDir, '2026-03-02.jsonl'),
    '{"at":"2026-03-02T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}\n',
  );
  writeFileSync(join(runsDir, '2026-03-03.jsonl'), '');
  writeFileSync(
    join(runsDir, '2026-03-04.jsonl'),
    [
      '{"at":"2026-03-04T01:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
      'not json',
      '{"at":"2026-03-04T02:00:00+01:00","job":"notes/backup","status":"fail","owner":"lane-07","error":"quota exceeded"}',
      '',
    ].join('\n'),
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

function app() {
  return createApp({ ...config, runsDir });
}

describe('GET /digest/:night', () => {
  it('200 for a real night, with one row per job', async () => {
    const res = await app().request(`/digest/${REAL_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    expect(html).toContain(`digest ${REAL_NIGHT}`);
    expect(html).toContain('<td>fixtures/refresh</td>');
    expect(html).toContain('<td>notes/backup</td>');
    expect(html).not.toContain('nothing ran');
  });

  it('404 for a night with no file', async () => {
    const res = await app().request('/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('no such night');
  });

  it('404 for a night name that is not a date', async () => {
    const res = await app().request('/digest/..%2F2026-10-28');
    expect(res.status).toBe(404);
  });

  it('200 for the empty night and says nothing ran', async () => {
    const res = await app().request('/digest/2026-03-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('bad line');
  });

  it('200 for a night with a bad line and shows the bad-line note', async () => {
    const res = await app().request('/digest/2026-03-04');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 bad line skipped');
    expect(html).toContain('<td>notes/backup</td>');
    expect(html).toContain('quota exceeded');
  });
});

describe('GET /api/digest/:night', () => {
  it('200 for a real night, with rows and badLines', async () => {
    const res = await app().request(`/api/digest/${REAL_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
    expect(body.night).toBe(REAL_NIGHT);
    expect(body.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(body.badLines).toBe(1);
  });

  it('404 with an error body for a night with no file', async () => {
    const res = await app().request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night', night: '2026-01-01' });
  });

  it('200 with rows [] and badLines 0 for the empty night', async () => {
    const res = await app().request('/api/digest/2026-03-03');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-03-03', rows: [], badLines: 0 });
  });

  it('200 with badLines 1 for a night with a bad line', async () => {
    const res = await app().request('/api/digest/2026-03-04');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string; lastError: string | null }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync', 'notes/backup']);
    expect(body.rows[1]?.lastError).toBe('quota exceeded');
  });
});
