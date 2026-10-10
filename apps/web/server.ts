import { createServer, request as httpRequest } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { connect as netConnect } from 'net';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const BASE_DIR = import.meta.dirname || process.cwd();

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.ts': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const BACKEND_MAP: Array<{ prefix: string; port: number }> = [
  { prefix: '/api/v1/auth', port: process.env.XBET_PILOT_MODE === 'true' ? 4001 : 4003 },
  { prefix: '/api/v1/account', port: 4001 },
  { prefix: '/api/v1/trader', port: 4001 },
  { prefix: '/api/v1/admin/points', port: 4001 },
  { prefix: '/api/v1/canonical', port: 4000 },
  { prefix: '/api/v1/sports', port: 4000 },
  { prefix: '/api/v1/odds', port: 4000 },
  { prefix: '/api/v1/fixtures', port: 4000 },
  { prefix: '/api/v1/media', port: 4000 },
  { prefix: '/api/v1/feeds', port: 4000 },
  { prefix: '/api/v1/bets', port: 4001 },
  { prefix: '/api/v1/wallet', port: 4001 },
  { prefix: '/api/v1/settlement', port: 4001 },
  { prefix: '/api/v1/tickets', port: 4001 },
  { prefix: '/api/v1/casino', port: 4002 },
  { prefix: '/api/v1/virtual-sports', port: 4002 },
  { prefix: '/api/v1/live-casino', port: 4002 },
  { prefix: '/api/v1/rgs', port: 4002 },
  { prefix: '/api/v1/poker', port: 4002 },
  { prefix: '/api/games', port: 4002 },
  { prefix: '/api/wallet', port: 4002 },
  { prefix: '/mobileapi', port: 4002 },
  { prefix: '/api/v1/admin', port: 4003 },
  { prefix: '/api/v1/users', port: 4003 },
  { prefix: '/api/v1/payments', port: 4003 },
  { prefix: '/api/v1/notifications', port: 4003 },
  { prefix: '/api/v1/cms', port: 4003 },
  { prefix: '/api/v1/support', port: 4003 },
  { prefix: '/api/v1/reports', port: 4003 },
  { prefix: '/api/v1/audit-logs', port: 4003 },
  { prefix: '/aaa', port: 4003 },
  { prefix: '/.in', port: 4003 },
  { prefix: '/api/.in', port: 4003 },
  { prefix: '/back', port: 4003 },
];

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  // 1. API Reverse Proxy to Backend Microservices
  const targetBackend = BACKEND_MAP.find((b) => pathname.startsWith(b.prefix));
  if (targetBackend) {
    const backendUrl = new URL(({4000:process.env.ODDS_ENGINE_URL,4001:process.env.BETTING_ENGINE_URL,4002:process.env.CASINO_ENGINE_URL,4003:process.env.LEGACY_BRIDGE_URL} as Record<number,string|undefined>)[targetBackend.port] || `http://127.0.0.1:${targetBackend.port}`);
    const proxyReq = httpRequest(
      {
        host: backendUrl.hostname,
        port: backendUrl.port || 80,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: backendUrl.host,
          // Backends rate-limit by this address; never pass a client-chosen value through
          // unless this server itself sits behind a trusted proxy (e.g. the NGINX gateway).
          'x-real-ip': (process.env.XBET_TRUST_PROXY === 'true' && typeof req.headers['x-real-ip'] === 'string' && req.headers['x-real-ip']) || req.socket.remoteAddress || '',
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 200, {
          ...proxyRes.headers,
          'Access-Control-Allow-Origin': '*',
        });
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'BAD_GATEWAY', message: `Backend service on port ${targetBackend.port} unavailable: ${err.message}` }));
    });

    req.pipe(proxyReq);
    return;
  }

  // Normalize path
  if (pathname === '/') {
    pathname = '/index.html';
  }

  const publicDir = join(BASE_DIR, 'public');
  let filePath = join(publicDir, pathname);
  if (!filePath.startsWith(publicDir + '/')) { res.writeHead(403); res.end(); return; }

  // If directory, check for index.html (e.g. /casino/roulette/)
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    const dirIndex = join(filePath, 'index.html');
    if (existsSync(dirIndex) && statSync(dirIndex).isFile()) {
      filePath = dirIndex;
    }
  }

  // Handle /casino/* routing fallback
  if (pathname.startsWith('/casino/')) {
    const casinoRel = pathname.replace(/^\/casino/, '');
    const publicCasinoPath = join(publicDir, 'casino', casinoRel);
    if (existsSync(publicCasinoPath) && statSync(publicCasinoPath).isFile()) {
      filePath = publicCasinoPath;
    } else if (existsSync(join(publicCasinoPath, 'index.html'))) {
      filePath = join(publicCasinoPath, 'index.html');
    }
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || 'text/plain';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(readFileSync(filePath));
  } else {
    // SPA Fallback to index.html
    const indexPath = join(publicDir, 'index.html');
    if (existsSync(indexPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(readFileSync(indexPath));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  }
});

// WebSocket Tunnel Proxy for /ws -> Port 4000
server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/ws')) { socket.destroy(); return; }
  const backend = new URL(process.env.ODDS_ENGINE_URL || 'http://127.0.0.1:4000');
  const proxySocket = netConnect(Number(backend.port || 80), backend.hostname, () => {
    proxySocket.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
      `Host: ${backend.host}\r\n` +
      `Upgrade: ${req.headers['upgrade']}\r\n` +
      `Connection: ${req.headers['connection']}\r\n` +
      `Sec-WebSocket-Key: ${req.headers['sec-websocket-key']}\r\n` +
      `Sec-WebSocket-Version: ${req.headers['sec-websocket-version']}\r\n\r\n`
    );
    if (head && head.length) proxySocket.write(head);
    socket.pipe(proxySocket);
    proxySocket.pipe(socket);
  });

  proxySocket.on('error', () => {
    socket.destroy();
  });
});

server.listen(PORT, HOST, () => {
  console.log('================================================================');
  console.log(`  🌐 xBET Modern Frontend Web App running at:`);
  console.log(`     👉 http://${HOST}:${PORT}`);
  console.log('================================================================');
});
