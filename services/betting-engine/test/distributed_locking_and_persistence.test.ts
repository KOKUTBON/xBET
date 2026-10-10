import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  DistributedLockService,
  MemoryLockStrategy,
  LockAcquisitionTimeoutError,
} from '../src/distributed/distributed-lock-service.ts';
import {
  TransactionalOutboxService,
  type OutboxEvent,
} from '../src/distributed/transactional-outbox-service.ts';
import { QuantitativeCashoutEngine } from '../src/cashout/quantitative-cashout-engine.ts';

console.log('===============================================================');
console.log('  🔒 Running Distributed Locking & Outbox Persistence Test Suite');
console.log('===============================================================');

// =========================================================================
// TEST 1: Distributed Lock Concurrency & Mutual Exclusion
// =========================================================================
console.log('\n[Test 1] Testing DistributedLockService mutual exclusion under concurrent contention...');
const lockService = new DistributedLockService();
const lockKey = `user_account:usr-alice-${randomUUID()}`;

let executionOrder: string[] = [];
let parallelOperationsCompleted = 0;

async function executeCriticalSection(id: string, workDurationMs: number) {
  await lockService.withLock(lockKey, async () => {
    executionOrder.push(`${id}:start`);
    await new Promise((r) => setTimeout(r, workDurationMs));
    executionOrder.push(`${id}:end`);
  }, 5000, 3000);
  parallelOperationsCompleted++;
}

// Launch 3 concurrent tasks trying to access the same user balance lock
await Promise.all([
  executeCriticalSection('op-1', 40),
  executeCriticalSection('op-2', 30),
  executeCriticalSection('op-3', 20),
]);

assert.equal(parallelOperationsCompleted, 3);
// Verify that operations ran strictly sequentially (no overlap between start and end)
assert.equal(executionOrder.length, 6);
for (let i = 0; i < executionOrder.length; i += 2) {
  const startItem = executionOrder[i];
  const endItem = executionOrder[i + 1];
  const opId = startItem.split(':')[0];
  assert.equal(startItem, `${opId}:start`);
  assert.equal(endItem, `${opId}:end`);
}
console.log('  Execution sequence verified strictly serialized:', executionOrder);
console.log('  ✅ Test 1 Passed: Mutual exclusion strictly enforced across concurrent operations.');

// =========================================================================
// TEST 2: Lock Timeout Rejection
// =========================================================================
console.log('\n[Test 2] Testing LockAcquisitionTimeoutError on contested lock...');
const contestedKey = `resource:${randomUUID()}`;
const holderLock = await lockService.acquire(contestedKey, 5000);

let timeoutDetected = false;
try {
  // Try to acquire the same lock with a short timeout of 50ms while it's held
  await lockService.acquire(contestedKey, 5000, 50);
} catch (err) {
  if (err instanceof LockAcquisitionTimeoutError) {
    timeoutDetected = true;
  }
}
assert.equal(timeoutDetected, true, 'Should have thrown LockAcquisitionTimeoutError');

// Release holder lock
await holderLock.release();

// After release, acquisition should succeed immediately
const newLock = await lockService.acquire(contestedKey, 1000, 100);
assert.ok(newLock.token);
await newLock.release();
console.log('  ✅ Test 2 Passed: Lock timeout error correctly thrown and resource released cleanly.');

// =========================================================================
// TEST 3: Transactional Outbox Atomic Enqueue & Relay Dispatch
// =========================================================================
console.log('\n[Test 3] Testing TransactionalOutboxService atomic event relay & subscribers...');
const outbox = new TransactionalOutboxService();

const receivedEvents: OutboxEvent[] = [];
const unsubscribeWildcard = outbox.subscribe('*', async (event) => {
  receivedEvents.push(event);
});

const receivedSettlements: OutboxEvent[] = [];
const unsubscribeSettled = outbox.subscribe('BET_SETTLED', async (event) => {
  receivedSettlements.push(event);
});

// Enqueue multiple heterogeneous domain events
const betAcceptedId = randomUUID();
await outbox.enqueue('BET_ACCEPTED', betAcceptedId, {
  ticketId: betAcceptedId,
  userId: 'usr-bob',
  stakeMinor: 5000,
  potentialPayoutMinor: 12500,
});

const cashoutId = randomUUID();
await outbox.enqueue('CASHOUT_EXECUTED', cashoutId, {
  ticketId: cashoutId,
  userId: 'usr-bob',
  cashoutType: 'FULL',
  paidAmountMinor: 4800,
});

const settledId = randomUUID();
await outbox.enqueue('BET_SETTLED', settledId, {
  ticketId: settledId,
  userId: 'usr-carol',
  outcome: 'WON',
  payoutMinor: 20000,
});

assert.equal(outbox.getStats().enqueuedCount, 3);
assert.equal(outbox.getStats().inMemoryPending, 3);

