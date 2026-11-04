import type { DigestNight, DigestRow } from '../digest/index.js';

// A row is flagged when it retried 3+ times or its last status is fail. The flag is text, not
// only colour, so a screenshot or an agent's fetch shows the same thing.
function flags(row: DigestRow): string[] {
  const out: string[] = [];
  if (row.lastStatus === 'fail') out.push('FAIL');
  if (row.retries >= 3) out.push('RETRIES >= 3');
  return out;
}

export function DigestPage({ night, digest }: { night: string; digest: DigestNight }) {
  return (
    <>
      <h1>digest {night}</h1>
      {digest.badLines > 0 ? (
        <p class="warn">
          {digest.badLines} bad {digest.badLines === 1 ? 'line' : 'lines'} skipped
        </p>
      ) : null}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first at</th>
              <th>last at</th>
              <th>flag</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => {
              const marked = flags(row);
              return (
                <tr>
                  <td>{row.job}</td>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{row.lastError ?? '—'}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                  <td>{marked.length > 0 ? <span class="warn">{marked.join(' · ')}</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
