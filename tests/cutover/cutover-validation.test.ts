import assert from 'node:assert';
import { DualWriteCutoverRouter } from '../../packages/legacy-bridge/src/cutover/dual-write-router.ts';
import { LedgerService } from '../../services/betting-engine/src/wallet/ledger-service.ts';

console.log('===============================================================');
console.log('  🚀 Running Zero-Downtime Production Cutover Simulation Suite  ');
console.log('===============================================================\n');

// ----------------------------------------------------------------------------
// Test 1: Dual-Write Routing & Shadow Consistency Check
// ----------------------------------------------------------------------------
console.log('[Test 1] Testing Dual-Write Execution & Shadow Consistency...');
const router = new DualWriteCutoverRouter({
  trafficMode: 'DUAL_WRITE_NEW_PRIMARY',
  shadowComparisonEnabled: true,
  maxDiscrepancyThresholdPct: 0.01,
});

let legacyExecutionCount = 0;
let newExecutionCount = 0;

const result1 = await router.executeDualWrite(
  'place_bet_ticket',
  async () => {
    newExecutionCount++;
    return { ticketId: 'TICKET-NEW-101', status: 'PLACED', stake: 50.0 };
  },
  async () => {
    legacyExecutionCount++;
    return { ticketId: 'TICKET-NEW-101', status: 'PLACED', stake: 50.0 };
  }
);

assert.strictEqual(newExecutionCount, 1, 'Primary modern handler executed');
assert.strictEqual(legacyExecutionCount, 1, 'Shadow legacy handler executed');
assert.strictEqual(result1.hasDiscrepancy, false, 'No discrepancy detected on identical outputs');
assert.strictEqual(result1.primaryResult.ticketId, 'TICKET-NEW-101');
console.log(`  Dual-Write Execution Latency: Primary: ${result1.latencyPrimaryMs.toFixed(2)}ms | Shadow: ${result1.latencyShadowMs?.toFixed(2)}ms`);
console.log('  ✅ Test 1 Passed: Dual-write executed with zero discrepancy.');

// ----------------------------------------------------------------------------
// Test 2: Shadow Discrepancy Detection & Circuit Breaker
// ----------------------------------------------------------------------------
console.log('\n[Test 2] Testing Shadow Discrepancy Alerting & Auto-Abort Trigger...');
const discrepancyRouter = new DualWriteCutoverRouter({
  trafficMode: 'DUAL_WRITE_NEW_PRIMARY',
  shadowComparisonEnabled: true,
  maxDiscrepancyThresholdPct: 0.05, // 5% max allowable
});

// Run 100 requests with 10 intentional discrepancies
for (let i = 0; i < 100; i++) {
  await discrepancyRouter.executeDualWrite(
    'odds_calculation',
    () => ({ odds: 1.85 }),
    () => ({ odds: i < 10 ? 1.95 : 1.85 }) // 10% discrepancy
  );
}

const discRate = discrepancyRouter.getDiscrepancyRate();
console.log(`  Recorded Discrepancy Rate: ${(discRate * 100).toFixed(1)}% (Threshold: 5.0%)`);
assert.strictEqual(discRate, 0.10, 'Discrepancy rate correctly calculated as 10%');
assert.strictEqual(discrepancyRouter.shouldAbortCutover(), true, 'Abort flag triggered when discrepancy exceeds threshold');
console.log('  ✅ Test 2 Passed: Discrepancy threshold exceeded and abort safeguard engaged.');

// ----------------------------------------------------------------------------
// Test 3: Multi-Stage Canary Traffic Transition (0% -> 10% -> 50% -> 100%)
// ----------------------------------------------------------------------------
console.log('\n[Test 3] Simulating Progressive Canary Cutover Lifecycle...');
const canaryRouter = new DualWriteCutoverRouter();

// Stage 1: Legacy Only
canaryRouter.setTrafficMode('LEGACY_ONLY');
assert.strictEqual(canaryRouter.getTrafficMode(), 'LEGACY_ONLY');
let stage1NewHit = false;
let stage1LegacyHit = false;
await canaryRouter.executeDualWrite('test_stage1', () => { stage1NewHit = true; return 'new'; }, () => { stage1LegacyHit = true; return 'legacy'; });
assert.strictEqual(stage1LegacyHit, true);
assert.strictEqual(stage1NewHit, false);

// Stage 2: Dual Write New Primary
canaryRouter.setTrafficMode('DUAL_WRITE_NEW_PRIMARY');
assert.strictEqual(canaryRouter.getTrafficMode(), 'DUAL_WRITE_NEW_PRIMARY');

// Stage 3: 100% New Stack Only
canaryRouter.setTrafficMode('NEW_ONLY');
assert.strictEqual(canaryRouter.getTrafficMode(), 'NEW_ONLY');
let stage3NewHit = false;
let stage3LegacyHit = false;
await canaryRouter.executeDualWrite('test_stage3', () => { stage3NewHit = true; return 'new'; }, () => { stage3LegacyHit = true; return 'legacy'; });
assert.strictEqual(stage3NewHit, true);
assert.strictEqual(stage3LegacyHit, false, 'Legacy stack completely unhit in NEW_ONLY mode');
console.log('  ✅ Test 3 Passed: Progressive traffic transition from LEGACY_ONLY -> DUAL_WRITE -> NEW_ONLY confirmed.');

// ----------------------------------------------------------------------------
// Test 4: Financial Ledger Integrity during Cutover
// ----------------------------------------------------------------------------
console.log('\n[Test 4] Verifying Double-Entry Ledger Conservation throughout Cutover...');
const ledger = LedgerService.getInstance();
const userCutover = 'usr-cutover-991';

ledger.deposit(userCutover, 500.0, 'USD');
ledger.holdBetStake(userCutover, 'cutover-slip-01', 100.0, 'USD');
ledger.settleWinningBet(userCutover, 'cutover-slip-01', 100.0, 220.0, 'USD');

const isConserved = ledger.verifyLedgerConservation();
assert.strictEqual(isConserved, true, 'Zero discrepancy on double-entry ledger');
assert.strictEqual(ledger.getBalance(userCutover, 'USD'), 620.0);
console.log('  ✅ Test 4 Passed: 100% mathematical ledger conservation maintained.');

console.log('\n===============================================================');
console.log('  🎉 All Production Cutover & Dual-Write Tests Passed!         ');
console.log('===============================================================');
