// Read-only diagnostics: no password attempts, email sends, or session creation.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^['"]|['"]$/g,'')]));
const base='https://www.auditionpass.co.kr';
for(const path of ['/login?returnTo=%2Fadmin','/admin','/admin/sources','/auth/callback']){
  try { const r=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(20000)}); const body=await r.text(); console.log(JSON.stringify({path,status:r.status,location:r.headers.get('location'),title:body.match(/<title>(.*?)<\/title>/s)?.[1],appError:/Application error:|Internal Server Error/.test(body)})); }
  catch(e){console.log(JSON.stringify({path,error:e.message}));}
}
const auth=env.NEXT_PUBLIC_SUPABASE_URL;
const loginHtml=await (await fetch(base+'/login')).text();
const chunks=[...new Set([...loginHtml.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m=>m[1]).filter(p=>p.startsWith('/_next/')))];
const bodies=await Promise.all(chunks.map(async p=>(await fetch(base+p,{signal:AbortSignal.timeout(20000)})).text()));
const hosts=[...new Set(bodies.flatMap(b=>b.match(/https:\/\/[a-z0-9]+\.supabase\.co/g)??[]))];
console.log(JSON.stringify({check:'production-auth-project',matchesLocal:hosts.includes(auth),projectHosts:hosts}));
if(auth && env.NEXT_PUBLIC_SUPABASE_ANON_KEY){
  const r=await fetch(auth+'/auth/v1/settings',{headers:{apikey:env.NEXT_PUBLIC_SUPABASE_ANON_KEY},signal:AbortSignal.timeout(20000)});
  const j=await r.json(); console.log(JSON.stringify({check:'auth-settings',status:r.status,googleEnabled:j.external?.google,emailEnabled:j.external?.email,signupDisabled:j.disable_signup}));
  const url=new URL(auth+'/auth/v1/authorize');url.searchParams.set('provider','google');url.searchParams.set('redirect_to',base+'/auth/callback?returnTo=%2Fadmin');
  const o=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000)});
  const loc=o.headers.get('location'); console.log(JSON.stringify({check:'google-entry',status:o.status,redirectHost:loc?new URL(loc).host:null,error:o.status>=400?(await o.text()).slice(0,250):undefined}));
}
