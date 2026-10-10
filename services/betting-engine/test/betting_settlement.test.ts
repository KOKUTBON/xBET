/**
 * Comprehensive Verification Test Suite for Wallet, Bet Placement, Cashout & Settlement
 */

import { LedgerService } from '../src/wallet/ledger-service.ts';
import { BetPlacementService, BetSlipStatus, LegStatus } from '../src/betting/bet-placement.ts';
import type { LegStatus as LegStatusType } from '../src/betting/bet-placement.ts';
import { SettlementEngine } from '../src/settlement/settlement-engine.ts';
import { CashoutService } from '../src/betting/cashout-service.ts';
import { BetSlipType, OddsTolerance } from '../src/betting/bet-validator.ts';
import { placeFixtureBet } from './fixture-prices.ts';

async function runBettingEngineTests() {
  console.log('===============================================================');
  console.log('  🧪 Running Wallet & Betting Engine Verification Suite');
  console.log('===============================================================');

  const ledger = LedgerService.getInstance();
  const betPlacement = BetPlacementService.getInstance();
  const settlement = SettlementEngine.getInstance();
  const cashoutService = CashoutService.getInstance();

  const testUser = 'user-test-777';

  // --------------------------------------------------------------------------
  // Test 1: Ledger Deposit & Balance Check
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Ledger Deposit & Balance Calculation...');
  ledger.deposit(testUser, 1000.0, 'USD', 'DEP-TEST-1000');
  let balance = ledger.getBalance(testUser);
  console.log(`  User initial balance after $1,000 deposit: $${balance.toFixed(2)}`);
  if (balance !== 1000.0) throw new Error(`Expected balance 1000, got ${balance}`);
  console.log('  ✅ Test 1 Passed: Deposit and balance view work correctly.');

  // --------------------------------------------------------------------------
  // Test 2: Single Bet Placement & Settlement (WON)
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Single Bet Placement ($100 @ 2.50) & Settlement...');
  const singleSlip = placeFixtureBet(betPlacement, {
    userId: testUser,
    betType: BetSlipType.SINGLE,
    stake: 100.0,
    legs: [
      {
        fixtureId: 'fix-1',
        fixtureName: 'Arsenal vs Chelsea',
        marketId: 'mkt-1',
        marketName: 'Match Winner (1X2)',
        selectionId: 'sel-arsenal',
        selectionName: 'Arsenal',
        submittedOdds: 2.50,
      },
    ],
  });

  balance = ledger.getBalance(testUser);
  console.log(`  Balance after placing $100 bet: $${balance.toFixed(2)} (Held in Escrow)`);
  if (balance !== 900.0) throw new Error(`Expected balance 900, got ${balance}`);

  // Settle Arsenal won
  const resolutions1 = new Map<string, LegStatus>([['sel-arsenal', LegStatus.WON]]);
  settlement.settleBetSlip(singleSlip.id, resolutions1);

  balance = ledger.getBalance(testUser);
  console.log(`  Balance after winning payout ($250): $${balance.toFixed(2)}`);
  if (balance !== 1150.0) throw new Error(`Expected balance 1150, got ${balance}`);
  if (singleSlip.status !== BetSlipStatus.WON || singleSlip.actualPayout !== 250.0) {
    throw new Error('Single bet status/payout incorrect');
  }
  console.log('  ✅ Test 2 Passed: Single bet escrow lock and winning payout verified.');

  // --------------------------------------------------------------------------
  // Test 3: 3-Leg Combi / Parlay Bet Placement & Settlement (All WON)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing 3-Leg Combi Bet ($50 @ 1.80 * 1.50 * 2.00 = 5.40)...');
  const combiSlip = placeFixtureBet(betPlacement, {
    userId: testUser,
    betType: BetSlipType.COMBI,
    stake: 50.0,
    legs: [
      { fixtureId: 'f1', fixtureName: 'Real Madrid vs Man City', marketId: 'm1', marketName: '1X2', selectionId: 'sel-rm', selectionName: 'Real Madrid', submittedOdds: 1.80 },
      { fixtureId: 'f2', fixtureName: 'Bayern vs PSG', marketId: 'm2', marketName: '1X2', selectionId: 'sel-bayern', selectionName: 'Bayern', submittedOdds: 1.50 },
      { fixtureId: 'f3', fixtureName: 'Inter vs Milan', marketId: 'm3', marketName: '1X2', selectionId: 'sel-inter', selectionName: 'Inter', submittedOdds: 2.00 },
    ],
  });

  console.log(`  Combi Total Odds: ${combiSlip.totalOdds} | Potential Payout: $${combiSlip.potentialPayout}`);
  if (combiSlip.totalOdds !== 5.40 || combiSlip.potentialPayout !== 270.0) {
    throw new Error('Combi odds calculation incorrect');
  }

  // Settle all 3 legs as WON
  const resolutions2 = new Map<string, LegStatus>([
    ['sel-rm', LegStatus.WON],
    ['sel-bayern', LegStatus.WON],
    ['sel-inter', LegStatus.WON],
  ]);
  settlement.settleBetSlip(combiSlip.id, resolutions2);

  balance = ledger.getBalance(testUser);
  console.log(`  Balance after winning 3-leg combi: $${balance.toFixed(2)}`);
  // Previous 1150 - 50 (stake) + 270 (payout) = 1370
  if (balance !== 1370.0) throw new Error(`Expected balance 1370, got ${balance}`);
  console.log('  ✅ Test 3 Passed: Multi-leg accumulator calculation and payout verified.');

  // --------------------------------------------------------------------------
  // Test 4: Combi Bet with VOID Leg (e.g. Match Postponed)
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Combi Bet with 1 WON + 1 VOID Leg (2.00 * 3.00 VOID -> 2.00)...');
  const voidCombiSlip = placeFixtureBet(betPlacement, {
    userId: testUser,
    betType: BetSlipType.COMBI,
    stake: 100.0,
    legs: [
      { fixtureId: 'f4', fixtureName: 'Match A', marketId: 'm4', marketName: '1X2', selectionId: 'sel-a', selectionName: 'Team A', submittedOdds: 2.00 },
      { fixtureId: 'f5', fixtureName: 'Match B (Postponed)', marketId: 'm5', marketName: '1X2', selectionId: 'sel-b', selectionName: 'Team B', submittedOdds: 3.00 },
    ],
  });

  const resolutions3 = new Map<string, LegStatus>([
    ['sel-a', LegStatus.WON],
    ['sel-b', LegStatus.VOID], // Leg voided
  ]);
  settlement.settleBetSlip(voidCombiSlip.id, resolutions3);

  console.log(`  Combi with Void leg actual payout: $${voidCombiSlip.actualPayout} (Expected: $200.00)`);
  if (voidCombiSlip.actualPayout !== 200.0) {
    throw new Error(`Expected payout 200.00, got ${voidCombiSlip.actualPayout}`);
  }
  console.log('  ✅ Test 4 Passed: Void legs correctly factored as 1.00 multiplier.');

  // --------------------------------------------------------------------------
  // Test 5: System 2/3 Bet (3 combinations of 2 legs each)
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing System 2/3 Bet ($30 Total Stake -> $10 per combo)...');
  const systemSlip = placeFixtureBet(betPlacement, {
    userId: testUser,
    betType: BetSlipType.SYSTEM,
    systemK: 2,
    stake: 30.0,
    legs: [
      { fixtureId: 'f6', fixtureName: 'Match 1', marketId: 'm6', marketName: '1X2', selectionId: 'sel-s1', selectionName: 'Choice 1', submittedOdds: 2.00 },
      { fixtureId: 'f7', fixtureName: 'Match 2', marketId: 'm7', marketName: '1X2', selectionId: 'sel-s2', selectionName: 'Choice 2', submittedOdds: 3.00 },
      { fixtureId: 'f8', fixtureName: 'Match 3', marketId: 'm8', marketName: '1X2', selectionId: 'sel-s3', selectionName: 'Choice 3', submittedOdds: 4.00 },
    ],
  });

  console.log(`  System Combinations: ${systemSlip.systemCombinationCount}, Stake per combo: $${systemSlip.stakePerCombination}`);
  if (systemSlip.systemCombinationCount !== 3) throw new Error('Expected 3 combinations for 2/3');

  // Outcomes: Choice 1 WON (2.0), Choice 2 WON (3.0), Choice 3 LOST (4.0)
  // Winning Combo: (Choice 1, Choice 2) -> $10 * 2.00 * 3.00 = $60.00
  const resolutions4 = new Map<string, LegStatus>([
    ['sel-s1', LegStatus.WON],
    ['sel-s2', LegStatus.WON],
    ['sel-s3', LegStatus.LOST],
  ]);
  settlement.settleBetSlip(systemSlip.id, resolutions4);

  console.log(`  System 2/3 Actual Payout: $${systemSlip.actualPayout} (Expected: $60.00)`);
  if (systemSlip.actualPayout !== 60.0) {
    throw new Error(`Expected system payout 60.0, got ${systemSlip.actualPayout}`);
  }
  console.log('  ✅ Test 5 Passed: System bet permutations and multi-combination return verified.');

  // --------------------------------------------------------------------------
  // Test 6: Real-Time Cash-Out Engine Flow
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Real-Time Cash-Out Valuation & Instant Settlement...');
  const cashoutSlip = placeFixtureBet(betPlacement, {
    userId: testUser,
    betType: BetSlipType.COMBI,
    stake: 100.0,
    legs: [
      { fixtureId: 'f9', fixtureName: 'Match X', marketId: 'm9', marketName: '1X2', selectionId: 'sel-x', selectionName: 'Team X', submittedOdds: 2.00 },
      { fixtureId: 'f10', fixtureName: 'Match Y', marketId: 'm10', marketName: '1X2', selectionId: 'sel-y', selectionName: 'Team Y', submittedOdds: 2.00 },
    ],
  });

  // Leg 1 wins
  cashoutSlip.legs[0].status = LegStatus.WON;

  // Leg 2 is currently live at odds 1.25 (Team Y leading 2-0)
  const liveOddsMap: Record<string, number> = { 'sel-y': 1.25 };
  const offer = cashoutService.calculateCashoutOffer(cashoutSlip.id, (selId) => liveOddsMap[selId] || null);

  console.log(`  Cashout offer calculated: $${offer} (Initial Stake: $100, Max Return: $400)`);
  if (!offer || offer < 250.0 || offer > 350.0) {
    throw new Error(`Cashout valuation out of reasonable bounds: ${offer}`);
  }

  // Accept cashout
  const preCashoutBalance = ledger.getBalance(testUser);
  cashoutService.executeCashout(cashoutSlip.id, offer);
  const postCashoutBalance = ledger.getBalance(testUser);

  console.log(`  Balance change upon cashout: $${preCashoutBalance.toFixed(2)} -> $${postCashoutBalance.toFixed(2)} (+ $${offer})`);
  if (cashoutSlip.status !== BetSlipStatus.CASHED_OUT || cashoutSlip.actualPayout !== offer) {
    throw new Error('Cashout execution status incorrect');
  }
  console.log('  ✅ Test 6 Passed: Dynamic cashout valuation and atomic payout verified.');

  // --------------------------------------------------------------------------
  // Test 7: Double-Entry Ledger Mathematical Conservation Check
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] Testing Double-Entry Ledger Conservation...');
  const isConserved = ledger.verifyLedgerConservation();
  console.log(`  Total historic ledger entries balanced: ${isConserved}`);
  if (!isConserved) {
    throw new Error('LEDGER INTEGRITY FAILED: Total debits do not equal total credits across all entries!');
  }
  console.log('  ✅ Test 7 Passed: Financial ledger strictly conserved with zero balance leakage.');

  console.log('\n===============================================================');
  console.log('  🎉 All Phase 3 Betting & Wallet Engine Tests Passed!         ');
  console.log('===============================================================');
  process.exit(0);
}

runBettingEngineTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
