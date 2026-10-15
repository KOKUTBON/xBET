/**
 * Static GitHub Pages demo tests: sports engine, sportsbook settlement, wallet,
 * persistence and casino simulations. Runs offline with no dependencies:
 *   node --experimental-strip-types apps/web/test_demo.ts
 */
import assert from 'node:assert/strict';
import { DemoStateManager, DEMO_START_BALANCE, DEMO_TICK_MS } from './src/demo/demo-state.ts';
import { DemoSports, DEMO_LEAGUES, demoSeededRng, demoOutcome } from './src/demo/demo-sports.ts';
import { DemoCasino } from './src/demo/demo-casino.ts';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => void storage.set(k, v) },
});
globalThis.fetch = async () => { throw new Error('Static demo must never fetch APIs'); };

let now = Date.UTC(2026, 9, 5, 18, 0, 0);
const clock = () => now;
const make = (seed: number) => new DemoStateManager({ rng: demoSeededRng(seed), now: clock });
let passed = 0;
const test = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log(`  ✓ ${name}`); };

/** Build slip items exactly as the board's price buttons do. */
function pick(demo: DemoStateManager, fixture: any, marketIndex = 0, selIndex = 0) {
  const market = fixture.markets[marketIndex];
  const sel = market.selections[selIndex];
  return { selectionId: sel.id, selectionName: sel.name, marketId: market.id, marketName: market.name, fixtureId: fixture.id, fixtureName: `${fixture.homeTeam} vs ${fixture.awayTeam}`, odds: sel.odds };
}
function openFixture(demo: DemoStateManager, sportId?: number, exclude: string[] = []): any {
  return [...demo.liveFixtures.values()].find((f) => f.status !== 'FINISHED' && !f.isSuspended && (!sportId || f.sportId === sportId)
    && !exclude.includes(f.id) && f.markets[0].selections.every((s: any) => s.status !== 'SUSPENDED'));
}

console.log('Sports engine');
await test('every sport simulates to a valid final and grades consistently', () => {
  const rng = demoSeededRng(11);
  for (const league of DEMO_LEAGUES) {
    const f = DemoSports.createFixture({ id: 'T1', league, home: league.teams[0], away: league.teams[1], startTime: 0, rng, samples: 200 });
    assert.ok(f.markets.length >= 3, `${league.name} has markets`);
    DemoSports.playToEnd(f, rng);
    assert.equal(f.status, 'FINISHED');
    assert.ok(f.score.home >= 0 && f.score.away >= 0);
    if ([2, 3, 7, 8].includes(f.sportId)) assert.notEqual(f.score.home, f.score.away, `${league.name} has no draws`);
    for (const m of f.markets) {
      const winners = m.selections.filter((s: any) => DemoSports.grade(f, s.id) === 'WON');
      if (['1x2', 'ml', 'tot', 'hcp', 'btts', 'sets', 'cs'].includes(m.key)) assert.equal(winners.length, 1, `${m.name} has exactly one winner`);
    }
  }
});

await test('same seed replays the same match; prices carry a margin', () => {
  const league = DEMO_LEAGUES[1];
  const a = DemoSports.createFixture({ id: 'R', league, home: league.teams[0], away: league.teams[5], startTime: 0, rng: demoSeededRng(5) });
  const b = DemoSports.createFixture({ id: 'R', league, home: league.teams[0], away: league.teams[5], startTime: 0, rng: demoSeededRng(5) });
  assert.deepEqual(a.markets, b.markets);
  for (const m of a.markets.filter((x: any) => ['1x2', 'tot', 'btts', 'hcp'].includes(x.key))) {
    const book = m.selections.reduce((acc: number, s: any) => acc + 1 / s.odds, 0);
    assert.ok(book > 1.02 && book < 1.1, `${m.name} overround ${book.toFixed(3)}`);
  }
  assert.ok(a.markets[0].selections[0].odds < a.markets[0].selections[2].odds, 'stronger home side is favourite');
});

