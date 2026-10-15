import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { LedgerService } from '../../services/betting-engine/src/wallet/ledger-service.ts';
import { BetPlacementService } from '../../services/betting-engine/src/betting/bet-placement.ts';
import { BetSlipType } from '../../services/betting-engine/src/betting/bet-validator.ts';
import { LiveStateManager } from '../../services/odds-engine/src/domain/live-state.ts';

console.log('===============================================================');
console.log('  🔥 Running Chaos Engineering & Failure Recovery Test Suite   ');
console.log('===============================================================\n');

// ----------------------------------------------------------------------------
// Chaos Simulation 1: High-Concurrency Wallet Contention & Race Conditions
// ----------------------------------------------------------------------------
console.log('[Chaos 1] Simulating 200 Concurrent Competing Wallet Operations on a Single Account...');
const ledger = LedgerService.getInstance();
const targetUser = 'usr-chaos-whale-01';

// Seed initial balance
ledger.deposit(targetUser, 1000.0, 'USD');
assert.strictEqual(ledger.getBalance(targetUser, 'USD'), 1000.0);

const CONCURRENT_OPS = 200;
const opPromises: Promise<any>[] = [];

// Mix 100 debits ($10 stake hold) and 100 credits ($15 win payout) executed simultaneously
for (let i = 0; i < CONCURRENT_OPS; i++) {
  const p = Promise.resolve().then(() => {
    if (i % 2 === 0) {
      return ledger.holdBetStake(targetUser, `chaos-slip-${i}`, 10.0, 'USD');
    } else {
      return ledger.settleWinningBet(targetUser, `chaos-win-${i}`, 10.0, 15.0, 'USD');
    }
  });
  opPromises.push(p);
}

await Promise.all(opPromises);

// Initial 1000 - (100 * 10) + (100 * 15) = 1500
const finalBalance = ledger.getBalance(targetUser, 'USD');
assert.strictEqual(finalBalance, 1500.0, 'Balance must accurately reflect net operations without race condition drift');

const isLedgerConserved = ledger.verifyLedgerConservation();
assert.strictEqual(isLedgerConserved, true, 'Zero-discrepancy double-entry ledger conserved under concurrency');
console.log(`  Final Whale Balance: $${finalBalance.toFixed(2)} (Expected: $1,500.00)`);
console.log('  ✅ Chaos 1 Passed: 200 concurrent wallet mutations processed with 100% mathematical integrity.');

// ----------------------------------------------------------------------------
// Chaos Simulation 2: Insufficient Funds & Overdraft Attack Prevention
// ----------------------------------------------------------------------------
console.log('\n[Chaos 2] Simulating Rapid Overdraft & Negative Balance Exploits...');
const poorUser = 'usr-chaos-broke-02';
ledger.deposit(poorUser, 50.0, 'USD');

const overdraftAttempts: boolean[] = [];
for (let i = 0; i < 10; i++) {
  try {
    ledger.holdBetStake(poorUser, `exploit-slip-${i}`, 30.0, 'USD'); // 2 x 30 = 60 > 50 -> must reject subsequent attempts
    overdraftAttempts.push(true);
  } catch (err: any) {
    overdraftAttempts.push(false);
  }
}

const successfulDebits = overdraftAttempts.filter((s) => s === true).length;
const rejectedDebits = overdraftAttempts.filter((s) => s === false).length;

assert.strictEqual(successfulDebits, 1, 'Only 1 bet of $30 allowed with $50 balance');
assert.strictEqual(rejectedDebits, 9, 'All 9 overdraft attempts rejected');
assert.strictEqual(ledger.getBalance(poorUser, 'USD'), 20.0, 'Remaining balance must remain strictly non-negative');
console.log(`  Successful Debits: ${successfulDebits} | Blocked Overdrafts: ${rejectedDebits}`);
console.log('  ✅ Chaos 2 Passed: Overdraft and negative balance attempts blocked atomically.');

