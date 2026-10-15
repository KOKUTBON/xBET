/** Run with XBET_PG_TEST_URL pointing at a disposable PostgreSQL database. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import pg from 'pg';
import { DurableAcceptanceService, AcceptanceError } from '../src/betting/durable-acceptance.ts';
import { BettingHttpRouter } from '../src/http/betting-routes.ts';
import { QuoteService } from '../src/betting/quote-service.ts';
import type { SelectionSnapshot, ServerQuote } from '../src/betting/quote-service.ts';
import { AuthTokenManager, UserRole } from '../../../packages/core-types/src/auth.ts';

const connectionString = process.env.XBET_PG_TEST_URL;
if (!connectionString) {
  console.log('PostgreSQL acceptance integration test skipped (set XBET_PG_TEST_URL).');
} else {
  const databaseName = new URL(connectionString).pathname.slice(1);
  if (!databaseName.includes('test')) throw new Error('Refusing to run against a database without test in its name');
  const pool = new pg.Pool({ connectionString });
  const service = new DurableAcceptanceService(pool);
  const suffix = randomUUID();
  const userId = `test-user-${suffix}`;
  const selectionId = `test-selection-${suffix}`;
  const selection: SelectionSnapshot = {
    fixtureId: `fixture-${suffix}`, fixtureName: 'Home v Away', fixtureStatus: 'LIVE',
    score: { home: 0, away: 0 }, lastUpdatedAt: Date.now(),
    marketId: `market-${suffix}`, marketName: '1X2', marketStatus: 'ACTIVE',
    selectionId, selectionName: 'Home', selectionStatus: 'ACTIVE', odds: 2,
  };
  const makeQuote = (): ServerQuote => ({
    quoteId: randomUUID(), userId, expiresAt: Date.now() + 60_000, selection,
  });
  const revalidate = async (snapshot: SelectionSnapshot) => snapshot;

  try {
    const initialGrant = await service.adjustPoints(userId, 100, `grant-${suffix}`);
    const repeatedGrant = await service.adjustPoints(userId, 100, `grant-${suffix}`);
    assert.equal(repeatedGrant.journalEntryId, initialGrant.journalEntryId);
    assert.equal(await service.getBalance(userId), 100);
    await assert.rejects(service.adjustPoints(userId, 101, `grant-${suffix}`),
      (error: unknown) => error instanceof AcceptanceError && error.code === 'IDEMPOTENCY_KEY_CONFLICT');
    const quote = makeQuote();
    await service.issueQuote(quote);
    const first = await service.accept(userId, quote.quoteId, `first-${suffix}`, 10, revalidate);
    assert.equal(first.remainingBalance, 90);
    assert.equal(first.ticket.potentialPayout, 20);
    const repeated = await service.accept(userId, quote.quoteId, `first-${suffix}`, 10, revalidate);
    assert.equal(repeated.ticket.id, first.ticket.id);
    assert.equal(await service.getBalance(userId), 90);
    await assert.rejects(service.accept(userId, quote.quoteId, `second-${suffix}`, 10, revalidate),
      (error: unknown) => error instanceof AcceptanceError && error.code === 'QUOTE_EXPIRED_OR_USED');
    const count = await pool.query<{ count: string }>(
      'SELECT count(*) FROM points_journals WHERE reference_id = $1', [first.ticket.id],
    );
    assert.equal(Number(count.rows[0].count), 1);

    const q2 = makeQuote();
    const q3 = makeQuote();
    await Promise.all([service.issueQuote(q2), service.issueQuote(q3)]);
    const concurrent = await Promise.allSettled([
      service.accept(userId, q2.quoteId, `parallel-a-${suffix}`, 70, revalidate),
      service.accept(userId, q3.quoteId, `parallel-b-${suffix}`, 70, revalidate),
    ]);
    assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(await service.getBalance(userId), 20);
    const lateRepeat = await service.accept(userId, quote.quoteId, `first-${suffix}`, 10, revalidate);
    assert.equal(lateRepeat.remainingBalance, 90);
    const outbox = await pool.query<{ count: string }>(
      'SELECT count(*) FROM points_outbox WHERE aggregate_id = $1', [first.ticket.id],
    );
    assert.equal(Number(outbox.rows[0].count), 1);

    const duplicateUser = `duplicate-user-${suffix}`;
    await service.adjustPoints(duplicateUser, 100, `duplicate-grant-${suffix}`);
    const duplicateQuote = { ...makeQuote(), userId: duplicateUser };
    await service.issueQuote(duplicateQuote);
    const duplicateAttempts = await Promise.all([
      service.accept(duplicateUser, duplicateQuote.quoteId, `duplicate-${suffix}`, 10, revalidate),
      service.accept(duplicateUser, duplicateQuote.quoteId, `duplicate-${suffix}`, 10, revalidate),
    ]);
    assert.equal(duplicateAttempts[0].ticket.id, duplicateAttempts[1].ticket.id);
    assert.equal(await service.getBalance(duplicateUser), 90);

    const failingUser = `fault-user-${suffix}`;
    const failingQuote: ServerQuote = { ...makeQuote(), userId: failingUser };
    await service.adjustPoints(failingUser, 100, `fault-grant-${suffix}`);
    await service.issueQuote(failingQuote);
    const triggerName = `fault_${suffix.replaceAll('-', '_')}`;
    await pool.query(`CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.payload->>'userId' = '${failingUser}' THEN RAISE EXCEPTION 'injected outbox failure'; END IF;
        RETURN NEW;
      END $$`);
    await pool.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON points_outbox
      FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`);
    try {
      await assert.rejects(
        service.accept(failingUser, failingQuote.quoteId, `fault-${suffix}`, 10, revalidate),
        (error: unknown) => error instanceof AcceptanceError && error.code === 'DURABLE_STORE_UNAVAILABLE',
      );
    } finally {
      await pool.query(`DROP TRIGGER ${triggerName} ON points_outbox`);
      await pool.query(`DROP FUNCTION ${triggerName}()`);
    }
    assert.equal(await service.getBalance(failingUser), 100);
    assert.equal((await service.getQuote(failingQuote.quoteId))?.consumed_at, null);
    assert.deepEqual(await service.getUserTickets(failingUser), []);
    const liability = await pool.query<{ liability_minor: string }>(
      'SELECT liability_minor FROM points_liabilities WHERE selection_id = $1', [selectionId],
    );
    assert.equal(Number(liability.rows[0].liability_minor), 9000);

    const priorUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = connectionString;
    const httpUser = `http-user-${suffix}`;
    const router = new BettingHttpRouter(new QuoteService({ resolve: async () => ({ ...selection, lastUpdatedAt: Date.now() }) }));
    const server = createServer((req, res) => { void router.handleRequest(req, res); });
    try {
      server.listen(0, '127.0.0.1');
      await once(server, 'listening');
      const port = (server.address() as { port: number }).port;
      const post = async (path: string, token: string, body: object) => {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        return { status: response.status, body: await response.json() as any };
      };
      const admin = AuthTokenManager.createSession({ id: `admin-${suffix}`, username: 'admin', role: UserRole.ADMINISTRATOR, currencyCode: 'PTS' });
      const player = AuthTokenManager.createSession({ id: httpUser, username: 'player', role: UserRole.PLAYER, currencyCode: 'PTS' });
      const granted = await post('/api/v1/admin/points/adjust', admin, {
        userId: httpUser, delta: 50, currencyCode: 'PTS', idempotencyKey: `http-grant-${suffix}`,
      });
      assert.equal(granted.status, 200);
      const issued = await post('/api/v1/bets/quote', player, {
        fixtureId: selection.fixtureId, marketId: selection.marketId, selectionId,
      });
      assert.equal(issued.status, 201);
      const placed = await post('/api/v1/bets/place', player, {
        quoteId: issued.body.quote.quoteId, idempotencyKey: `http-${suffix}`, stake: 10,
      });
      assert.equal(placed.status, 201);
      assert.equal(placed.body.remainingBalance, 40);
      const ticketResponse = await fetch(`http://127.0.0.1:${port}/api/v1/bets/tickets/${placed.body.ticket.id}`, {
        headers: { authorization: `Bearer ${player}` },
      });
      assert.equal(ticketResponse.status, 200);
      assert.equal((await ticketResponse.json() as any).ticket.id, placed.body.ticket.id);
      const otherPlayer = AuthTokenManager.createSession({
        id: `other-http-user-${suffix}`, username: 'other', role: UserRole.PLAYER, currencyCode: 'PTS',
      });
      const privateTicket = await fetch(`http://127.0.0.1:${port}/api/v1/bets/tickets/${placed.body.ticket.id}`, {
        headers: { authorization: `Bearer ${otherPlayer}` },
      });
      assert.equal(privateTicket.status, 403);
      const noCashout = await post('/api/v1/bets/cashout', player, { slipId: placed.body.ticket.id, expectedAmount: 9 });
      assert.equal(noCashout.status, 503);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await router.close();
      if (priorUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = priorUrl;
    }
    console.log('Durable acceptance integration tests passed');
  } finally {
    await pool.end();
  }
}