await test('outcome rules: totals, handicaps, BTTS, correct score, sets', () => {
  assert.equal(demoOutcome('tot', 2.5, 'O', { home: 2, away: 1 }, 1), true);
  assert.equal(demoOutcome('tot', 2.5, 'U', { home: 2, away: 1 }, 1), false);
  assert.equal(demoOutcome('hcp', -1.5, 'H', { home: 2, away: 1 }, 1), false);
  assert.equal(demoOutcome('hcp', -1.5, 'A', { home: 2, away: 1 }, 1), true);
  assert.equal(demoOutcome('btts', null, 'Y', { home: 1, away: 0 }, 1), false);
  assert.equal(demoOutcome('cs', null, 'OTH', { home: 4, away: 0 }, 1), true);
  assert.equal(demoOutcome('dc', null, '1X', { home: 1, away: 1 }, 1), true);
  assert.equal(demoOutcome('sets', null, '1-2', { home: 1, away: 2, games: 30 }, 2), true);
  assert.equal(demoOutcome('tot', 21.5, 'O', { home: 2, away: 0, games: 22 }, 2), true);
});

console.log('Board and sportsbook');
await test('board seeds 7 sports and keeps ~20 events live for 30 minutes', () => {
  storage.clear();
  const demo = make(1);
  const fixtures = [...demo.liveFixtures.values()];
  assert.equal(new Set(fixtures.map((f) => f.sportId)).size, 7);
  assert.ok(fixtures.length >= 36, `fixtures ${fixtures.length}`);
  assert.ok(fixtures.reduce((acc, f) => acc + f.markets.length, 0) >= 180);
  for (let i = 0; i < 720; i++) {
    now += DEMO_TICK_MS;
    demo.tick();
    if (i % 240 === 239) {
      const live = [...demo.liveFixtures.values()].filter((f) => f.status === 'LIVE').length;
      assert.ok(live >= 12 && live <= 28, `live events ${live}`);
    }
  }
});

await test('single: stake debited once, settles at full time, pays exactly once', async () => {
  storage.clear();
  const demo = make(2);
  const f = openFixture(demo, 1);
  demo.toggleSelection(pick(demo, f));
  demo.setStake(25);
  await demo.placeSlipBet();
  assert.equal(demo.userBalance, DEMO_START_BALANCE - 25);
  const ticket = demo.myTickets[0];
  assert.equal(ticket.status, 'OPEN');
  assert.ok(ticket.legs[0].selectionId);
  demo.finishMyMatches();
  assert.ok(['WON', 'LOST'].includes(ticket.status));
  assert.equal(ticket.legs[0].status, DemoSports.grade(demo.liveFixtures.get(f.id), ticket.legs[0].selectionId!));
  const expected = DEMO_START_BALANCE - 25 + ((ticket.status as string) === 'WON' ? ticket.potentialPayout : 0);
  assert.equal(demo.userBalance, Math.round(expected * 100) / 100);
  demo.finishMyMatches();
  for (let i = 0; i < 40; i++) { now += DEMO_TICK_MS; demo.tick(); }
  assert.equal(demo.userBalance, Math.round(expected * 100) / 100, 'no double settlement');
});

await test('combi pays the product of odds; same-match combis and overdrafts are rejected', async () => {
  storage.clear();
  const demo = make(3);
  const a = openFixture(demo, 1);
  const b = openFixture(demo, 3, [a.id]);
  demo.toggleSelection(pick(demo, a));
  demo.toggleSelection(pick(demo, b));
  assert.equal(demo.slipType, 'COMBI');
  await demo.placeSlipBet();
  const combi = demo.myTickets[0];
  assert.equal(combi.betType, 'COMBI');
  assert.equal(combi.legs.length, 2);
  assert.equal(combi.totalOdds, Math.round(combi.legs[0].lockedOdds * combi.legs[1].lockedOdds * 100) / 100);
  demo.finishMyMatches();
  assert.equal(combi.status, combi.legs.every((l) => l.status === 'WON') ? 'WON' : 'LOST');

  const before = demo.userBalance;
  const c = openFixture(demo, 1);
  demo.toggleSelection(pick(demo, c, 0, 0));
  demo.toggleSelection(pick(demo, c, 0, 2));
  await demo.placeSlipBet();
  assert.equal(demo.userBalance, before, 'same-match combi rejected');
  demo.clearSlip();
  demo.toggleSelection(pick(demo, c));
  demo.stakeAmount = before + 1;
  await demo.placeSlipBet();
  demo.stakeAmount = Infinity;
  await demo.placeSlipBet();
  assert.equal(demo.userBalance, before, 'overdraft rejected');
  c.isSuspended = true;
  demo.setStake(10);
  await demo.placeSlipBet();
  assert.equal(demo.userBalance, before, 'suspended market rejected');
  c.isSuspended = false;
});