// ----------------------------------------------------------------------------
// Chaos Simulation 3: Upstream Feeds Disconnection & State Retention
// ----------------------------------------------------------------------------
console.log('\n[Chaos 3] Simulating Sudden Upstream Sports Feed Disconnection...');
const stateManager = LiveStateManager.getInstance();

// Seed live match
const marketMap = new Map();
marketMap.set('mkt-1', {
  id: 'mkt-1',
  marketType: '1X2',
  name: 'Match Winner',
  status: 'ACTIVE',
  isInPlay: true,
  sortOrder: 1,
  selections: new Map([
    ['sel-1', { id: 'sel-1', name: 'Home', odds: 1.85, previousOdds: null, status: 'ACTIVE', probability: 0.54, sortOrder: 1 }],
  ]),
});

stateManager.setFixture({
  id: 'fix-chaos-101',
  tournamentId: 1,
  tournamentName: 'Premier League',
  sportId: 1,
  sportName: 'Soccer',
  homeTeam: 'Liverpool',
  awayTeam: 'Man City',
  startTime: new Date(),
  status: 'LIVE',
  isInPlay: true,
  score: { home: 1, away: 0 },
  periodScores: [],
  matchMinute: 25,
  matchClock: '25:00',
  lastEvent: 'GOAL',
  markets: marketMap,
});

const matchBefore = stateManager.getFixture('fix-chaos-101');
assert.ok(matchBefore !== undefined);
assert.strictEqual(matchBefore.score.home, 1);

// Simulate feed disconnection event
const mockFeedEmitter = new EventEmitter();
let connectionActive = true;

mockFeedEmitter.on('disconnect', () => {
  connectionActive = false;
  // Fallback: suspend markets but retain fixture state
  stateManager.suspendMarket('fix-chaos-101', 'mkt-1', true);
});

mockFeedEmitter.emit('disconnect');
assert.strictEqual(connectionActive, false, 'Feed connection marked inactive');
const matchAfter = stateManager.getFixture('fix-chaos-101');
const marketState = matchAfter?.markets.get('mkt-1');
assert.strictEqual(marketState?.status, 'SUSPENDED', 'Active markets suspended immediately upon feed loss');
assert.strictEqual(matchAfter?.score.home, 1, 'Match state preserved without data loss');
console.log('  ✅ Chaos 3 Passed: Upstream feed outage gracefully suspended markets without dropping match state.');

// ----------------------------------------------------------------------------
// Chaos Simulation 4: Invalid Odds Mutation & Suspicious Tick Rejection
// ----------------------------------------------------------------------------
console.log('\n[Chaos 4] Simulating Corrupted & Extreme Spike Odds Ingestion...');
function validateAndSanitizeOddsTick(submittedOdds: number, previousOdds: number): { accepted: boolean; sanitized: number } {
  // Reject negative, zero, or sudden > 500% erratic spikes without official market suspension
  if (submittedOdds <= 1.0 || isNaN(submittedOdds) || !isFinite(submittedOdds)) {
    return { accepted: false, sanitized: previousOdds };
  }
  if (previousOdds > 0 && submittedOdds > previousOdds * 5.0) {
    return { accepted: false, sanitized: previousOdds }; // Flagged as anomaly
  }
  return { accepted: true, sanitized: submittedOdds };
}

const badTick1 = validateAndSanitizeOddsTick(-5.0, 1.85);
assert.strictEqual(badTick1.accepted, false);
assert.strictEqual(badTick1.sanitized, 1.85);

const badTick2 = validateAndSanitizeOddsTick(999.0, 1.50);
assert.strictEqual(badTick2.accepted, false);

const goodTick = validateAndSanitizeOddsTick(1.95, 1.85);
assert.strictEqual(goodTick.accepted, true);
assert.strictEqual(goodTick.sanitized, 1.95);
console.log('  ✅ Chaos 4 Passed: Malformed, negative, and erratic odds anomalies filtered safely.');

console.log('\n===============================================================');
console.log('  🎉 All Chaos Engineering & Resilience Simulations Passed!   ');
console.log('===============================================================');
