import assert from 'node:assert';
import { MarginPercentageManager } from '../src/index.ts';

console.log('===============================================================');
console.log('  🎯 Running Margin, Win/Loss % & Agent Commission Tests       ');
console.log('===============================================================\n');

const manager = MarginPercentageManager.getInstance();

// ----------------------------------------------------------------------------
// Test 1: Casino Win Occurrence & RTP Management (CakePHP GameSetting.php)
// ----------------------------------------------------------------------------
console.log('[Test 1] Testing Casino Win Occurrence & Game RTP Management...');
const allConfigs = manager.getAllCasinoConfigs();
assert.ok(allConfigs.length >= 8, 'Must have at least 8 casino game configurations');

// Test updating Blackjack win rate
manager.updateCasinoWinOccurrence('blackjack', 95);
const bjConfig = manager.getCasinoConfig('blackjack');
assert.strictEqual(bjConfig?.winOccurrencePct, 95);

// Test Scratch 3-row win percentages (70%, 25%, 5%)
const scratch = manager.updateScratchRowPercentages(70, 25, 5);
assert.strictEqual(scratch.rowPercentages?.row1, 70);
assert.strictEqual(scratch.rowPercentages?.row2, 25);
assert.strictEqual(scratch.rowPercentages?.row3, 5);

// Verify invalid row sum throws error
assert.throws(() => {
  manager.updateScratchRowPercentages(60, 20, 10); // Sum is 90 != 100
}, /must sum to 100%/);

// Test outcome evaluation filter
const evalFair = manager.evaluateCasinoOutcome('roulette', 0.50);
assert.strictEqual(evalFair.isWinningOutcome, true);

manager.updateCasinoWinOccurrence('slot_chicken', 80);
const evalFilteredLoss = manager.evaluateCasinoOutcome('slot_chicken', 0.85); // 85% > 80% win rate
assert.strictEqual(evalFilteredLoss.isWinningOutcome, false);

console.log('  ✅ Test 1 Passed: Casino Game win occurrence percentages & row splits verified.');

// ----------------------------------------------------------------------------
// Test 2: Sportsbook Overround Margin & Service Fees (CakePHP Setting.php)
// ----------------------------------------------------------------------------
console.log('\n[Test 2] Testing Sportsbook Margins & Service Fees...');
manager.updateSportsbookConfig({
  defaultOverroundMarginPct: 6.0, // 106% book
  serviceFeePct: 2.5,
});

const feeCalc = manager.calculateStakeWithServiceFee(100.0);
assert.strictEqual(feeCalc.baseStake, 100.0);
assert.strictEqual(feeCalc.serviceFee, 2.50);
assert.strictEqual(feeCalc.totalStake, 102.50);

// Test Overround odds adjustment
const fairProbabilities = [0.50, 0.30, 0.20]; // 100% fair
const adjustedOdds = manager.applyOverroundMargin(fairProbabilities, 6.0);
// Target total book: 1.06 -> odds = [ 1 / (0.50 * 1.06), 1 / (0.30 * 1.06), 1 / (0.20 * 1.06) ]
// 1 / 0.53 = 1.89 | 1 / 0.318 = 3.14 | 1 / 0.212 = 4.72
assert.strictEqual(adjustedOdds[0], 1.89);
assert.strictEqual(adjustedOdds[1], 3.14);
assert.strictEqual(adjustedOdds[2], 4.72);

console.log('  ✅ Test 2 Passed: Sportsbook overround margins and service fees verified.');

// ----------------------------------------------------------------------------
// Test 3: Agent Profit & Loss (P&L) Commission Sharing (CakePHP UserSettings.php)
// ----------------------------------------------------------------------------
console.log('\n[Test 3] Testing Agent Hierarchical P&L Commission Sharing...');
manager.setAgentCommission({
  agentId: 'agent-london-branch-01',
  agentName: 'London Premier Shop Agent',
  role: 'AGENT',
  turnoverCommissionPct: 2.0, // 2% of turnover
  lossCommissionPct: 30.0, // 30% of punter net losses (GGR)
  weeklyResetEnabled: true,
});

// Case A: Profitable week for house (Punters wagered $10,000, won $6,000 -> Net GGR: $4,000)
const pnlProfitable = manager.calculateAgentPnLCommission('agent-london-branch-01', 10000.0, 6000.0);
// Turnover Commission: 2% of $10,000 = $200.00
// Loss Commission: 30% of $4,000 = $1,200.00
// Total Payout: $200 + $1,200 = $1,400.00
assert.strictEqual(pnlProfitable.grossGamingRevenue, 4000.0);
assert.strictEqual(pnlProfitable.turnoverCommission, 200.0);
assert.strictEqual(pnlProfitable.lossCommission, 1200.0);
assert.strictEqual(pnlProfitable.totalPayoutDue, 1400.0);

// Case B: Unprofitable week for house (Punters won $12,000 on $10,000 stakes -> GGR: -$2,000)
const pnlLosing = manager.calculateAgentPnLCommission('agent-london-branch-01', 10000.0, 12000.0);
// Turnover Commission: 2% of $10,000 = $200.00
// Loss Commission: $0.00 (loss commission only applies to positive GGR)
// Total Payout: $200.00
assert.strictEqual(pnlLosing.grossGamingRevenue, -2000.0);
assert.strictEqual(pnlLosing.turnoverCommission, 200.0);
assert.strictEqual(pnlLosing.lossCommission, 0.0);
assert.strictEqual(pnlLosing.totalPayoutDue, 200.0);

console.log('  ✅ Test 3 Passed: Agent P&L commission calculation and turnover splits verified.');

console.log('\n===============================================================');
console.log('  🎉 All Margin, Win/Loss % & Commission Tests Passed!         ');
console.log('===============================================================');