await test('several selections in Single mode place one ticket each', async () => {
  storage.clear();
  const demo = make(4);
  const a = openFixture(demo, 1);
  const b = openFixture(demo, 2);
  const c = openFixture(demo, 4);
  for (const f of [a, b, c]) demo.toggleSelection(pick(demo, f));
  demo.setSlipType('SINGLE');
  demo.setStake(10);
  await demo.placeSlipBet();
  assert.equal(demo.myTickets.length, 3);
  assert.ok(demo.myTickets.every((t) => t.betType === 'SINGLE' && t.stake === 10));
  assert.equal(demo.userBalance, DEMO_START_BALANCE - 30);
});

await test('cash out credits the offer once and closes the ticket', async () => {
  storage.clear();
  const demo = make(5);
  const f = openFixture(demo, 1);
  demo.toggleSelection(pick(demo, f));
  demo.setStake(100);
  await demo.placeSlipBet();
  const ticket = demo.myTickets[0];
  const offer = demo.cashOutValue(ticket);
  assert.ok(offer !== null && offer > 0 && offer < 100, `offer ${offer}`);
  demo.cashOut(ticket.id);
  assert.equal(ticket.status, 'CASHED OUT');
  assert.equal(demo.userBalance, Math.round((DEMO_START_BALANCE - 100 + offer!) * 100) / 100);
  demo.cashOut(ticket.id);
  demo.finishMyMatches();
  assert.equal(demo.userBalance, Math.round((DEMO_START_BALANCE - 100 + offer!) * 100) / 100);
});

await test('wallet persists, and a closed tab catches up and settles on reopen', async () => {
  storage.clear();
  const demo = make(6);
  demo.depositDemo(1000);
  const f = openFixture(demo, 1);
  demo.toggleSelection(pick(demo, f));
  demo.setStake(50);
  await demo.placeSlipBet();
  const restored = make(7);
  assert.equal(restored.userBalance, demo.userBalance);
  assert.deepEqual(restored.myTickets.map((t) => t.id), demo.myTickets.map((t) => t.id));
  assert.ok(restored.liveFixtures.has(f.id), 'board restored');
  now += 60 * 60 * 1000; // an hour later
  const later = make(8);
  assert.notEqual(later.myTickets[0].status, 'OPEN', 'ticket settled during catch-up');
  const s = later.summary();
  assert.equal(s.tickets, 1);
  assert.ok(later.demoTransactions.length >= 2);
  later.resetDemo();
  assert.equal(later.userBalance, DEMO_START_BALANCE);
  assert.equal(make(9).myTickets.length, 0);
});

