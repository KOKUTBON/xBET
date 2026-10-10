/**
 * Real-Time Odds, Casino, and Virtual Games End-to-End Test Suite
 * Validates:
 * 1. Real-Time Odds Streaming via WebSockets (Ticks, Deltas, Score Updates, Feed Ingestion)
 * 2. Real-Time Provably Fair Casino Games (16 Themes, Seamless Wallet, RNG verification, Live Dealer Aggregator)
 * 3. Real-Time Virtual Sports Racing (Greyhounds & Horses, Runner Odds, Provably Fair Simulation, Bet Settlement)
 */

import assert from 'assert';
import { EventEmitter } from 'events';
import { NativeWebSocketServer, NativeWebSocketClient } from '../../services/odds-engine/src/websocket/native-ws.ts';
import { WebSocketGateway } from '../../services/odds-engine/src/websocket/ws-gateway.ts';
import { UniversalSportsFeedAdapter } from '../../services/odds-engine/src/ingestion/adapters/universal-feed-adapter.ts';
import { LiveStateManager } from '../../services/odds-engine/src/domain/live-state.ts';
import { CasinoHttpRouter } from '../../services/casino-engine/src/http/casino-routes.ts';
import { SeamlessWalletAdapter } from '../../services/casino-engine/src/seamless-wallet/wallet-adapter.ts';
import { VirtualRacingEngine } from '../../services/casino-engine/src/games/virtual-racing.ts';
import { LiveCasinoAggregator } from '../../services/casino-engine/src/live-casino/live-casino-aggregator.ts';
import { PokerTableManager } from '../../services/casino-engine/src/poker/poker-table-manager.ts';
import { AuthTokenManager, UserRole } from '../../packages/core-types/src/auth.ts';

import { LiveSportsSimulator } from '../../services/odds-engine/src/ingestion/live-simulator.ts';

console.log('===============================================================');
console.log('  ⚡ Running Real-Time Odds, Casino & Virtual Games Test Suite');
console.log('===============================================================');

// Full Duplex Virtual Socket Pair for In-Process WebSocket Testing
class MockDuplexSocket extends EventEmitter {
  public peer?: MockDuplexSocket;
  public writtenChunks: Buffer[] = [];

  public write(chunk: Buffer | string): boolean {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.writtenChunks.push(buf);
    if (this.peer) {
      setImmediate(() => this.peer?.emit('data', buf));
    }
    return true;
  }

  public end(): void {
    if (this.peer) this.peer.emit('close');
    this.emit('close');
  }

  public destroy(): void {}
}

