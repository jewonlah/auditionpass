import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const name = 'auditionpass-connected-' + Date.now();
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
  docker(['exec', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/work/tests/connected-service-prefix.sql', '-f', '/work/database/migrations/026_profile_versions.sql', '-f', '/work/database/migrations/023_applications_sending_status.sql', '-f', '/work/database/migrations/025_application_delivery_jobs.sql', '-f', '/work/database/migrations/028_account_file_lifecycle.sql', '-f', '/work/tests/connected-service-legacy-prefix.sql', '-f', '/work/database/migrations/032_compcard_documents.sql', '-f', '/work/database/migrations/033_application_readiness.sql', '-f', '/work/database/migrations/034_submission_preparations.sql', '-f', '/work/database/migrations/035_delivery_receipts.sql', '-f', '/work/database/migrations/036_public_audition_reads.sql', '-f', '/work/tests/connected-service-assert.sql', '-f', '/work/tests/release-regression-assert.sql', '-f', '/work/tests/submission-preparations-assert.sql', '-f', '/work/database/releases/connected-service-activate.sql', '-f', '/work/tests/public-audition-assert.sql']);
  const sql = query => docker(['exec', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', query]);
  function expectCutoverRefused() {
    const r = spawnSync('docker', ['exec', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/work/database/migrations/037_reviewed_subjects.sql'], {encoding:'utf8',windowsHide:true});
    if (r.status === 0 || !r.stderr.includes('SUBJECT_CUTOVER_REQUIRES_DRAIN')) throw Error('037 did not refuse ambiguous cutover: '+r.stderr);
    sql(`do $$ begin if exists(select 1 from information_schema.columns where table_name='audition_application_reviews' and column_name='subject_format') or position('application_review_fingerprint' in pg_get_functiondef('private_application_audition_gate(uuid)'::regprocedure))>0 then raise exception 'rejected migration changed old gate'; end if; end $$;`);
  }
  sql("update application_delivery_jobs set state='uncertain' where provider_id='provider-fixture'");
  expectCutoverRefused();
  sql("update application_delivery_jobs set state='accepted' where provider_id='provider-fixture'; update submission_preparations set state='active',expires_at=now()+interval '1 hour' where state='used'");
  expectCutoverRefused();
  sql("update submission_preparations set state='used' where state='active'");
  docker(['exec', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/work/database/migrations/037_reviewed_subjects.sql', '-f', '/work/tests/reviewed-subject-assert.sql', '-f', '/work/tests/connected-concurrency-setup.sql']);
  function sqlAsync(sql) {
    return new Promise((resolve, reject) => {
      const child = spawn('docker', ['exec', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], { windowsHide: true });
      let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
      child.on('error', reject); child.on('close', code => code === 0 ? resolve(output) : reject(Error(output)));
    });
  }
  async function locked(marker, waiting = false) {
    for (let i=0;i<30;i++) {
      const r=spawnSync('docker',['exec',name,'psql','-U','postgres','-At','-c',`select count(*) from pg_stat_activity where application_name='${marker}' and ${waiting ? "wait_event_type='Lock'" : "wait_event='PgSleep'"}`],{encoding:'utf8',windowsHide:true});
      if (r.stdout.trim()==='1') return;
      await new Promise(resolve => setTimeout(resolve,50));
    }
    throw Error('Concurrent transaction did not hold its lock');
  }
  const firstClaim = sqlAsync(`begin; set application_name='qa_claim'; set local role authenticated; select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',true); select (claim_submission_preparation('44444444-4444-4444-8444-444444444444',true)).id; select pg_sleep(3); commit;`);
  await locked('qa_claim');
  const deletionAfterClaim = sqlAsync(`select begin_account_file_deletion('44444444-4444-4444-8444-444444444444')`);
  const [, deniedDeletion] = await Promise.all([firstClaim,deletionAfterClaim]);
  if (String(deniedDeletion).trim() !== 'f') throw Error('Deletion overtook reserved send');
  const firstDelete = sqlAsync(`begin; set application_name='qa_delete'; select begin_account_file_deletion('55555555-5555-4555-8555-555555555555'); select pg_sleep(3); commit;`);
  await locked('qa_delete');
  const claimAfterDeletion = sqlAsync(`set role authenticated; select set_config('request.jwt.claims','{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',false); do $$ begin begin perform claim_submission_preparation('55555555-5555-4555-8555-555555555555',true); raise exception 'claim overtook deletion'; exception when raise_exception then if sqlerrm<>'ACCOUNT_DELETING' then raise; end if; end; end $$;`);
  await Promise.all([firstDelete,claimAfterDeletion]);
  console.log('Two-session claim/deletion races passed in both lock orders');
  const subjectUser = '99999999-9999-4999-8999-999999999999';
  const subjectAuth = `select set_config('request.jwt.claims','{"sub":"${subjectUser}","role":"authenticated"}',false);`;
  sql(`${subjectAuth} select qa_subject_preparation();`);
  const reviewFirst = sqlAsync(`begin; set application_name='qa_review_first'; update audition_application_reviews set subject_roles=array['Changed'] where audition_id='${subjectUser}'; select pg_sleep(4); commit;`);
  await locked('qa_review_first');
  const blockedClaim = sqlAsync(`set application_name='qa_claim_wait'; ${subjectAuth} do $$ begin begin perform claim_submission_preparation((select id from submission_preparations where user_id='${subjectUser}' and state='active'),true); raise exception 'claim ignored committed review'; exception when raise_exception then if sqlerrm<>'AUDITION_CHANGED' then raise; end if; end; end $$;`);
  await locked('qa_claim_wait',true);
  await Promise.all([reviewFirst,blockedClaim]);
  sql(`${subjectAuth} update audition_application_reviews set subject_roles=array[U&'\\C9C0\\C548',U&'\\BBFC\\C218'] where audition_id='${subjectUser}'; select qa_subject_preparation();`);
  const claimFirst = sqlAsync(`begin; set application_name='qa_subject_claim'; ${subjectAuth} select (claim_submission_preparation((select id from submission_preparations where user_id='${subjectUser}' and state='active'),true)).id; select pg_sleep(4); commit;`);
  await locked('qa_subject_claim');
  const waitingReview = sqlAsync(`set application_name='qa_review_wait'; update audition_application_reviews set subject_roles=array['Changed'] where audition_id='${subjectUser}';`);
  await locked('qa_review_wait',true);
  await Promise.all([claimFirst,waitingReview]);
  sql(`${subjectAuth} do $$ begin begin perform acquire_application_dispatch((select active_job_id from applications where user_id='${subjectUser}'),'${subjectUser}'); raise exception 'dispatch ignored later review'; exception when raise_exception then if sqlerrm<>'MANUAL_REVIEW:AUDITION_CHANGED' then raise; end if; end; end $$;`);
  console.log('Two-session review/claim races passed both orders; dispatch recheck blocked changed review');
  docker(['exec', name, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', '/work/tests/connected-performance.sql']);

} finally { if (started) docker(['stop', name], true); }
