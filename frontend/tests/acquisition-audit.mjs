import { writeFileSync } from 'node:fs';
const base = 'https://www.auditionpass.co.kr';
const results = [];
for (const path of ['/', '/auditions', '/auditions/actor', '/robots.txt', '/sitemap.xml', '/start']) {
  try {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(30000) });
    const body = await response.text();
    results.push({ path, status: response.status, canonical: body.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1], title: body.match(/<title>(.*?)<\/title>/s)?.[1], ga4: /googletagmanager\.com\/gtag/.test(body), naverVerification: body.includes('naver-site-verification'), googleVerification: body.includes('google-site-verification'), noindex: /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/.test(body), sitemapUrls: path === '/sitemap.xml' ? (body.match(/<loc>/g) || []).length : undefined, botAllowed: path === '/robots.txt' ? body.includes('OAI-SearchBot') : undefined });
  } catch (error) { results.push({ path, error: error.message }); }
}
writeFileSync('test-results/acquisition-live.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
