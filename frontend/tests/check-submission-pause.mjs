// Read-only HTTP probe. Does not submit, recover, or send any application.
// Supply every reachable production/alias/deployment origin, not only canonical.
const origins = process.argv.slice(2);
if (!origins.length) throw new Error('Usage: node tests/check-submission-pause.mjs https://host [https://other-host]');
const results = [];
for (const value of origins) {
  const origin = new URL(value);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') {
    throw new Error('Only HTTPS origins without credentials, paths or query strings are allowed');
  }
  for (const path of ['/api/apply', '/api/apply/check', '/api/apply/prepare', '/api/apply/recover']) {
    try {
      const response = await fetch(new URL(path, origin), { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } });
      const body = await response.json().catch(() => null);
      results.push({ origin: origin.origin, path, status: response.status, paused: response.status === 503 && body?.code === 'APPLICATION_PAUSED' && /no-store/i.test(response.headers.get('cache-control') ?? '') });
    } catch {
      results.push({ origin: origin.origin, path, paused: false, error: 'Probe failed; do not infer protection from network failure' });
    }
  }
}
console.log(JSON.stringify({ at: new Date().toISOString(), results, limitations: 'Only supplied origins probed. This does not prove origin inventory, old-deployment protection or in-flight request drain.' }, null, 2));
if (results.some(row => !row.paused)) process.exitCode = 1;
