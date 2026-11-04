import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});

describe('status board nights', () => {
  it('links each night to its digest with counts over log entries', async () => {
    const html = await (await createApp(config).request('/')).text();
    expect(html).toContain('href="/digest/2026-10-27"');
    expect(html).toContain('href="/digest/2026-10-28"');
    expect(html).toMatch(/2026-10-27<\/a>[^<]*ok 7 · retry 0 · fail 0/);
  });

  it('renders — for a night that cannot be read, and skips bad lines', async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'rig-'));
    writeFileSync(
      join(dir, '2026-01-01.jsonl'),
      '{"at":"2026-01-01T01:00:00+01:00","job":"a","status":"fail"}\nnot json\n{"at":"2026-01-01T02:00:00+01:00","job":"a","status":"ok"}\n',
    );
    mkdirSync(join(dir, '2026-01-02.jsonl')); // a directory: unreadable
    const html = await (await createApp({ ...config, runsDir: dir }).request('/')).text();
    expect(html).toMatch(/2026-01-01<\/a>[^<]*ok 1 · retry 0 · fail 1/);
    expect(html).toContain('href="/digest/2026-01-02"');
    expect(html).toMatch(/2026-01-02<\/a>[^<]*ok — · retry — · fail —/);
  });
});
