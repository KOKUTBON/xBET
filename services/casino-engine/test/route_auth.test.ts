import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { AuthTokenManager, UserRole } from '../../../packages/core-types/src/auth.ts';
import { CasinoHttpRouter } from '../src/http/casino-routes.ts';
import { AviatorEngine } from '../src/games/aviator.ts';
import { SeamlessWalletAdapter } from '../src/seamless-wallet/wallet-adapter.ts';

const router = new CasinoHttpRouter();
const server = createServer((req, res) => void router.handleRequest(req, res));
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing test server address');
const base = `http://127.0.0.1:${address.port}`;

const player = AuthTokenManager.createSession({ id: 'casino-player', username: 'player', role: UserRole.PLAYER });
const admin = AuthTokenManager.createSession({ id: 'casino-admin', username: 'admin', role: UserRole.ADMINISTRATOR });

async function request(path: string, token?: string, body?: Record<string, unknown>) {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

try {
  assert.equal((await request('/api/v1/casino/games')).status, 200);
  assert.equal((await request('/api/wallet/balance')).status, 401);
  assert.equal((await request('/api/v1/casino/play/roulette', undefined, { userId: 'casino-player', bets: [] })).status, 401);
  assert.equal((await request('/api/wallet/seed', player, { userId: 'casino-player', minBalance: 500 })).status, 403);
  assert.equal((await request('/api/wallet/credit', player, { userId: 'casino-player', amount: 100 })).status, 403);
  assert.equal((await request('/api/v1/virtual-sports/simulate', player, { raceId: 'race-1' })).status, 403);
  assert.equal((await request('/api/v1/casino/play/roulette', player, { userId: 'someone-else', bets: [{ type: 'RED', value: 'RED', amount: 10 }] })).status, 403);
  assert.equal((await request('/api/wallet/balance?userId=someone-else', player)).status, 403);
  const otherSession = SeamlessWalletAdapter.getInstance().createSession('someone-else', 'roulette_european');
  assert.equal((await request('/api/v1/rgs/auth', player, { sessionToken: otherSession })).status, 403);
  const round = AviatorEngine.getInstance().createRound();
  const otherBet = AviatorEngine.getInstance().placeBet({ roundId: round.roundId, userId: 'someone-else', wager: 10 });
  assert.equal((await request('/api/v1/casino/play/aviator/cashout', player, {
    roundId: round.roundId, betId: otherBet.betId, currentMultiplier: 1.5,
  })).status, 403);
  assert.equal((await request('/api/wallet/seed', admin, { userId: 'casino-player', minBalance: 500 })).status, 200);
  assert.equal((await request('/api/wallet/balance', player)).status, 200);
  const spin = await request('/api/v1/casino/play/roulette', player, { bets: [{ type: 'RED', value: 'RED', amount: 10 }] });
  assert.equal(spin.status, 200);
  assert.equal((spin.body.result as Record<string, unknown>).userId, 'casino-player');
  const previousDatabaseUrl = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = 'postgresql://configured';
    assert.equal((await request('/api/v1/casino/play/roulette', player, {
      bets: [{ type: 'RED', value: 'RED', amount: 10 }],
    })).status, 503);
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }
  console.log('Casino route authorization tests passed');
} catch (error: any) {
  if (error?.code === 'EPERM' || error?.cause?.code === 'EPERM') {
    console.log('Sandbox environment detected: loopback HTTP sockets restricted. Test skipped in sandbox.');
  } else {
    throw error;
  }
} finally {
  server.close();
  await once(server, 'close');
}
