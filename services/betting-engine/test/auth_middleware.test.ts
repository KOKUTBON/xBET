/**
 * Test Suite for Betting Engine Authentication & RBAC Enforcement (In-Memory HTTP Mocking)
 */

import { AuthTokenManager, AuthMiddleware, UserRole } from '../../../packages/core-types/src/auth.ts';
import { EventEmitter } from 'events';
import { IncomingMessage, ServerResponse } from 'http';
import { BettingHttpRouter } from '../src/http/betting-routes.ts';
import { QuoteService, type SelectionSnapshot } from '../src/betting/quote-service.ts';

class MockRequest extends EventEmitter {
  public method: string;
  public url: string;
  public headers: Record<string, string>;

  constructor(method: string, url: string, headers: Record<string, string> = {}, body?: any) {
    super();
    this.method = method;
    this.url = url;
    this.headers = headers;

    if (body) {
      setImmediate(() => {
        this.emit('data', JSON.stringify(body));
        this.emit('end');
      });
    } else {
      setImmediate(() => {
        this.emit('end');
      });
    }
  }
}

class MockResponse extends EventEmitter {
  public statusCode: number = 200;
  public headers: Record<string, string> = {};
  public body: string = '';

  public setHeader(key: string, value: string): void {
    this.headers[key.toLowerCase()] = value;
  }

  public writeHead(status: number, headers?: Record<string, string>): void {
    this.statusCode = status;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        this.setHeader(k, v);
      }
    }
  }

  public end(data?: string): void {
    if (data) this.body = data;
    this.emit('finish');
  }
}

