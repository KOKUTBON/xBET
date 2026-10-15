/**
 * Build the standalone browser demo for GitHub Pages without starting or deploying any services.
 *
 *   node scripts/build-pages.ts      → dist/pages/ (upload-ready, never published by this script)
 *
 * Asset URLs are relative, so the site works under a project path such as /xbet/ or at a root domain.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const publicDir = join(root, 'apps/web/public');
const output = join(root, 'dist/pages');

execFileSync(process.execPath, [join(root, 'scripts/bundle-frontend.ts')], { stdio: 'inherit' });
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const asset of ['app.bundle.js', 'main.css', 'logo.svg', 'icon-192.png', 'icon-512.png', 'img', 'manifest.json', 'service-worker.js']) {
  cpSync(join(publicDir, asset), join(output, asset), { recursive: true });
}

// Content hash for cache-busting: a new deploy always fetches the new bundle and refreshes the SW cache.
const version = createHash('sha256')
  .update(readFileSync(join(output, 'app.bundle.js')))
  .update(readFileSync(join(output, 'main.css')))
  .digest('hex')
  .slice(0, 10);

/** Replace exactly; fail the build if the source HTML changed so a replacement silently stopped matching. */
function swap(text: string, from: string | RegExp, to: string, label: string): string {
  const matched = typeof from === 'string' ? text.includes(from) : from.test(text);
  if (!matched) throw new Error(`build-pages: could not find "${label}" in index.html`);
  return text.replace(from, to);
}

// Optional absolute site URL (the workflow passes the Pages URL) for canonical and social-preview links.
const siteUrlRaw = process.env.XBET_SITE_URL?.trim();
const siteUrl = siteUrlRaw ? new URL(siteUrlRaw.endsWith('/') ? siteUrlRaw : `${siteUrlRaw}/`).href : '';
const title = 'xBET — Interactive Sportsbook & Casino Demo (Simulated, Points Only)';
const description = 'Static demo of the open-source xBET platform: simulated live sport across 7 sports with moving odds, singles, combis, cash out, a local points wallet and 12 casino & virtual games. No sign-up, no real money.';

let html = readFileSync(join(publicDir, 'index.html'), 'utf8');
html = swap(html, /<title>[^<]*<\/title>/, `<title>${title}</title>`, 'title');
html = swap(html, /<meta name="description" content="[^"]*">/, [
  `<meta name="description" content="${description}">`,
  '  <meta name="robots" content="index, follow">',
  '  <meta property="og:type" content="website">',
  `  <meta property="og:title" content="${title}">`,
  `  <meta property="og:description" content="${description}">`,
  `  <meta property="og:image" content="${siteUrl ? new URL('icon-512.png', siteUrl).href : './icon-512.png'}">`,
  '  <meta name="twitter:card" content="summary">',
  ...(siteUrl ? [`  <meta property="og:url" content="${siteUrl}">`, `  <link rel="canonical" href="${siteUrl}">`] : []),
].join('\n'), 'meta description');
html = swap(html, '<script src="./app.bundle.js?v=2">', '<script>window.XBET_STATIC_DEMO = true;</script>\n  <script src="./app.bundle.js?v=2">', 'bundle script');
html = html.replaceAll('?v=2', `?v=${version}`);
html = swap(html, '<body>', `<body>
  <noscript><div style="padding:24px;font:16px system-ui;color:#edf1f7;background:#07090d">This interactive demo runs entirely in your browser and needs JavaScript enabled.</div></noscript>`, 'body');
html = swap(html, 'Provably fair · HMAC-SHA256', 'Browser-simulated outcomes', 'footer fairness badge');
html = swap(html, 'Double-entry ledger', 'Local demo wallet', 'footer ledger badge');
html = swap(html, 'Points only · no real money', 'Interactive demo · simulated odds · no real money', 'utility note');
html = swap(html, /An open-source, points-based sportsbook &amp; casino engine built for research and education\. No real money is ever involved\./,
  'Static demo of an open-source, points-based sportsbook &amp; casino engine. Odds, results and the wallet are simulated in your browser — no real money, no backend.', 'footer blurb');
writeFileSync(join(output, 'index.html'), html);
// GitHub Pages serves 404.html for unknown paths; the single-page app handles any path the same way.
writeFileSync(join(output, '404.html'), html);

let worker = readFileSync(join(output, 'service-worker.js'), 'utf8');
if (!worker.includes('?v=2') || !worker.includes('xbet-shell-v4')) throw new Error('build-pages: service-worker.js version markers not found');
worker = worker.replaceAll('?v=2', `?v=${version}`).replace('xbet-shell-v4', `xbet-shell-${version}`);
writeFileSync(join(output, 'service-worker.js'), worker);
writeFileSync(join(output, '.nojekyll'), '');

// Guard against shipping anything unexpected (sources, env files, maps).
const files: string[] = [];
const walk = (dir: string) => readdirSync(dir).forEach((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) walk(path); else files.push(relative(output, path));
});
walk(output);
const unexpected = files.filter((f) => !/^(index\.html|404\.html|\.nojekyll|app\.bundle\.js|main\.css|logo\.svg|icon-(192|512)\.png|manifest\.json|service-worker\.js|img\/.+\.(svg|png|webp|jpg))$/.test(f));
if (unexpected.length) throw new Error(`build-pages: unexpected files in output: ${unexpected.join(', ')}`);
const size = files.reduce((acc, f) => acc + statSync(join(output, f)).size, 0);

console.log(`Static demo ready: ${output}`);
console.log(`  ${files.length} files · ${(size / 1024).toFixed(0)} KB · asset version ${version}`);
console.log('  Not published. Preview with: npm run preview:pages');
