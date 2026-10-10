import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { HttpRouter } from '../../odds-engine/src/http/routes.ts';
import { LiveStateManager } from '../../odds-engine/src/domain/live-state.ts';
import { OddsEngineSelectionSource, QuoteService, QuoteError } from '../src/betting/quote-service.ts';
import { AuthTokenManager, UserRole } from '../../../packages/core-types/src/auth.ts';

const state = LiveStateManager.getInstance();
state.setFixture({
  id: 'quote-fixture', tournamentId: 1, tournamentName: 'Test League', sportId: 1, sportName: 'Football',
  homeTeam: 'Home', awayTeam: 'Away', startTime: new Date(), status: 'LIVE', isInPlay: true,
  score: { home: 0, away: 0 }, periodScores: [], matchMinute: 10, matchClock: '10:00', lastEvent: 'Kickoff',
  markets: new Map([['quote-market', {
    id: 'quote-market', marketType: '1X2', name: 'Match winner', status: 'ACTIVE', isInPlay: true, sortOrder: 0,
    selections: new Map([['quote-selection', {
      id: 'quote-selection', name: 'Home', odds: 2.1, previousOdds: null, status: 'ACTIVE', probability: 0.48, sortOrder: 0,
    }]]),
  }]]),
});

const router = new HttpRouter();
const server = createServer((req, res) => void router.handleRequest(req, res));
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Missing odds test server address');
const base = `http://127.0.0.1:${address.port}`;
const source = new OddsEngineSelectionSource(base);
const quotes = new QuoteService(source);

async function expectCode(action: () => Promise<unknown>, code: string) {
  await assert.rejects(action, (error: unknown) => error instanceof QuoteError && error.code === code);
}

try {
  const anonymousFeed = await fetch(`${base}/api/v1/feeds/ingest-fixtures`, { method: 'POST' });
  assert.equal(anonymousFeed.status, 401);
  const player = AuthTokenManager.createSession({ id: 'feed-player', username: 'player', role: UserRole.PLAYER });
  const playerFeed = await fetch(`${base}/api/v1/feeds/ingest-fixtures`, {
    method: 'POST', headers: { authorization: `Bearer ${player}` },
  });
  assert.equal(playerFeed.status, 403);
  const admin = AuthTokenManager.createSession({ id: 'feed-admin', username: 'admin', role: UserRole.ADMINISTRATOR });
  const adminFeed = await fetch(`${base}/api/v1/feeds/ingest-fixtures`, {
    method: 'POST', headers: { authorization: `Bearer ${admin}`, 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'TheOddsAPI', payload: [] }),
  });
  assert.equal(adminFeed.status, 200);

  const first = await quotes.issue('player-1', 'quote-fixture', 'quote-market', 'quote-selection');
  assert.equal(first.selection.odds, 2.1);
  assert.equal((await quotes.consume('player-1', first.quoteId)).odds, 2.1);
  await expectCode(() => quotes.consume('player-1', first.quoteId), 'QUOTE_NOT_FOUND');

  const changed = await quotes.issue('player-1', 'quote-fixture', 'quote-market', 'quote-selection');
  state.updateOdds('quote-fixture', 'quote-market', 'quote-selection', 2.2);
  await expectCode(() => quotes.consume('player-1', changed.quoteId), 'QUOTE_CHANGED');

  const changedScore = await quotes.issue('player-1', 'quote-fixture', 'quote-market', 'quote-selection');
  state.updateMatchState('quote-fixture', { home: 1, away: 0 }, 11, '11:00', 'LIVE', 'Goal');
  await expectCode(() => quotes.consume('player-1', changedScore.quoteId), 'QUOTE_CHANGED');

  state.suspendMarket('quote-fixture', 'quote-market', true);
  await expectCode(() => quotes.issue('player-1', 'quote-fixture', 'quote-market', 'quote-selection'), 'MARKET_NOT_QUOTABLE');
  state.suspendMarket('quote-fixture', 'quote-market', false);

  const shortLived = new QuoteService(source, 1);
  const expiring = await shortLived.issue('player-1', 'quote-fixture', 'quote-market', 'quote-selection');
  await new Promise((resolve) => setTimeout(resolve, 5));
  await expectCode(() => shortLived.consume('player-1', expiring.quoteId), 'QUOTE_EXPIRED');
  console.log('Odds source and server quote tests passed');
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