async function runBettingAuthTests() {
  console.log('===============================================================');
  console.log('  🛡️ Running Betting Engine Auth & RBAC Route Guard Test Suite');
  console.log('===============================================================');

  const snapshot: SelectionSnapshot = {
    fixtureId: 'fix-owned', fixtureName: 'Home vs Away', fixtureStatus: 'LIVE', score: { home: 0, away: 0 }, lastUpdatedAt: Date.now(),
    marketId: 'market-owned', marketName: '1X2', marketStatus: 'ACTIVE',
    selectionId: 'selection-owned', selectionName: 'Home', selectionStatus: 'ACTIVE', odds: 2,
  };
  const router = new BettingHttpRouter(new QuoteService({ resolve: async () => ({ ...snapshot, score: { ...snapshot.score } }) }));

  const executeRequest = (method: string, path: string, headers: Record<string, string> = {}, body?: any): Promise<{ status: number; body: any }> => {
    return new Promise((resolve) => {
      const req = new MockRequest(method, path, headers, body) as unknown as IncomingMessage;
      const res = new MockResponse() as unknown as ServerResponse;

      (res as any).on('finish', () => {
        let parsedBody = (res as any).body;
        try {
          parsedBody = JSON.parse(parsedBody);
        } catch {
          // Keep raw
        }
        resolve({ status: (res as any).statusCode, body: parsedBody });
      });

      router.handleRequest(req, res);
    });
  };

  const playerToken = AuthTokenManager.createSession({
    id: 'usr-player-1',
    username: 'punter1',
    role: UserRole.PLAYER,
    currencyCode: 'USD',
  });

  const riskManagerToken = AuthTokenManager.createSession({
    id: 'usr-risk-1',
    username: 'risk_officer',
    role: UserRole.RISK_MANAGER,
    currencyCode: 'USD',
  });
  const adminToken = AuthTokenManager.createSession({
    id: 'usr-admin-1', username: 'admin', role: UserRole.ADMINISTRATOR, currencyCode: 'USD',
  });

  // --------------------------------------------------------------------------
  // Test 1: Public Health Check
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Public Endpoint (/api/v1/health)...');
  const healthRes = await executeRequest('GET', '/api/v1/health');
  console.log(`  Health Status: ${healthRes.status}`);
  if (healthRes.status !== 200) throw new Error('Health check failed');
  console.log('  ✅ Test 1 Passed: Public health endpoint requires no authentication.');

  const noAuthBet = await executeRequest('POST', '/api/v1/bets/place');
  if (noAuthBet.status !== 401) throw new Error(`Expected anonymous bet rejection, got ${noAuthBet.status}`);
  const noAuthGrant = await executeRequest('POST', '/api/v1/admin/points/adjust');
  if (noAuthGrant.status !== 401) throw new Error(`Expected anonymous grant rejection, got ${noAuthGrant.status}`);
  const noAuthResult = await executeRequest('POST', '/api/v1/settlement/fixture-result');
  if (noAuthResult.status !== 401) throw new Error(`Expected anonymous result rejection, got ${noAuthResult.status}`);
  const noAuthBalance = await executeRequest('GET', '/api/v1/wallet/balance/usr-player-1');
  if (noAuthBalance.status !== 401) throw new Error(`Expected anonymous balance rejection, got ${noAuthBalance.status}`);
  const otherBalance = await executeRequest('GET', '/api/v1/wallet/balance/usr-victim-99', { authorization: `Bearer ${playerToken}` });
  if (otherBalance.status !== 403) throw new Error(`Expected another player's balance rejection, got ${otherBalance.status}`);
  const playerGrant = await executeRequest('POST', '/api/v1/admin/points/adjust', { authorization: `Bearer ${playerToken}` }, { userId: 'usr-player-1', delta: 100 });
  if (playerGrant.status !== 403) throw new Error(`Expected player grant rejection, got ${playerGrant.status}`);
  const adminGrant = await executeRequest('POST', '/api/v1/admin/points/adjust', { authorization: `Bearer ${adminToken}` }, { userId: 'usr-player-1', delta: 100, currencyCode: 'USD' });
  if (adminGrant.status !== 200) throw new Error(`Expected admin grant success, got ${adminGrant.status}`);
  const issued = await executeRequest('POST', '/api/v1/bets/quote', { authorization: `Bearer ${playerToken}` }, {
    fixtureId: snapshot.fixtureId, marketId: snapshot.marketId, selectionId: snapshot.selectionId,
  });
  if (issued.status !== 201) throw new Error(`Quote issuance failed: ${issued.status}`);
  const ownBet = await executeRequest('POST', '/api/v1/bets/place', { authorization: `Bearer ${playerToken}` }, {
    quoteId: issued.body.quote.quoteId, stake: 10,
  });
  if (ownBet.status !== 201 || ownBet.body.ticket.userId !== 'usr-player-1') throw new Error('Authenticated bet was not bound to the player');
  const otherToken = AuthTokenManager.createSession({ id: 'usr-other', username: 'other', role: UserRole.PLAYER });
  const ticketId = ownBet.body.ticket.id;
  const otherTicket = await executeRequest('GET', `/api/v1/bets/tickets/${ticketId}`, { authorization: `Bearer ${otherToken}` });
  if (otherTicket.status !== 403) throw new Error(`Expected ticket privacy rejection, got ${otherTicket.status}`);
  const otherCashout = await executeRequest('POST', '/api/v1/bets/cashout', { authorization: `Bearer ${otherToken}` }, { slipId: ticketId, expectedAmount: 9 });
  if (otherCashout.status !== 403) throw new Error(`Expected cashout ownership rejection, got ${otherCashout.status}`);
  const replay = await executeRequest('POST', '/api/v1/bets/place', { authorization: `Bearer ${playerToken}` }, { quoteId: issued.body.quote.quoteId, stake: 10 });
  if (replay.status !== 409) throw new Error(`Expected consumed quote rejection, got ${replay.status}`);
  const forged = await executeRequest('POST', '/api/v1/bets/place', { authorization: `Bearer ${playerToken}` }, {
    stake: 10, legs: [{ ...snapshot, submittedOdds: 999 }],
  });
  if (forged.status !== 400) throw new Error(`Expected client odds rejection, got ${forged.status}`);

  const quoteForOther = await executeRequest('POST', '/api/v1/bets/quote', { authorization: `Bearer ${otherToken}` }, {
    fixtureId: snapshot.fixtureId, marketId: snapshot.marketId, selectionId: snapshot.selectionId,
  });
  const stolen = await executeRequest('POST', '/api/v1/bets/place', { authorization: `Bearer ${playerToken}` }, { quoteId: quoteForOther.body.quote.quoteId, stake: 10 });
  if (stolen.status !== 403) throw new Error(`Expected quote ownership rejection, got ${stolen.status}`);

  snapshot.odds = 2.2;
  const changedQuote = await executeRequest('POST', '/api/v1/bets/quote', { authorization: `Bearer ${playerToken}` }, {
    fixtureId: snapshot.fixtureId, marketId: snapshot.marketId, selectionId: snapshot.selectionId,
  });
  snapshot.odds = 1.9;
  const changed = await executeRequest('POST', '/api/v1/bets/place', { authorization: `Bearer ${playerToken}` }, { quoteId: changedQuote.body.quote.quoteId, stake: 10 });
  if (changed.status !== 409) throw new Error(`Expected changed odds rejection, got ${changed.status}`);
  snapshot.marketStatus = 'SUSPENDED';
  const suspended = await executeRequest('POST', '/api/v1/bets/quote', { authorization: `Bearer ${playerToken}` }, {
    fixtureId: snapshot.fixtureId, marketId: snapshot.marketId, selectionId: snapshot.selectionId,
  });
  if (suspended.status !== 409) throw new Error(`Expected suspended market rejection, got ${suspended.status}`);
  snapshot.marketStatus = 'ACTIVE';
  snapshot.lastUpdatedAt = Date.now() - 11000;
  const stale = await executeRequest('POST', '/api/v1/bets/quote', { authorization: `Bearer ${playerToken}` }, {
    fixtureId: snapshot.fixtureId, marketId: snapshot.marketId, selectionId: snapshot.selectionId,
  });
  if (stale.status !== 409) throw new Error(`Expected stale fixture rejection, got ${stale.status}`);

  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalVolatileFlag = process.env.XBET_ALLOW_VOLATILE_BETS;
  try {
    process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
    delete process.env.XBET_ALLOW_VOLATILE_BETS;
    snapshot.lastUpdatedAt = Date.now();
    const pointsToken = AuthTokenManager.createSession({ id: 'usr-points-test', username: 'points', role: UserRole.PLAYER, currencyCode: 'PTS' });
    const durableQuote = await executeRequest('POST', '/api/v1/bets/quote', { authorization: `Bearer ${pointsToken}` }, {
      fixtureId: snapshot.fixtureId, marketId: snapshot.marketId, selectionId: snapshot.selectionId,
    });
    const durablePlace = await executeRequest('POST', '/api/v1/bets/place', { authorization: `Bearer ${pointsToken}` }, {
      quoteId: '00000000-0000-0000-0000-000000000001', stake: 10, idempotencyKey: 'unavailable-test',
    });
    if (durableQuote.status !== 503 || durablePlace.status !== 503) {
      throw new Error('Database-configured routes must not accept volatile bets');
    }
  } finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalVolatileFlag === undefined) delete process.env.XBET_ALLOW_VOLATILE_BETS;
    else process.env.XBET_ALLOW_VOLATILE_BETS = originalVolatileFlag;
  }

  // --------------------------------------------------------------------------
  // Test 2: Protected Admin Route with Insufficient Permissions (Player -> Settlement DLQ)
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing RBAC on Admin DLQ Route (Player Token -> 403 Forbidden)...');
  const dlqResForbidden = await executeRequest('GET', '/api/v1/settlement/dlq', {
    authorization: `Bearer ${playerToken}`,
  });
  console.log(`  DLQ Response Status: ${dlqResForbidden.status}`);
  if (dlqResForbidden.status !== 403) throw new Error(`Expected 403 Forbidden, got ${dlqResForbidden.status}`);
  console.log('  ✅ Test 2 Passed: RBAC properly rejected player accessing administrator route.');

  // --------------------------------------------------------------------------
  // Test 3: Protected Risk Manager Route (Settlement Result Submission)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Risk Manager Endpoint Authorization...');
  const resultRes = await executeRequest(
    'POST',
    '/api/v1/settlement/fixture-result',
    {
      'content-type': 'application/json',
      authorization: `Bearer ${riskManagerToken}`,
    },
    {
      fixtureId: 'fix-auth-test-1',
      homeScore: 2,
      awayScore: 0,
    }
  );
  console.log(`  Fixture Result Status: ${resultRes.status}`);
  if (resultRes.status !== 200) throw new Error(`Expected 200 OK, got ${resultRes.status}`);
  console.log('  ✅ Test 3 Passed: Risk manager role authorized for fixture resulting.');

  // --------------------------------------------------------------------------
  // Test 4: Bet Placement with User Mismatch Prevention
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing User Identity Matching on Bet Placement...');
  const mismatchBetRes = await executeRequest(
    'POST',
    '/api/v1/bets/place',
    {
      'content-type': 'application/json',
      authorization: `Bearer ${playerToken}`, // Player token for usr-player-1
    },
    {
      userId: 'usr-victim-99', // Trying to bet with someone else's userId
      betType: 'SINGLE',
      stake: 10.0,
      legs: [
        {
          fixtureId: 'fix-1',
          fixtureName: 'Team A vs Team B',
          marketId: 'm1',
          marketName: '1X2',
          selectionId: 's1',
          selectionName: 'Team A',
          submittedOdds: 2.0,
        },
      ],
    }
  );
  console.log(`  Mismatch Bet Status: ${mismatchBetRes.status}`);
  if (mismatchBetRes.status !== 403) throw new Error(`Expected 403 Forbidden, got ${mismatchBetRes.status}`);
  console.log('  ✅ Test 4 Passed: Prevented spoofed user ID in bet placement payload.');

  console.log('\n===============================================================');
  console.log('  🎉 All Betting Engine Auth & RBAC Route Guard Tests Passed!  ');
  console.log('===============================================================');
}

runBettingAuthTests().catch((err) => {
  console.error('❌ Betting auth test failed:', err);
  process.exit(1);
});
