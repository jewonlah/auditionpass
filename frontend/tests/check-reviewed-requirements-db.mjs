import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const name = 'auditionpass-requirements-' + Date.now();
const repo = fileURLToPath(new URL('../../', import.meta.url));
const tests = fileURLToPath(new URL('./', import.meta.url));
const run = args => spawnSync('docker', args, { encoding:'utf8', windowsHide:true, timeout:60000 });
function docker(args) { const r=run(args); if(r.status!==0) throw Error(r.stderr || r.error?.message); return r.stdout; }
let started=false;
try {
  docker(['run','--detach','--rm','--name',name,'--network','none','--memory','256m','--env','POSTGRES_HOST_AUTH_METHOD=trust','--tmpfs','/var/lib/postgresql/data','--mount',`type=bind,source=${repo}database,target=/work/database,readonly`,'--mount',`type=bind,source=${tests},target=/work/tests,readonly`,'postgres:16-alpine']); started=true;
  for(let i=0;;i++) { try { docker(['exec',name,'pg_isready','-U','postgres']); break; } catch { if(i>20) throw Error('PostgreSQL not ready'); await new Promise(r=>setTimeout(r,500)); } }
  const files=['/work/tests/connected-service-prefix.sql',...['026_profile_versions','023_applications_sending_status','025_application_delivery_jobs','028_account_file_lifecycle','032_compcard_documents','033_application_readiness','034_submission_preparations','035_delivery_receipts','036_public_audition_reads','037_reviewed_subjects','038_reviewed_requirements'].map(s=>`/work/database/migrations/${s}.sql`),'/work/tests/reviewed-requirements-assert.sql'];
  const output=docker(['exec',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1',...files.flatMap(f=>['-f',f])]);
  if(!output.includes('038 requirement checks passed')) throw Error('Assertions did not finish');
  const sql=s=>docker(['exec',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-c',s]);
  sql("update application_delivery_jobs set state='uncertain' where provider_id='requirements-fixture'");
  const refused=run(['exec',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-f','/work/database/migrations/038_reviewed_requirements.sql']);
  if(refused.status===0 || !refused.stderr.includes('REQUIREMENTS_CUTOVER_REQUIRES_DRAIN')) throw Error('038 allowed unresolved send');
  sql("update application_delivery_jobs set state='accepted' where provider_id='requirements-fixture'; update submission_preparations set state='active',expires_at=now()+interval '1 hour'");
  const active=run(['exec',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-f','/work/database/migrations/038_reviewed_requirements.sql']);
  if(active.status===0 || !active.stderr.includes('REQUIREMENTS_CUTOVER_REQUIRES_DRAIN')) throw Error('038 allowed active preparation');
  const uid='88888888-8888-4888-8888-888888888888';
  const auth=`select set_config('request.jwt.claims','{"sub":"${uid}","role":"authenticated"}',false);`;
  sql(`delete from applications where user_id='${uid}'; update submission_preparations set state='used'; ${auth} select qa_requirements_preparation();`);
  const asyncSql=query=>new Promise((resolve,reject)=>{
    const p=spawn('docker',['exec',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At','-c',query],{windowsHide:true});
    let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',reject);p.on('close',code=>code===0?resolve(output):reject(Error(output)));
  });
  async function locked(marker,waiting=false) {
    for(let i=0;i<40;i++) {
      const r=docker(['exec',name,'psql','-U','postgres','-At','-c',`select count(*) from pg_stat_activity where application_name='${marker}' and ${waiting?"wait_event_type='Lock'":"wait_event='PgSleep'"}`]);
      if(r.trim()==='1')return;await new Promise(r=>setTimeout(r,50));
    } throw Error('Concurrent lock not observed');
  }
  const reviewFirst=asyncSql(`begin; set application_name='req_review'; update audition_application_reviews set acknowledgements=array['Changed'] where audition_id='${uid}'; select pg_sleep(4); commit;`);
  await locked('req_review');
  const claimWait=asyncSql(`set application_name='req_claim_wait'; ${auth} do $$ begin begin perform claim_submission_preparation((select id from submission_preparations where user_id='${uid}' and state='active'),true); raise exception 'changed review claimed'; exception when raise_exception then if sqlerrm<>'AUDITION_CHANGED' then raise; end if; end; end $$;`);
  await locked('req_claim_wait',true);await Promise.all([reviewFirst,claimWait]);
  sql(`update audition_application_reviews set acknowledgements=array['Arrival','All dates'] where audition_id='${uid}'; ${auth} select qa_requirements_preparation();`);
  const claimFirst=asyncSql(`begin; set application_name='req_claim'; ${auth} select (claim_submission_preparation((select id from submission_preparations where user_id='${uid}' and state='active'),true)).id; select pg_sleep(4); commit;`);
  await locked('req_claim');
  const reviewWait=asyncSql(`set application_name='req_review_wait'; update audition_application_reviews set acknowledgements=array['Changed'] where audition_id='${uid}';`);
  await locked('req_review_wait',true);await Promise.all([claimFirst,reviewWait]);
  sql(`${auth} do $$ begin begin perform acquire_application_dispatch((select active_job_id from applications where user_id='${uid}'),'${uid}'); raise exception 'changed review dispatched'; exception when raise_exception then if sqlerrm<>'MANUAL_REVIEW:AUDITION_CHANGED' then raise; end if; end; end $$;`);
  console.log('PASS: two-session requirement review/claim races, both lock orders, dispatch recheck');
  console.log('PASS: 038 helper, owned-version claim, dispatch, legacy, fingerprint, private ACL, both drain guards');
} finally { if(started) docker(['stop',name]); }
