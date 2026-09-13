import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const name = 'auditionpass-library-030-check';
const repo = fileURLToPath(new URL('../../', import.meta.url));
const tests = fileURLToPath(new URL('./', import.meta.url));
function docker(args, quiet = false) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (!quiet && result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0) throw Error(result.stderr || result.error?.message || 'Docker command failed');
}
let started = false;
try {
  docker(['run', '--detach', '--rm', '--name', name, '--network', 'none', '--memory', '256m', '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--tmpfs', '/var/lib/postgresql/data', '--mount', `type=bind,source=${repo}database,target=/work/database,readonly`, '--mount', `type=bind,source=${tests},target=/work/tests,readonly`, 'postgres:16-alpine'], true);
  started = true;
  for (let attempt = 0; ; attempt++) {
    try { docker(['exec', name, 'pg_isready', '-U', 'postgres'], true); break; }
    catch { if (attempt >= 20) throw Error('PostgreSQL did not become ready'); await new Promise((resolve) => setTimeout(resolve, 500)); }
  }
  docker(['exec', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/work/tests/material-library-prefix.sql', '-f', '/work/database/migrations/030_material_library.sql', '-f', '/work/tests/material-library-assert.sql']);
} finally { if (started) docker(['stop', name], true); }
