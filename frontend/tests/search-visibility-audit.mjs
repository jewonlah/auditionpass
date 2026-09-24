// Public, read-only baseline. Does not measure rankings or actual search impressions.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const base = 'https://www.auditionpass.co.kr';
const output = fileURLToPath(new URL('../../docs/renewal/search-visibility/', import.meta.url));
mkdirSync(output, { recursive: true });
const get = async (path) => {
  const started = Date.now();
  try {
    const res = await fetch(new URL(path, base), { signal: AbortSignal.timeout(30000) });
    return { path, status: res.status, finalUrl: res.url, elapsedMs: Date.now()-started, xRobotsTag: res.headers.get('x-robots-tag'), body: await res.text() };
  } catch (e) { return { path, error: e.message, body: '' }; }
};
const meta = (body, name) => [...body.matchAll(/<meta\b[^>]*>/gi)].find(([tag])=>new RegExp(`name=["']${name}["']`,'i').test(tag))?.[0].match(/content=["']([^"']*)/i)?.[1] ?? null;
const inspect = (r) => ({path:r.path,status:r.status,error:r.error,finalUrl:r.finalUrl,elapsedMs:r.elapsedMs,xRobotsTag:r.xRobotsTag,title:r.body.match(/<title>(.*?)<\/title>/s)?.[1], robots:meta(r.body,'robots'),canonical:[...r.body.matchAll(/<link\b[^>]*>/gi)].find(([tag])=>/rel=["']canonical["']/i.test(tag))?.[0].match(/href=["']([^"']*)/i)?.[1],ga4Loader:/googletagmanager\.com\/gtag/.test(r.body),googleVerification:meta(r.body,'google-site-verification')!==null,naverVerification:meta(r.body,'naver-site-verification')!==null});
const [robots, sitemap, ...pages] = await Promise.all(['/robots.txt','/sitemap.xml','/','/start','/auditions','/auditions/actor'].map(get));
const urls = [...sitemap.body.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
const sample = urls.filter(u=>u.startsWith(base+'/audition/')).slice(0,5);
const details = await Promise.all(sample.map(get));
const assets = [...new Set(pages.flatMap(r=>[...r.body.matchAll(/<script\b[^>]*>/gi)].filter(([tag])=>/data-sdkn=["']@vercel\//.test(tag)).map(([tag])=>tag.match(/src=["']([^"']*)/)?.[1]).filter(Boolean)))];
const assetChecks = await Promise.all(assets.map(get));
const pageChecks = [...pages,...details].map(inspect);
const report = {checkedAt:new Date().toISOString(),base,scope:'Public HTTP access and page metadata; not index coverage or AI citation rate',robots:{status:robots.status,error:robots.error,body:robots.body},sitemap:{status:sitemap.status,error:sitemap.error,urls:urls.length,sample},pages:pageChecks,analyticsAssets:assetChecks.map(({path,status,error})=>({path,status,error})),actualMetrics:{searchImpressions:null,searchClicks:null,indexedPages:null,aiCitations:null,reason:'Authenticated provider reports are not connected in this session'},issues:[]};
for (const p of pageChecks) if(p.status!==200 || /noindex/i.test((p.robots??'')+' '+(p.xRobotsTag??''))) report.issues.push({path:p.path,issue:'Expected public indexable page returned an error or noindex'});
for (const a of report.analyticsAssets) if(a.status!==200) report.issues.push({path:a.path,issue:'Analytics script request failed'});
if (sitemap.status!==200 || urls.length===0) report.issues.push({path:'/sitemap.xml',issue:'Sitemap unavailable or empty'});
const filename=report.checkedAt.replaceAll(':','-');
writeFileSync(output+'/'+filename+'.json',JSON.stringify(report,null,2));
writeFileSync(output+'/latest.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,robots:{status:robots.status},pages:pageChecks.map(p=>({path:p.path,status:p.status,robots:p.robots})),sitemap:{status:sitemap.status,urls:urls.length}},null,2));