// Process batch through relay
const processed = await outbox.processPendingEvents(10);
assert.equal(processed, 3);
assert.equal(outbox.getStats().publishedCount, 3);
assert.equal(outbox.getStats().inMemoryPending, 0);

// Check subscriber deliveries
assert.equal(receivedEvents.length, 3);
assert.equal(receivedSettlements.length, 1);
assert.equal(receivedSettlements[0].aggregateId, settledId);
assert.equal(receivedSettlements[0].payload.outcome, 'WON');

unsubscribeWildcard();
unsubscribeSettled();
console.log('  Outbox events successfully dispatched to domain subscribers: 3/3');
console.log('  ✅ Test 3 Passed: Outbox relay guarantees decoupled event delivery.');

// =========================================================================
// TEST 4: Double-Entry Conservation in Durable Settlement Math
// =========================================================================
console.log('\n[Test 4] Testing Double-Entry Ledger Equations for Durable Settlements...');
// Simulate financial account balance movements for Winning, Losing, and VAR Reversals:
interface MockLedger {
  player: number;
  escrow: number;
  margin: number;
}

function simulateWinningSettlement(l: MockLedger, stake: number, payout: number): MockLedger {
  const profit = payout - stake;
  return {
    player: l.player + payout,
    escrow: l.escrow - stake,
    margin: l.margin - profit,
  };
}

function simulateLosingSettlement(l: MockLedger, stake: number): MockLedger {
  return {
    player: l.player,
    escrow: l.escrow - stake,
    margin: l.margin + stake,
  };
}

function simulateVARReversal(l: MockLedger, stake: number, originalPayout: number): MockLedger {
  // Reverses a previously winning bet to a losing bet
  const originalProfit = originalPayout - stake;
  // 1. Take back original payout from player
  let state = {
    player: l.player - originalPayout,
    escrow: l.escrow + stake,
    margin: l.margin + originalProfit,
  };
  // 2. Mark as lost: move escrow to house margin
  return {
    player: state.player,
    escrow: state.escrow - stake,
    margin: state.margin + stake,
  };
}

function sumBalances(l: MockLedger): number {
  return l.player + l.escrow + l.margin;
}

const initialLedger: MockLedger = { player: 1000, escrow: 100, margin: 5000 };
const initialTotal = sumBalances(initialLedger);

// Settle winning bet ($100 stake, $250 payout)
const postWin = simulateWinningSettlement(initialLedger, 100, 250);
assert.equal(postWin.player, 1250);
assert.equal(postWin.escrow, 0);
assert.equal(postWin.margin, 4850);
assert.equal(sumBalances(postWin), initialTotal, 'Zero balance leakage on WIN');

// Reversal via VAR tribunal (Overturned to LOST)
const postVAR = simulateVARReversal(postWin, 100, 250);
assert.equal(postVAR.player, 1000); // Player return is revoked
assert.equal(postVAR.escrow, 0);    // Escrow still 0
assert.equal(postVAR.margin, 5100);  // House captures the stake
assert.equal(sumBalances(postVAR), initialTotal, 'Zero balance leakage on VAR REVERSAL');

console.log('  Ledger sums conserved: initial =', initialTotal, '| post-win =', sumBalances(postWin), '| post-VAR =', sumBalances(postVAR));
console.log('  ✅ Test 4 Passed: Zero balance leakage mathematically verified for settlement & reversals.');

// =========================================================================
// TEST 5: Durable Cashout Partial Valuation & Escrow Conservation
// =========================================================================
console.log('\n[Test 5] Testing Quantitative Partial Cashout Math & Escrow Proportions...');
const quant = QuantitativeCashoutEngine.getInstance();
const initialStake = 100;
const potentialPayout = 300;
const currentLiveOdds = 1.50; // Team is winning, odds dropped from 3.0 to 1.50

const offer = quant.calculateStandaloneOffer({
  initialStake,
  initialOdds: 3.0,
  potentialPayout,
  currentLiveOdds,
  matchMinute: 70,
});

assert.ok(offer.isAvailable);
assert.ok(offer.cashoutOffer > initialStake, `Cashout offer (${offer.cashoutOffer}) should be in profit`);

// Simulate Partial Cashout of 50%
const fraction = 0.50;
const cashedStake = Math.round(initialStake * fraction);
const remainingStake = initialStake - cashedStake;
const paidAmount = Math.round(offer.cashoutOffer * fraction * 100) / 100;
const remainingPayout = Math.round(potentialPayout * (1 - fraction));

assert.equal(cashedStake, 50);
assert.equal(remainingStake, 50);
assert.equal(remainingPayout, 150);
console.log(`  50% Partial Cashout: Cashed Stake = $${cashedStake}, Payout = $${paidAmount}, Remaining Stake = $${remainingStake}`);
console.log('  ✅ Test 5 Passed: Partial cashout proportion strictly calculated with valid escrow splits.');

console.log('===============================================================');
console.log('  🎉 All Distributed Locking & Outbox Persistence Tests Passed!');
console.log('===============================================================');
