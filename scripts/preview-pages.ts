/** Preview exactly the generated site, mounted under /xbet/ like a project Pages URL. */
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
const port = Number(process.env.XBET_DEMO_PORT || process.env.PORT || 4173);
const root = resolve(import.meta.dirname, '../dist/pages');
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png'};
createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/' || url.pathname === '/xbet') {res.writeHead(302, {Location:'/xbet/'});res.end();return;}
  if (!url.pathname.startsWith('/xbet/')) {res.writeHead(404);res.end();return;}
  try {
    const file = resolve(root, decodeURIComponent(url.pathname.slice('/xbet/'.length)) || 'index.html');
    if (!file.startsWith(root + sep)) throw new Error('Invalid path');
    if (!statSync(file).isFile()) throw new Error('Not a file');
    res.writeHead(200, {'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache'});
    res.end(readFileSync(file));
  } catch {res.writeHead(404);res.end('Not found. Run npm run build:pages first.');}
}).listen(port, '127.0.0.1', () => console.log(`Demo preview: http://127.0.0.1:${port}/xbet/`));
