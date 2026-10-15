/**
 * Automated Settlement & Market Resulting Engine Test Suite
 * Validates grading rules, asynchronous worker queue, ledger payouts, and idempotency.
 */

import { MarketGrader } from '../src/settlement/market-grader.ts';
import type { FixtureScorecard, SelectionToGrade } from '../src/settlement/market-grader.ts';
import { FixtureResultingService } from '../src/settlement/fixture-resulting-service.ts';
import { SettlementWorkerQueue } from '../src/settlement/settlement-worker.ts';
import { LedgerService } from '../src/wallet/ledger-service.ts';
import { BetPlacementService, BetSlipStatus, LegStatus } from '../src/betting/bet-placement.ts';
import { BetSlipType } from '../src/betting/bet-validator.ts';
import { placeFixtureBet } from './fixture-prices.ts';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAutomatedSettlementTests() {
  console.log('===============================================================');
  console.log('  🧪 Running Automated Settlement & Resulting Worker Test Suite');
  console.log('===============================================================');

  const ledger = LedgerService.getInstance();
  const betService = BetPlacementService.getInstance();
  const resultingService = FixtureResultingService.getInstance();
  const workerQueue = SettlementWorkerQueue.getInstance();

  // --------------------------------------------------------------------------
  // Phase 1: Market Grader Rule-Engine Unit Tests
  // --------------------------------------------------------------------------
  console.log('\n[Phase 1] Testing MarketGrader rule engine across all market types...');

  const scorecardArsenal: FixtureScorecard = {
    fixtureId: 'fix-arsenal-chelsea',
    homeScore: 2,
    awayScore: 1,
    status: 'FINISHED',
    halfTimeScore: { home: 1, away: 0 },
  };

  // 1. 1X2 Match Winner
  const gHome = MarketGrader.gradeSelection(scorecardArsenal, { selectionId: 's1', selectionName: '1', marketType: '1X2' });
  const gDraw = MarketGrader.gradeSelection(scorecardArsenal, { selectionId: 's2', selectionName: 'X', marketType: '1X2' });
  const gAway = MarketGrader.gradeSelection(scorecardArsenal, { selectionId: 's3', selectionName: '2', marketType: '1X2' });
  if (gHome !== LegStatus.WON || gDraw !== LegStatus.LOST || gAway !== LegStatus.LOST) {
    throw new Error('1X2 grading failed');
  }
  console.log('  ✅ 1X2 Match Winner grading: 1=WON, X=LOST, 2=LOST');

  // 2. Over / Under 2.5
  const gOver25 = MarketGrader.gradeSelection(scorecardArsenal, { selectionId: 's4', selectionName: 'Over 2.5', marketType: 'OVER_UNDER', line: 2.5 });
  const gUnder25 = MarketGrader.gradeSelection(scorecardArsenal, { selectionId: 's5', selectionName: 'Under 2.5', marketType: 'OVER_UNDER', line: 2.5 });
  if (gOver25 !== LegStatus.WON || gUnder25 !== LegStatus.LOST) {
    throw new Error('Over/Under 2.5 grading failed');
  }
  console.log('  ✅ Over/Under 2.5 (3 goals): Over=WON, Under=LOST');

  // 3. Integer Totals (Over 3.0 Push/Void)
  const gOver30 = MarketGrader.gradeSelection(scorecardArsenal, { selectionId: 's6', selectionName: 'Over 3.0', marketType: 'OVER_UNDER', line: 3.0 });
  if (gOver30 !== LegStatus.VOID) throw new Error('Integer line push failed');
  console.log('  ✅ Integer Over 3.0 (3 goals): Push -> VOID');

  // 4. Asian Totals (Over 2.25 on 2 goals -> Half-Lost; Under 2.25 on 2 goals -> Half-Won)
  const scorecardTwoGoals: FixtureScorecard = { fixtureId: 'f2', homeScore: 1, awayScore: 1, status: 'FINISHED' };
  const gOver225 = MarketGrader.gradeSelection(scorecardTwoGoals, { selectionId: 's7', selectionName: 'Over 2.25', marketType: 'OVER_UNDER', line: 2.25 });
  const gUnder225 = MarketGrader.gradeSelection(scorecardTwoGoals, { selectionId: 's8', selectionName: 'Under 2.25', marketType: 'OVER_UNDER', line: 2.25 });
  if (gOver225 !== LegStatus.HALF_LOST || gUnder225 !== LegStatus.HALF_WON) {
    throw new Error(`Asian Totals quarter-line grading failed: Over=${gOver225}, Under=${gUnder225}`);
  }
  console.log('  ✅ Asian Totals 2.25 (2 goals): Over=HALF_LOST, Under=HALF_WON');

  // 5. Both Teams To Score (BTTS)
  const gBttsYes = MarketGrader.gradeSelection(scorecardArsenal, { selectionId: 's9', selectionName: 'Yes', marketType: 'BTTS' });
  const gBttsNo = MarketGrader.gradeSelection(scorecardArsenal, { selectionId: 's10', selectionName: 'No', marketType: 'BTTS' });
  if (gBttsYes !== LegStatus.WON || gBttsNo !== LegStatus.LOST) throw new Error('BTTS grading failed');
  console.log('  ✅ BTTS (2-1): Yes=WON, No=LOST');

  // 6. Draw No Bet (DNB)
  const scorecardDraw: FixtureScorecard = { fixtureId: 'f3', homeScore: 1, awayScore: 1, status: 'FINISHED' };
  const gDnb1 = MarketGrader.gradeSelection(scorecardDraw, { selectionId: 's11', selectionName: '1', marketType: 'DRAW_NO_BET' });
  if (gDnb1 !== LegStatus.VOID) throw new Error('DNB on draw failed to VOID');
  console.log('  ✅ Draw No Bet (1-1 draw): 1=VOID');

  // 7. Postponed / Cancelled fixture
  const scorecardCancelled: FixtureScorecard = { fixtureId: 'f4', homeScore: 0, awayScore: 0, status: 'CANCELLED' };
  const gCancelled = MarketGrader.gradeSelection(scorecardCancelled, { selectionId: 's12', selectionName: '1', marketType: '1X2' });
  if (gCancelled !== LegStatus.VOID) throw new Error('Cancelled match failed to VOID');
  console.log('  ✅ Cancelled Fixture: All selections=VOID');

  // --------------------------------------------------------------------------
  // Phase 2: End-to-End Fixture Resulting & Background Settlement Worker
  // --------------------------------------------------------------------------
  console.log('\n[Phase 2] Testing End-to-End Fixture Resulting & Worker Queue...');

  const userAlice = 'user-alice-101';
  const userBob = 'user-bob-202';
  ledger.deposit(userAlice, 500.0, 'USD', 'SEED-ALICE');
  ledger.deposit(userBob, 500.0, 'USD', 'SEED-BOB');

  // Alice places a Single Bet on Arsenal 1X2 (Win) ($100 @ 2.00)
  const aliceSlip = placeFixtureBet(betService, {
    userId: userAlice,
    betType: BetSlipType.SINGLE,
    stake: 100.0,
    legs: [
      {
        fixtureId: 'fix-match-1',
        fixtureName: 'Arsenal vs Chelsea',
        marketId: 'mkt-1',
        marketName: 'Match Winner 1X2',
        selectionId: 'sel-arsenal-win',
        selectionName: '1',
        submittedOdds: 2.0,
      },
    ],
  });

  // Bob places a 2-Leg Combi ($50 @ 2.00 * 3.00 = 6.00)
  // Leg 1: Arsenal win in fix-match-1
  // Leg 2: Real Madrid win in fix-match-2
  const bobCombiSlip = placeFixtureBet(betService, {
    userId: userBob,
    betType: BetSlipType.COMBI,
    stake: 50.0,
    legs: [
      {
        fixtureId: 'fix-match-1',
        fixtureName: 'Arsenal vs Chelsea',
        marketId: 'mkt-1',
        marketName: 'Match Winner 1X2',
        selectionId: 'sel-arsenal-win',
        selectionName: '1',
        submittedOdds: 2.0,
      },
      {
        fixtureId: 'fix-match-2',
        fixtureName: 'Real Madrid vs Barcelona',
        marketId: 'mkt-2',
        marketName: 'Match Winner 1X2',
        selectionId: 'sel-rm-win',
        selectionName: '1',
        submittedOdds: 3.0,
      },
    ],
  });

  console.log(`  Alice initial balance after bet ($100 stake): $${ledger.getBalance(userAlice).toFixed(2)}`);
  console.log(`  Bob initial balance after bet ($50 stake): $${ledger.getBalance(userBob).toFixed(2)}`);

  // 1. Submit Result for Match 1 (Arsenal 2 - 1 Chelsea)
  console.log('\n  -> Submitting Result for fix-match-1 (Arsenal 2 - 1 Chelsea)...');
  const summary1 = resultingService.submitFixtureResult({
    fixtureId: 'fix-match-1',
    homeScore: 2,
    awayScore: 1,
    status: 'FINISHED',
  });
  console.log(`  Resulting summary: ${summary1.affectedSlipsCount} tickets enqueued for settlement.`);

  // Wait for worker queue tick
  await sleep(100);

  // Verify Alice's Single Bet is settled as WON
  console.log(`  Alice slip status: ${aliceSlip.status} | Payout: $${aliceSlip.actualPayout}`);
  if (aliceSlip.status !== BetSlipStatus.WON || aliceSlip.actualPayout !== 200.0) {
    throw new Error('Alice Single bet settlement failed');
  }
  const aliceBal = ledger.getBalance(userAlice);
  console.log(`  Alice balance after winning payout: $${aliceBal.toFixed(2)} (Expected: $600.00)`);
  if (aliceBal !== 600.0) throw new Error(`Expected balance 600, got ${aliceBal}`);

  // Bob's combi should still be ACCEPTED / pending because Leg 2 (fix-match-2) has not finished yet
  console.log(`  Bob combi status after Match 1: ${bobCombiSlip.status} (Leg 1 is WON, Leg 2 is PENDING)`);
  if (bobCombiSlip.status !== BetSlipStatus.ACCEPTED) {
    throw new Error('Bob combi settled prematurely');
  }

  // 2. Submit Result for Match 2 (Real Madrid 3 - 1 Barcelona)
  console.log('\n  -> Submitting Result for fix-match-2 (Real Madrid 3 - 1 Barcelona)...');
  resultingService.submitFixtureResult({
    fixtureId: 'fix-match-2',
    homeScore: 3,
    awayScore: 1,
    status: 'FINISHED',
  });

  await sleep(100);

  // Bob's combi should now be fully settled as WON (50 * 2.0 * 3.0 = $300.00)
  console.log(`  Bob combi status after Match 2: ${bobCombiSlip.status} | Payout: $${bobCombiSlip.actualPayout}`);
  if (bobCombiSlip.status !== BetSlipStatus.WON || bobCombiSlip.actualPayout !== 300.0) {
    throw new Error('Bob Combi bet settlement failed');
  }
  const bobBal = ledger.getBalance(userBob);
  console.log(`  Bob balance after winning combi: $${bobBal.toFixed(2)} (Expected: $750.00)`);
  // 500 - 50 + 300 = 750
  if (bobBal !== 750.0) throw new Error(`Expected balance 750, got ${bobBal}`);

  // --------------------------------------------------------------------------
  // Phase 3: Idempotency & Duplicate Settlement Safeguard
  // --------------------------------------------------------------------------
  console.log('\n[Phase 3] Testing Idempotency (Re-submitting match results)...');
  resultingService.submitFixtureResult({
    fixtureId: 'fix-match-1',
    homeScore: 2,
    awayScore: 1,
    status: 'FINISHED',
  });
  await sleep(100);

  const aliceBalAfterDup = ledger.getBalance(userAlice);
  if (aliceBalAfterDup !== 600.0) {
    throw new Error(`Idempotency violated: Alice balance changed to ${aliceBalAfterDup}`);
  }
  console.log('  ✅ Idempotency verified: Duplicate result submission did not result in double payout.');

  // --------------------------------------------------------------------------
  // Phase 4: Worker Sweeper & Stats Check
  // --------------------------------------------------------------------------
  console.log('\n[Phase 4] Checking Worker Queue Statistics & Ledger Conservation...');
  const stats = workerQueue.getStats();
  console.log('  Worker Stats:', stats);
  if (stats.completedCount < 2 || stats.totalSettledPayout !== 500.0) {
    throw new Error(`Worker stats unexpected: ${JSON.stringify(stats)}`);
  }

  const isConserved = ledger.verifyLedgerConservation();
  console.log(`  Double-entry ledger balance conserved: ${isConserved}`);
  if (!isConserved) throw new Error('Ledger conservation failed!');

  console.log('\n===============================================================');
  console.log('  🎉 All Automated Settlement & Worker Engine Tests Passed!     ');
  console.log('===============================================================');
  process.exit(0);
}

runAutomatedSettlementTests().catch((err) => {
  console.error('❌ Automated Settlement Verification failed:', err);
  process.exit(1);
});
