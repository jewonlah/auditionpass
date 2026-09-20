// Isolated backend: read-only rows and ephemeral in-memory files. Never uses .env credentials.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('node:http');
const files = new Map();
const materials = new Map();
const lifecycle = { deleting: false, active: new Set() };
let signupClaimed = false;
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'local@example.invalid', aud: 'authenticated', role: 'authenticated', created_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
const profile = { id: user.id, name: 'Test Actor', birth_year: 2000, gender: '여성', genre: ['성우'], activity_field: [], specialty: [], photo_urls: [], height: null, weight: null, bio: '', career: '', created_at: user.created_at };
const audition = { id: '22222222-2222-4222-8222-222222222222', title: '테스트 성우 오디션', company: '테스트 제작사', genre: '기타', category: '성우', deadline: '2099-12-31', is_active: true, apply_type: 'email', apply_email: 'nobody@example.invalid', oneclick_blocked: false, review_status: 'approved', reports_count: 0, source_url: 'https://example.invalid/audition', source_name: '테스트 출처', description: '성우 지원자를 모집합니다.', created_at: user.created_at, crawled_at: user.created_at };
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.end();
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') return res.end('{}');
  if (url.pathname === '/auth/v1/user') return res.end(JSON.stringify(user));
  if (url.pathname === '/rest/v1/materials') {
    const matching = () => [...materials.values()].filter((row) => ['id', 'user_id'].every((field) => !url.searchParams.has(field) || url.searchParams.get(field) === `eq.${row[field]}`));
    if (req.method === 'GET') {
      const rows = matching().reverse();
      const singular = (req.headers.accept || '').includes('application/vnd.pgrst.object+json');
      return res.end(JSON.stringify(singular ? rows[0] ?? null : rows));
    }
    if (req.method === 'DELETE') { matching().forEach((row) => materials.delete(row.id)); return res.end('null'); }
    if (req.method === 'POST') {
      const chunks = []; req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const row = JSON.parse(Buffer.concat(chunks).toString());
        if (row.user_id !== user.id) { res.statusCode = 403; return res.end('{}'); }
        row.created_at = new Date().toISOString(); materials.set(row.id, row);
        res.statusCode = 201; res.end(JSON.stringify(row));
      }); return;
    }
  }
  if (url.pathname.startsWith('/storage/v1/object/sign/materials/') && req.method === 'POST') {
    const key = url.pathname.slice('/storage/v1/object/sign/'.length);
    if (!files.has(key)) { res.statusCode = 404; return res.end('{}'); }
    return res.end(JSON.stringify({ signedURL: `/object/${key}?download=test` }));
  }
  if (url.pathname === '/storage/v1/object/materials' && req.method === 'DELETE') {
    const chunks = []; req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => { const body = JSON.parse(Buffer.concat(chunks).toString()); body.prefixes.forEach((path) => files.delete(`materials/${path}`)); res.end('[]'); }); return;
  }
  if (req.method === 'POST' && url.pathname.startsWith('/rest/v1/rpc/')) {
    const rpc = url.pathname.split('/').pop();
    if (rpc === 'claim_signup_analytics') {
      const rows = signupClaimed ? [] : [{ method: 'email' }];
      signupClaimed = true;
      return res.end(JSON.stringify(rows));
    }
    if (!['begin_account_file_operation', 'finish_account_file_operation', 'begin_account_file_deletion'].includes(rpc)) {
      res.statusCode = 503; return res.end(JSON.stringify({ message: 'Unsupported test RPC' }));
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let args;
      try { args = JSON.parse(Buffer.concat(chunks).toString()); }
      catch { res.statusCode = 400; return res.end(JSON.stringify({ message: 'Invalid JSON' })); }
      if (args.p_user_id !== user.id) { res.statusCode = 403; return res.end(JSON.stringify({ message: 'Unknown test user' })); }
      // Only models lifecycle state; real row locking and permissions are tested in PostgreSQL.
      if (rpc === 'begin_account_file_operation') {
        if (lifecycle.deleting) { res.statusCode = 409; return res.end(JSON.stringify({ message: 'Account deletion in progress' })); }
        const operationId = crypto.randomUUID();
        lifecycle.active.add(operationId);
        return res.end(JSON.stringify(operationId));
      }
      if (rpc === 'finish_account_file_operation') {
        lifecycle.active.delete(args.p_operation_id);
        return res.end('null');
      }
      lifecycle.deleting = true;
      return res.end(JSON.stringify(lifecycle.active.size === 0));
    });
    return;
  }
  if (url.pathname.startsWith('/storage/v1/object/')) {
    const key = url.pathname.slice('/storage/v1/object/'.length).replace(/^public\//, '');
    if (!new RegExp(`^(profiles|profile-documents|materials)/${user.id}/[a-zA-Z0-9_.-]+$`).test(key)) { res.statusCode = 403; return res.end('{}'); }
    if (req.method === 'POST') {
      if (files.has(key)) { res.statusCode = 409; return res.end(JSON.stringify({ message: 'Already exists' })); }
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => { files.set(key, { bytes: Buffer.concat(chunks), type: req.headers['content-type'] }); res.end(JSON.stringify({ Key: key })); });
      return;
    }
    if (req.method === 'GET') {
      const file = files.get(key);
      if (!file) { res.statusCode = 404; return res.end(JSON.stringify({ message: 'Object not found' })); }
      if (key.startsWith('materials/') && url.searchParams.has('download')) res.setHeader('Content-Disposition', 'attachment; filename="material.pdf"');
      res.setHeader('Content-Type', file.type); return res.end(file.bytes);
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 503; return res.end(JSON.stringify({ message: 'Read-only test backend: mutation blocked' })); }
  const table = url.pathname.split('/').pop();
  let rows = table === 'profiles' ? [profile] : table === 'auditions' ? [audition] : table === 'profile_versions' ? [
    { id: '44444444-4444-4444-8444-444444444444', user_id: user.id, version: 1, profile: { ...profile, name: '이전 지원자', bio: '저장 당시 소개입니다.', template_id: 'career', document_version: 1 }, created_at: user.created_at },
  ] : [];
  if (table === 'profile_versions') {
    for (const field of ['id', 'user_id', 'version']) {
      const filter = url.searchParams.get(field);
      if (filter?.startsWith('eq.')) rows = rows.filter((row) => String(row[field]) === filter.slice(3));
    }
  }
  const singular = (req.headers.accept || '').includes('application/vnd.pgrst.object+json');
  res.setHeader('Content-Range', '0-' + Math.max(0, rows.length - 1) + '/' + rows.length);
  res.end(JSON.stringify(singular ? rows[0] ?? null : rows));
}).listen(15439, '127.0.0.1');