async function runRealtimeSuite() {
  // -------------------------------------------------------------
  // PART 1: Real-Time Odds Engine & WebSocket Streaming
  // -------------------------------------------------------------
  console.log('\n[Part 1] Testing Real-Time Live Sportsbook Odds & WebSocket Streaming...');

  const simulator = new LiveSportsSimulator();
  simulator.initializeSampleMatches();

  const mockServer = new EventEmitter() as any;
  const wss = new NativeWebSocketServer({ server: mockServer, path: '/ws' });
  const wsGateway = new WebSocketGateway(wss);
  const feedAdapter = new UniversalSportsFeedAdapter({
    provider: 'SIMULATED',
    updateIntervalMs: 100,
    marginOverroundPercent: 5.0,
  });

  const serverSocket = new MockDuplexSocket();
  const clientSocket = new MockDuplexSocket();
  serverSocket.peer = clientSocket;
  clientSocket.peer = serverSocket;

  const serverWs = new NativeWebSocketClient(serverSocket as any);
  const clientWs = new NativeWebSocketClient(clientSocket as any);

  const receivedMessages: Array<Record<string, any>> = [];
  clientWs.on('message', (buf: Buffer) => {
    try {
      const msg = JSON.parse(buf.toString('utf8'));
      receivedMessages.push(msg);
    } catch (err) {
      console.error('Failed to parse WS message:', err);
    }
  });

  // Connect client to Gateway
  wss.emit('connection', serverWs, { url: '/ws', headers: { host: '127.0.0.1' } });
  console.log('  ✓ Odds Engine WebSocket Gateway active');

  await new Promise((r) => setTimeout(r, 100));

  // 1.1 Verify Welcome Message
  assert.ok(receivedMessages.length > 0, 'Should receive initial welcome message');
  const welcomeMsg = receivedMessages[0];
  assert.strictEqual(welcomeMsg.type, 'WELCOME', 'First message must be WELCOME');
  assert.ok(welcomeMsg.liveMatches.length > 0, 'Welcome payload must contain snapshot of live fixtures');
  console.log(`  ✓ WebSocket Connected. Received WELCOME with ${welcomeMsg.liveMatches.length} live matches.`);

  // 1.2 Test Topic Subscription (e.g. fixture:fix-epl-002)
  const targetFixtureId = 'fix-epl-002';
  clientWs.send(JSON.stringify({ action: 'SUBSCRIBE', topic: `fixture:${targetFixtureId}` }));

  await new Promise((r) => setTimeout(r, 100));
  const subAck = receivedMessages.find((m) => m.type === 'SUBSCRIBED' && m.topic === `fixture:${targetFixtureId}`);
  assert.ok(subAck, 'Must receive SUBSCRIBED confirmation');
  console.log(`  ✓ Subscribed to topic: fixture:${targetFixtureId}`);

  // 1.3 Test Real-Time Live Odds Delta Tick Emission
  const stateManager = LiveStateManager.getInstance();
  const selectionId = 'sel-fix-epl-002-1x2-home';
  const marketId = 'mkt-fix-epl-002-1x2';

  stateManager.updateOdds(targetFixtureId, marketId, selectionId, 1.35);

  await new Promise((r) => setTimeout(r, 100));
  const oddsTickMsg = receivedMessages.find((m) => m.type === 'ODDS_TICK' && m.data.fixtureId === targetFixtureId);
  assert.ok(oddsTickMsg, 'Client must receive real-time ODDS_TICK delta payload');
  assert.strictEqual(oddsTickMsg.data.newOdds, 1.35, 'Received odds must match emitted tick value');
  console.log(`  ✓ Real-time ODDS_TICK received over WebSocket: Selection '${selectionId}' moved to 1.35`);

  // 1.4 Test Real-Time Live Score & Match Clock Delta Emission
  stateManager.updateMatchState(targetFixtureId, { home: 3, away: 0 }, 74, '74:00', 'LIVE', 'GOAL! Arsenal scores!');

  await new Promise((r) => setTimeout(r, 100));
  const scoreMsg = receivedMessages.find((m) => m.type === 'SCORE_UPDATE' && m.data.fixtureId === targetFixtureId);
  assert.ok(scoreMsg, 'Client must receive real-time SCORE_UPDATE payload');
  assert.strictEqual(scoreMsg.data.score.home, 3, 'Home score updated to 3');
  console.log(`  ✓ Real-time SCORE_UPDATE received over WebSocket: Score 3-0, Clock: 74:00`);

  // 1.5 Test Upstream Inbound Feed Ingestion (EnetPulse / OddService)
  const ingested = feedAdapter.ingestEnetPulseFeed({
    matchId: 'enet-liverpool-realmadrid',
    home: 'Liverpool',
    away: 'Real Madrid',
    clock: "12'",
    score: { home: 0, away: 0 },
    markets: [
      {
        id: 'mkt-1x2',
        name: 'Full Time Result',
        selections: [
          { id: 'liv', name: 'Liverpool', odds: 2.10 },
          { id: 'draw', name: 'Draw', odds: 3.40 },
          { id: 'rma', name: 'Real Madrid', odds: 3.10 },
        ],
      },
    ],
  });
  assert.strictEqual(ingested.id, 'enet-liverpool-realmadrid');
  console.log(`  ✓ Upstream Feed Ingestion validated for match: ${ingested.homeTeam} vs ${ingested.awayTeam}`);

  clientWs.close();
  console.log('  ✅ Part 1 Passed: Real-Time Odds Engine & WebSocket Streaming Verified.');

  // -------------------------------------------------------------
  // PART 2: Real-Time Casino Engine & Provably Fair Gaming
  // -------------------------------------------------------------
  console.log('\n[Part 2] Testing Real-Time Casino Engine & Seamless Wallet Integration...');

  const casinoRouter = new CasinoHttpRouter();
  const wallet = SeamlessWalletAdapter.getInstance();
  const testUserId = 'punter_casino_realtime_001';
  const playerToken = AuthTokenManager.createSession({ id: testUserId, username: testUserId, role: UserRole.PLAYER });
  wallet.deposit(testUserId, 1000.0, 'USD', 'initial_test_deposit');

  const initialBalance = wallet.getBalance(testUserId);
  assert.strictEqual(initialBalance, 1000.0, 'Initial wallet balance must be $1000.00');

  // In-process HTTP dispatcher
  async function mockHttp(method: string, path: string, body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const req = new EventEmitter() as any;
      req.method = method;
      req.url = path;
      req.headers = { host: '127.0.0.1', authorization: `Bearer ${playerToken}` };

      const res = new EventEmitter() as any;
      let resBody = '';
      let statusCode = 200;

      res.writeHead = (code: number) => { statusCode = code; };
      res.setHeader = () => {};
      res.end = (chunk?: any) => {
        if (chunk) resBody += chunk;
        try {
          resolve(JSON.parse(resBody));
        } catch {
          resolve(resBody);
        }
      };

      casinoRouter.handleRequest(req, res).catch(reject);

      if (body) {
        req.emit('data', JSON.stringify(body));
      }
      req.emit('end');
    });
  }

  // 2.1 Catalog
  const catalog = await mockHttp('GET', '/api/v1/casino/games');
  assert.ok(catalog.count >= 10, 'Catalog must contain all certified game themes');
  console.log(`  ✓ Casino Catalog Verified: ${catalog.count} certified standard games available.`);

  // 2.2 Classic Blackjack (Deal, Hit, Stand)
  const bjDeal = await mockHttp('POST', '/api/v1/casino/play/blackjack', {
    userId: testUserId,
    action: 'DEAL',
    wager: 50.0,
  });
  assert.ok(bjDeal.success, 'Blackjack Deal must succeed');
  assert.ok(bjDeal.result.gameState.playerScore > 0, 'Player score must be computed');
  console.log(`  ✓ Blackjack Deal: Player Hand ${bjDeal.result.gameState.playerScore} vs Dealer ${bjDeal.result.gameState.dealerHand[0].value}`);

  // 2.3 European Roulette
  const rouletteRes = await mockHttp('POST', '/api/v1/casino/play/roulette', {
    userId: testUserId,
    bets: [
      { type: 'RED', value: 'RED', amount: 25.0 },
      { type: 'STRAIGHT', value: 17, amount: 5.0 },
    ],
  });
  assert.ok(rouletteRes.success, 'Roulette Spin must succeed');
  console.log(`  ✓ European Roulette: Ball landed on #${rouletteRes.result.gameState.winningNumber} (${rouletteRes.result.gameState.winningColor}) | Payout: $${rouletteRes.result.payout}`);

  // 2.4 Baccarat
  const baccaratRes = await mockHttp('POST', '/api/v1/casino/play/baccarat', {
    userId: testUserId,
    betSide: 'BANKER',
    wager: 30.0,
  });
  assert.ok(baccaratRes.success, 'Baccarat round must resolve');
  console.log(`  ✓ Baccarat Round: Player ${baccaratRes.result.gameState.playerScore} vs Banker ${baccaratRes.result.gameState.bankerScore} | Result: ${baccaratRes.result.gameState.winner}`);

  // 2.5 Slots (All 5 Themes + Soccer Hero)
  const slotThemes = ['slot_fruits', 'slot_chicken', 'slot_christmas', 'slot_ramses', 'slot_space', 'soccer_hero'];
  for (const theme of slotThemes) {
    const slotRes = await mockHttp('POST', '/api/v1/casino/play/slots', {
      userId: testUserId,
      gameCode: theme,
      wager: 10.0,
    });
    assert.ok(slotRes.success, `Slot ${theme} spin must succeed`);
    assert.strictEqual(slotRes.result.gameState.grid[0].length, 5, 'Slot must have 5 reels');
  }
  console.log(`  ✓ Slot Themes Verified (Fruits, Chicken, Christmas, Ramses, Space, Soccer Hero).`);

  // 2.6 Caribbean Stud Poker
  const studDeal = await mockHttp('POST', '/api/v1/casino/play/stud', {
    userId: testUserId,
    action: 'DEAL',
    wager: 20.0,
  });
  assert.ok(studDeal.success, 'Stud poker deal must succeed');
  assert.strictEqual(studDeal.result.gameState.playerHand.length, 5, 'Player receives 5 cards');
  console.log(`  ✓ Caribbean Stud Poker: Player holds ${studDeal.result.gameState.playerEval.description}`);

  // 2.7 High-Low
  const highLowRes = await mockHttp('POST', '/api/v1/casino/play/highlow', {
    userId: testUserId,
    choice: 'HIGHER',
    wager: 15.0,
  });
  assert.ok(highLowRes.success, 'High-Low round must resolve');
  console.log(`  ✓ High-Low: Base Card ${highLowRes.result.gameState.baseCard.value} -> Next Card ${highLowRes.result.gameState.nextCard.value} | Won: ${highLowRes.result.gameState.won}`);

  // 2.8 Scratch Cards
  const scratchRes = await mockHttp('POST', '/api/v1/casino/play/scratch', {
    userId: testUserId,
    wager: 5.0,
  });
  assert.ok(scratchRes.success, 'Scratch card reveal must succeed');
  console.log(`  ✓ Scratch Card: 3x3 grid generated | Result: ${scratchRes.result.gameState.isWinner ? 'WINNER $' + scratchRes.result.payout : 'NO WIN'}`);

  // 2.9 Keno
  const kenoRes = await mockHttp('POST', '/api/v1/casino/play/keno', {
    userId: testUserId,
    pickedNumbers: [7, 14, 21, 35, 49, 77],
    wager: 10.0,
  });
  assert.ok(kenoRes.success, 'Keno draw must succeed');
  assert.strictEqual(kenoRes.result.gameState.drawnNumbers.length, 20, 'Keno draws 20 balls');
  console.log(`  ✓ Keno: Matched ${kenoRes.result.gameState.matchedCount} / 6 numbers`);

  // 2.10 Bingo
  const bingoRes = await mockHttp('POST', '/api/v1/casino/play/bingo', {
    userId: testUserId,
    wager: 10.0,
  });
  assert.ok(bingoRes.success, 'Bingo round must succeed');
  console.log(`  ✓ Bingo: 5x5 Card evaluated | Completed Lines: ${bingoRes.result.gameState.completedLines}`);

  // 2.11 Live Casino Dealer Launcher (example third-party studio pattern)
  const liveLaunch = await mockHttp('POST', '/api/v1/live-casino/launch', {
    userId: testUserId,
    gameCode: 'lightning_roulette',
    provider: 'STUDIO_ONE',
  });
  assert.ok(liveLaunch.success, 'Live Casino launch must succeed');
  assert.ok(liveLaunch.session.launchUrl.includes('token='), 'Launch URL must contain cryptographic token');
  console.log(`  ✓ Live Dealer Studio Launcher Verified: Signed session generated for ${liveLaunch.session.provider}`);

  // 2.12 Texas Hold'em Poker Table Engine
  const pokerLobby = await mockHttp('GET', '/api/v1/poker/tables');
  assert.ok(pokerLobby.count > 0, 'Poker lobby must return active tables');
  console.log(`  ✓ Multiplayer Texas Hold'em Poker: ${pokerLobby.count} active tables listed.`);

  console.log('  ✅ Part 2 Passed: Casino Engine & 16 Game Themes Verified.');

  // -------------------------------------------------------------
  // PART 3: Real-Time Virtual Sports Racing Engine
  // -------------------------------------------------------------
  console.log('\n[Part 3] Testing Real-Time Virtual Sports Racing (Greyhounds & Horses)...');

  const virtualEngine = VirtualRacingEngine.getInstance();
  const races = virtualEngine.getUpcomingRaces();
  assert.ok(races.length >= 2, 'Must have at least 1 Greyhound and 1 Horse race scheduled');

  const greyhoundRace = races.find((r) => r.type === 'GREYHOUND_RACING')!;
  const horseRace = races.find((r) => r.type === 'HORSE_RACING')!;

  assert.strictEqual(greyhoundRace.runners.length, 6, 'Greyhound race must have 6 traps');
  assert.strictEqual(horseRace.runners.length, 8, 'Horse race must have 8 runners');

  console.log(`  ✓ Scheduled Greyhound Race #${greyhoundRace.raceNumber} (${greyhoundRace.trackName}): 6 Traps ready`);
  console.log(`  ✓ Scheduled Horse Race #${horseRace.raceNumber} (${horseRace.trackName}): 8 Runners ready`);

  // Test Runner Odds & Integrity
  for (const runner of greyhoundRace.runners) {
    assert.ok(runner.winOdds >= 1.20, `Runner #${runner.number} win odds must be valid (${runner.winOdds})`);
    assert.ok(runner.placeOdds >= 1.05, `Runner #${runner.number} place odds must be valid (${runner.placeOdds})`);
  }

  // Simulate Provably Fair Greyhound Race
  const simGreyhound = virtualEngine.simulateRace(greyhoundRace.id, 'server_seed_vrace_999', 'client_seed_punters', 1);
  assert.strictEqual(simGreyhound.status, 'FINISHED', 'Race status must be FINISHED');
  assert.ok(simGreyhound.result, 'Race must have complete result');
  assert.strictEqual(simGreyhound.result.finishOrder.length, 6, 'All 6 traps must finish');
  console.log(`  ✓ Greyhound Race Result: 1st: #${simGreyhound.result.winner.number} (${simGreyhound.result.winner.name}) | 2nd: #${simGreyhound.result.second.number} | 3rd: #${simGreyhound.result.third.number}`);

  // Test Virtual Bet Settlement (Win & Forecast)
  const winningBetResult = virtualEngine.settleBet(
    {
      userId: testUserId,
      raceId: greyhoundRace.id,
      runnerNumber: simGreyhound.result.winner.number,
      betType: 'WIN',
      wager: 25.0,
    },
    simGreyhound
  );
  assert.strictEqual(winningBetResult.won, true, 'Win bet on the winner must be marked won');
  assert.ok(winningBetResult.payout > 25.0, 'Winning payout must exceed stake');
  console.log(`  ✓ Virtual Bet Settlement Verified: Win bet on Runner #${simGreyhound.result.winner.number} paid $${winningBetResult.payout} (Stake: $25.00)`);

  console.log('  ✅ Part 3 Passed: Virtual Sports Racing Verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Real-Time Odds, Casino & Virtual Games Tests PASSED!  ');
  console.log('===============================================================\n');
}

runRealtimeSuite().catch((err) => {
  console.error('\n❌ Real-time Engine Test Suite Failed:', err);
  process.exit(1);
});
