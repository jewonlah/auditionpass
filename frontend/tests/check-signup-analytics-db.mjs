import {spawnSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
const name='auditionpass-signup-031-check';
const repo=fileURLToPath(new URL('../../',import.meta.url));
function docker(args,quiet=false){const r=spawnSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:60000});if(!quiet&&r.stdout)process.stdout.write(r.stdout);if(r.status!==0)throw new Error(r.stderr||r.error?.message||'Docker failed');}
let started=false;
try{
 docker(['run','--detach','--rm','--name',name,'--network','none','--memory','256m','--env','POSTGRES_HOST_AUTH_METHOD=trust','--tmpfs','/var/lib/postgresql/data','--mount',`type=bind,source=${repo},target=/work,readonly`,'postgres:16-alpine'],true);started=true;
 for(let n=0;;n++){try{docker(['exec',name,'pg_isready','-U','postgres'],true);break;}catch{if(n>=20)throw new Error('Postgres not ready');await new Promise(r=>setTimeout(r,500));}}
 docker(['exec',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-f','/work/frontend/tests/signup-analytics-prefix.sql','-f','/work/database/migrations/031_signup_analytics.sql','-f','/work/database/migrations/031_signup_analytics.sql','-f','/work/frontend/tests/signup-analytics-assert.sql']);
 docker(['exec',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-c',`INSERT INTO auth.users VALUES ('66666666-6666-4666-8666-666666666666',now(),now(),'{"provider":"email"}');`],true);
 const execFileAsync=promisify(execFile);
 const attempts=await Promise.all(Array.from({length:4},()=>execFileAsync('docker',['exec',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1','-At','-c',`SET ROLE authenticated; SET request.jwt.claim.sub='66666666-6666-4666-8666-666666666666'; SELECT count(*) FROM public.claim_signup_analytics();`],{encoding:'utf8',windowsHide:true,timeout:30000})));
 const counts=attempts.map(result=>Number(result.stdout.trim().split(/\r?\n/).at(-1)));
 if(counts.reduce((a,b)=>a+b,0)!==1)throw new Error('Concurrent claims were not deduplicated');
 console.log('Concurrent signup claims PASS (4 requests, 1 claim)');
}finally{if(started)docker(['stop',name],true);}
