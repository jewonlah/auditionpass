// Isolated backend: read-only rows and ephemeral in-memory files. Never uses .env credentials.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('node:http');
const files = new Map();
const fixturePixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const materials = new Map();
const lifecycle = { deleting: false, active: new Set() };
let signupClaimed = false;
let releaseScenario = '';
let claimCalls = 0;
let prepared = null;
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
  // Loopback-only fault injection for real Next API route regressions; no external service.
  if (url.pathname === '/__qa/scenario' && req.method === 'POST') {
    releaseScenario = url.searchParams.get('name') || ''; claimCalls = 0; prepared = null;
    return res.end('{}');
  }
  if (url.pathname === '/__qa/state') return res.end(JSON.stringify({ claimCalls, snapshot: prepared?.snapshot, subject: prepared?.payload?.subject }));
  if (releaseScenario && url.pathname === '/rest/v1/submission_preparations') return res.end(JSON.stringify({
    id: '55555555-5555-4555-8555-555555555555', user_id: user.id, audition_id: audition.id,
    state: 'active', mode: 'test', expires_at: new Date(Date.now()+3600000).toISOString(),
    fingerprint: 'server-only-fingerprint', material_ids: releaseScenario === 'dispatch-expired' ? [] : ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'], material_hashes: [],
  }));
  if (releaseScenario === 'profile-error' && url.pathname === '/rest/v1/profiles') {
    res.statusCode = 503; return res.end(JSON.stringify({ message: 'Injected profile lookup failure' }));
  }
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
    if (rpc === 'claim_submission_preparation') claimCalls++;
    if (rpc === 'claim_submission_preparation' && releaseScenario === 'dispatch-expired') return res.end(JSON.stringify({ id:'77777777-7777-4777-8777-777777777777', mode:'test', created_at:new Date().toISOString() }));
    if (rpc === 'acquire_application_dispatch' && releaseScenario === 'dispatch-expired') { res.statusCode=400; return res.end(JSON.stringify({message:'MANUAL_REVIEW:AUDITION_CHANGED'})); }
    if (rpc === 'private_application_destination' && (releaseScenario === 'subject' || releaseScenario.startsWith('requirements'))) return res.end(JSON.stringify('subject@example.invalid'));
    if (rpc === 'store_submission_preparation' && (releaseScenario === 'subject' || releaseScenario.startsWith('requirements'))) {
      const chunks=[]; req.on('data', c=>chunks.push(c)); req.on('end',()=>{ prepared=JSON.parse(Buffer.concat(chunks).toString()).p_data; res.end(JSON.stringify('55555555-5555-4555-8555-555555555555')); }); return;
    }
    if (rpc === 'private_application_audition_gate' && releaseScenario) {
      if (req.headers.apikey !== 'local-test-service-key') { res.statusCode=403; return res.end('{}'); }
      return res.end(JSON.stringify({ ready: true, code: 'READY', fingerprint: 'server-only-fingerprint', requirements: {minAge:null,maxAge:null,minorRole:false,requiredMaterials:[],requiredGender:releaseScenario.startsWith('requirements')?'남성':null,requireCareer:releaseScenario.startsWith('requirements'),acknowledgements:releaseScenario.startsWith('requirements')?['10/1 도착','10/2~5 참석']:[],ageScope:'source'}, subjectRules: releaseScenario==='subject' ? {format:'role_name_age_phone_v1',roles:['지안','민수']} : {format:'standard',roles:[]} }));
    }
    if (rpc === 'available_profile_templates' && releaseScenario === 'rollback') return res.end(JSON.stringify(['casting','portfolio','career'].map(template_id => ({ template_id }))));
    if (rpc === 'available_profile_templates') return res.end(JSON.stringify(['casting','portfolio','career','classic','cinema','magazine','cozy','dignity'].map(template_id => ({ template_id }))));
    if (rpc === 'owned_audition_references') return res.end('[]');
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
      const file = files.get(key) || (key === `profiles/${user.id}/fixture.jpg` ? {bytes:fixturePixel,type:'image/png'} : null);
      if (!file) { res.statusCode = 404; return res.end(JSON.stringify({ message: 'Object not found' })); }
      if (key.startsWith('materials/') && url.searchParams.has('download')) res.setHeader('Content-Disposition', 'attachment; filename="material.pdf"');
      res.setHeader('Content-Type', file.type); return res.end(file.bytes);
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 503; return res.end(JSON.stringify({ message: 'Read-only test backend: mutation blocked' })); }
  const table = url.pathname.split('/').pop();
  const releaseProfile = releaseScenario ? { ...profile, template_id: 'classic', renderer_version: 'compcard-v1', document_version: 1, phone: '01000000000', career:'가상 경력', gender:releaseScenario.startsWith('requirements')?'남성':profile.gender, photo_urls: [`http://127.0.0.1:15439/storage/v1/object/public/profiles/${user.id}/fixture.jpg`] } : profile;
  let rows = table === 'profiles' ? [releaseProfile] : table === 'auditions' || table === 'public_auditions' ? [audition] : table === 'profile_versions' ? [
    { id: '44444444-4444-4444-8444-444444444444', user_id: user.id, version: 1, profile: { ...releaseProfile, ...(releaseScenario==='subject' ? {phone:'010-1234-5678'} : {}), ...(releaseScenario==='requirements-career'?{career:''}:{}), ...(releaseScenario==='requirements-gender'?{gender:'여성'}:{}), name: '이전 지원자', bio: '저장 당시 소개입니다.', template_id: 'career', document_version: 1 }, created_at: user.created_at, renderer_version:'legacy-v1' },
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
