import { Hono } from 'hono';
import { readNight } from './digest/index.js';
import { loadConfig, type RigConfig } from './config.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestPage } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  // One loader for the page and the JSON, so they never disagree (ADR 0001).
  const loadNight = (night: string) => readNight(config.runsDir, night);

  app.get('/digest/:night', async (c) => {
    const night = c.req.param('night');
    const digest = await loadNight(night);
    if (!digest) return c.text('no such night', 404);
    return c.html(
      <Layout title={`digest ${night}`} lane={lane()}>
        <DigestPage night={night} digest={digest} />
      </Layout>,
    );
  });

  app.get('/api/digest/:night', async (c) => {
    const night = c.req.param('night');
    const digest = await loadNight(night);
    if (!digest) return c.json({ error: 'no such night', night }, 404);
    return c.json({ night, rows: digest.rows, badLines: digest.badLines });
  });

  return app;
}