console.log('Casino');
await test('long-run returns stay in realistic ranges', () => {
  const rng = demoSeededRng(99);
  const N = 60000;
  const rtp = (f: () => number) => { let s = 0; for (let i = 0; i < N; i++) s += f(); return s / N; };
  const checks: Array<[string, number, number, number]> = [
    ['roulette', rtp(() => DemoCasino.roulette('RED', 1, rng).payout), 0.93, 1.0],
    ['slots fruits', rtp(() => DemoCasino.slots('slot-fruits', 1, rng).payout), 0.88, 1.02],
    ['slots treasure', rtp(() => DemoCasino.slots('ancient-treasure', 1, rng).payout), 0.88, 1.02],
    ['slots space', rtp(() => DemoCasino.slots('slot-space', 1, rng).payout), 0.88, 1.02],
    ['blackjack', rtp(() => DemoCasino.blackjack(1, rng).payout), 0.93, 1.01],
    ['baccarat', rtp(() => DemoCasino.baccarat('BANKER', 1, rng).payout), 0.96, 1.01],
    ['high-low', rtp(() => DemoCasino.highLow('HIGHER', 1, rng).payout), 0.93, 1.0],
    ['keno', rtp(() => DemoCasino.keno([3, 7, 18, 24, 55], 1, rng).payout), 0.88, 1.02],
    ['scratch', rtp(() => DemoCasino.scratch(1, rng).payout), 0.88, 1.0],
    ['bingo', rtp(() => DemoCasino.bingo(1, rng).payout), 0.85, 1.05],
  ];
  for (const [name, value, lo, hi] of checks) assert.ok(value > lo && value < hi, `${name} RTP ${(value * 100).toFixed(1)}%`);
});

await test('game rules: roulette zero, baccarat push, blackjack totals, scratch prizes', () => {
  assert.equal(DemoCasino.roulette('RED', 10, () => 0).payout, 0, 'zero loses even-money bets');
  assert.equal(DemoCasino.roulette('RED', 10, () => 1 / 37).payout, 20, 'pocket 1 is red');
  const rng = demoSeededRng(3);
  for (let i = 0; i < 2000; i++) {
    const bac = DemoCasino.baccarat('PLAYER', 10, rng);
    if (bac.gameState.winner === 'TIE') assert.equal(bac.payout, 10);
    const bj = DemoCasino.blackjack(10, rng);
    assert.ok([0, 10, 20, 25].includes(bj.payout), `blackjack payout ${bj.payout}`);
    const sc = DemoCasino.scratch(1, rng);
    const counts = new Map<number, number>();
    sc.gameState.grid.flat().forEach((v: number) => counts.set(v, (counts.get(v) || 0) + 1));
    const triple = [...counts.entries()].filter(([, n]) => n >= 3).map(([v]) => v);
    assert.deepEqual(triple, sc.payout ? [sc.payout] : [], 'only the prize appears three times');
  }
});

await test('casino rounds and virtual races move the local wallet', async () => {
  storage.clear();
  const demo = make(10);
  demo.launchGame('blackjack', 'Classic Blackjack');
  demo.setGameStake(20);
  await demo.playActiveGame();
  const r = demo.lastGameResult;
  assert.equal(r.error, undefined);
  assert.equal(demo.userBalance, DEMO_START_BALANCE - 20 + r.payout);
  demo.launchGame('dogs', 'Virtual Greyhound Racing', 'virtual');
  await new Promise((resolve) => setTimeout(resolve, 0));
  const race = demo.virtualRaces.find((x: any) => x.type === 'GREYHOUND');
  const before = demo.userBalance;
  await demo.playVirtualRace(race.id, 2);
  const result = demo.lastGameResult.raw;
  assert.equal(result.finishOrder.length, 6);
  assert.equal(demo.userBalance, Math.round((before - 20 + result.payout) * 100) / 100);
  assert.notEqual(demo.virtualRaces.find((x: any) => x.type === 'GREYHOUND').id, race.id, 'next race card opened');
  assert.equal((await demo.playCasinoGame('/api/v1/casino/play/roulette', { bets: [{ type: 'RED', amount: 1e9 }] })).error !== undefined, true);
  demo.launchGame('gates-of-olympus', 'Gates of Olympus');
  assert.notEqual(demo.activeGameSlug, 'gates-of-olympus', 'titles outside the demo catalogue do not launch');
  assert.equal(demo.summary().casinoRounds, 2);
});

console.log(`\nDemo tests passed: ${passed} groups · engine, singles/combis, cash out, persistence, casino returns. No API requests.`);
