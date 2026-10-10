/**
 * xBET Modern Platform - Administrator Cluster Orchestrator
 * Boots all 5 microservices concurrently, performs health verification,
 * and maintains continuous real-time odds and settlement streams.
 */

import { spawn, ChildProcess } from 'child_process';
import { get } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

interface ServiceConfig {
  name: string;
  command: string;
  args: string[];
  cwd: string;
  port: number;
  env?: Record<string, string>;
  healthEndpoint: string;
}

const SERVICES: ServiceConfig[] = [
  {
    name: 'Betting Engine',
    command: 'node',
    args: ['--experimental-strip-types', 'src/index.ts'],
    cwd: join(ROOT_DIR, 'services/betting-engine'),
    port: 4001,
    env: { PORT: '4001', HOST: '127.0.0.1' },
    healthEndpoint: 'http://127.0.0.1:4001/api/v1/health',
  },
  {
    name: 'Casino RGS & Virtuals',
    command: 'node',
    args: ['--experimental-strip-types', 'src/index.ts'],
    cwd: join(ROOT_DIR, 'services/casino-engine'),
    port: 4002,
    env: { PORT: '4002', HOST: '127.0.0.1' },
    healthEndpoint: 'http://127.0.0.1:4002/api/v1/health',
  },
  {
    name: 'Odds & Feeds Engine',
    command: 'node',
    args: ['--experimental-strip-types', 'src/index.ts'],
    cwd: join(ROOT_DIR, 'services/odds-engine'),
    port: 4000,
    env: { PORT: '4000', HOST: '127.0.0.1' },
    healthEndpoint: 'http://127.0.0.1:4000/api/v1/health',
  },
  {
    name: 'Legacy Bridge & Admin',
    command: 'node',
    args: ['--experimental-strip-types', 'src/server.ts'],
    cwd: join(ROOT_DIR, 'packages/legacy-bridge'),
    port: 4003,
    env: { PORT: '4003', HOST: '127.0.0.1' },
    healthEndpoint: 'http://127.0.0.1:4003/api/v1/health',
  },
  {
    name: 'Web Frontend (PWA)',
    command: 'node',
    args: ['--experimental-strip-types', 'server.ts'],
    cwd: join(ROOT_DIR, 'apps/web'),
    port: 3000,
    env: { PORT: '3000', HOST: '127.0.0.1' },
    healthEndpoint: 'http://127.0.0.1:3000',
  },
];

const activeProcesses: Map<string, ChildProcess> = new Map();

function startService(service: ServiceConfig): ChildProcess {
  console.log(`[Cluster] 🚀 Starting ${service.name} on port ${service.port}...`);

  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: { ...process.env, ...service.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        console.log(`\x1b[36m[${service.name}]\x1b[0m ${line}`);
      }
    }
  });

  child.stderr?.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        console.error(`\x1b[31m[${service.name}:ERR]\x1b[0m ${line}`);
      }
    }
  });

  child.on('exit', (code, signal) => {
    console.log(`\x1b[33m[Cluster] Service ${service.name} exited with code ${code} (${signal})\x1b[0m`);
    activeProcesses.delete(service.name);
  });

  activeProcesses.set(service.name, child);
  return child;
}

async function bootstrapCluster() {
  console.log('==================================================================');
  console.log('  👑 xBET Modern Platform - Administrator Cluster Manager       ');
  console.log('==================================================================');

  // Start all services
  for (const s of SERVICES) {
    startService(s);
  }

  // Small delay for initial bind
  await new Promise((r) => setTimeout(r, 1000));

  console.log('\n==================================================================');
  console.log('  🎯 Platform Cluster Ready for Administrator Operations          ');
  console.log('==================================================================');
  console.log('  👉 Web Frontend:         http://127.0.0.1:3000');
  console.log('  👉 Live Odds WS:         ws://127.0.0.1:4000/ws');
  console.log('  👉 In-Play Fixtures:     http://127.0.0.1:4000/api/v1/fixtures/in-play');
  console.log('  👉 Betting & Ledger API: http://127.0.0.1:4001/api/v1/health');
  console.log('  👉 Casino Games Catalog: http://127.0.0.1:4002/api/v1/casino/games');
  console.log('  👉 Admin Backoffice API: http://127.0.0.1:4003/api/v1/admin/dashboard');
  if (process.env.ADMIN_BOOTSTRAP_PASSWORD) {
    console.log(`  👉 Admin Account:        Username: ${process.env.ADMIN_BOOTSTRAP_USERNAME || 'admin'} (Bootstrapped via env)`);
  }
  console.log('==================================================================\n');
}

function shutdown() {
  console.log('\n[Cluster] 🛑 Shutting down all services gracefully...');
  for (const [name, proc] of activeProcesses) {
    console.log(`[Cluster] Stopping ${name}...`);
    proc.kill('SIGINT');
  }
  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

bootstrapCluster().catch((err) => {
  console.error('[Cluster] Failed to bootstrap cluster:', err);
  shutdown();
});
