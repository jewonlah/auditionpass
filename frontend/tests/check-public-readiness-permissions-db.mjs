import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const name='auditionpass-public-permissions-'+Date.now();
const repo=fileURLToPath(new URL('../../',import.meta.url));
const tests=fileURLToPath(new URL('./',import.meta.url));
const run=args=>spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:60000});
function docker(args){const r=run(args);if(r.status!==0)throw Error(r.stderr||r.error?.message);return r.stdout;}
let started=false;
try{
 docker(['run','--detach','--rm','--name',name,'--network','none','--memory','256m','--env','POSTGRES_HOST_AUTH_METHOD=trust','--tmpfs','/var/lib/postgresql/data','--mount',`type=bind,source=${repo}database,target=/work/database,readonly`,'--mount',`type=bind,source=${tests},target=/work/tests,readonly`,'postgres:16-alpine']);started=true;
 for(let i=0;;i++){try{docker(['exec',name,'pg_isready','-U','postgres']);break;}catch{if(i>20)throw Error('PostgreSQL not ready');await new Promise(r=>setTimeout(r,500));}}
 const files=['/work/tests/connected-service-prefix.sql',...['026_profile_versions','023_applications_sending_status','025_application_delivery_jobs','028_account_file_lifecycle','032_compcard_documents','033_application_readiness','034_submission_preparations','035_delivery_receipts','036_public_audition_reads','037_reviewed_subjects','038_reviewed_requirements'].map(s=>`/work/database/migrations/${s}.sql`)];
 docker(['exec',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1',...files.flatMap(f=>['-f',f])]);
 const old=run(['exec',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-c','set role anon; select id,application_ready from public_auditions limit 1;']);
 if(old.status===0||!old.stderr.includes('permission denied for function application_source_fingerprint'))throw Error('Original permission failure not reproduced');
 const output=docker(['exec',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-f','/work/database/migrations/039_public_readiness_permissions.sql','-f','/work/tests/public-readiness-permissions-assert.sql']);
 if(!output.includes('039 public role checks passed'))throw Error('Assertions missing');
 console.log('PASS: original failure reproduced; anon/authenticated view reads, reviewed readiness, blocked and private rows, no raw-table/fingerprint/email access');
}finally{if(started)docker(['stop',name]);}
