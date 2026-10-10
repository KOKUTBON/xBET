/**
 * Test Suite: Quantitative Scenario-Based Net Exposure Risk Engine (Phase 4)
 * 
 * Validates:
 * 1. Joint discrete scoreline P&L matrix across 1X2, Total Goals, BTTS, and Correct Score.
 * 2. Probability-weighted expected P&L and worst-case drawdown detection.
 * 3. Pre-placement gate: Rejection of bets breaching scenario limits and stake throttling calculation.
 * 4. Dynamic bookmaker odds shading recommendations (shortening concentrated lines, lengthening safe lines).
 * 5. Atomic snapshot and rollback preservation during bet placement failures.
 */

import assert from 'node:assert/strict';
import {
  ScenarioExposureEngine,
  type TicketPosition,
} from '../src/risk/scenario-exposure-engine.ts';
import { RiskManager } from '../src/risk/risk-manager.ts';
import { BetPlacementService } from '../src/betting/bet-placement.ts';
import { LedgerService } from '../src/wallet/ledger-service.ts';
import { BetSlipMemoryRepository } from '../src/repositories/memory/betslip-memory-repository.ts';

async function runScenarioExposureTests() {
  console.log('===============================================================');
  console.log('  🛡️ Running Quantitative Scenario Risk & Exposure Test Suite  ');
  console.log('===============================================================\n');

  const engine = ScenarioExposureEngine.getInstance();
  engine.reset();
  const fixtureId = 'fix-ars-che-derby';

  // --------------------------------------------------------------------------
  // Stage 1: Co-dependent Multi-Market Scenario Matrix Verification
  // --------------------------------------------------------------------------
  console.log('[Stage 1] Ingesting Co-dependent Multi-Market Tickets & Auditing P&L Grid...');

  const tickets: TicketPosition[] = [
    // 1X2 Bets
    { ticketId: 't1', fixtureId, marketType: '1X2', selection: 'HOME', stake: 500, potentialPayout: 1000, status: 'ACCEPTED' },
    { ticketId: 't2', fixtureId, marketType: '1X2', selection: 'DRAW', stake: 300, potentialPayout: 1050, status: 'ACCEPTED' },
    // Total Goals 2.5
    { ticketId: 't3', fixtureId, marketType: 'TOTAL_GOALS', line: 2.5, selection: 'OVER', stake: 400, potentialPayout: 720, status: 'ACCEPTED' },
    { ticketId: 't4', fixtureId, marketType: 'TOTAL_GOALS', line: 2.5, selection: 'UNDER', stake: 200, potentialPayout: 420, status: 'ACCEPTED' },
    // BTTS
    { ticketId: 't5', fixtureId, marketType: 'BTTS', selection: 'YES', stake: 300, potentialPayout: 510, status: 'ACCEPTED' },
    // Correct Score
    { ticketId: 't6', fixtureId, marketType: 'CORRECT_SCORE', selection: '2-1', stake: 100, potentialPayout: 900, status: 'ACCEPTED' },
  ];

  for (const t of tickets) {
    engine.registerTicket(t);
  }

  const report = engine.calculateExposure(fixtureId);
  const totalGrossStake = 500 + 300 + 400 + 200 + 300 + 100; // 1800 PTS

  assert.equal(report.totalGrossStake, totalGrossStake);
  assert.equal(report.totalTickets, 6);

  // Check Scenario (2, 0): Home wins, Under 2.5 wins
  // Payouts = 1000 (Home) + 420 (Under) = 1420 PTS
  // Net P&L = 1800 - 1420 = +380 PTS (Bookmaker Profit)
  const cell20 = report.grid.find((c) => c.home === 2 && c.away === 0)!;
  assert.ok(cell20 !== undefined);
  assert.equal(cell20.totalWinningPayout, 1420);
  assert.equal(cell20.netPnL, 380);

  // Check Scenario (2, 1): Home wins, Over 2.5 wins, BTTS Yes wins, Correct Score 2-1 wins
  // Payouts = 1000 + 720 + 510 + 900 = 3130 PTS
  // Net P&L = 1800 - 3130 = -1330 PTS (Bookmaker Loss: 1330 PTS)
  const cell21 = report.grid.find((c) => c.home === 2 && c.away === 1)!;
  assert.ok(cell21 !== undefined);
  assert.equal(cell21.totalWinningPayout, 3130);
  assert.equal(cell21.netPnL, -1330);

  // Check Scenario (0, 0): Draw wins, Under 2.5 wins
  // Payouts = 1050 + 420 = 1470 PTS
  // Net P&L = 1800 - 1470 = +330 PTS
  const cell00 = report.grid.find((c) => c.home === 0 && c.away === 0)!;
  assert.ok(cell00 !== undefined);
  assert.equal(cell00.totalWinningPayout, 1470);
  assert.equal(cell00.netPnL, 330);

  // Check Scenario (0, 1): Away win (no bets placed on Away or Under 0.5)
  // Under 2.5 wins (420 PTS)
  // Net P&L = 1800 - 420 = +1380 PTS (High Bookmaker Profit)
  const cell01 = report.grid.find((c) => c.home === 0 && c.away === 1)!;
  assert.equal(cell01.totalWinningPayout, 420);
  assert.equal(cell01.netPnL, 1380);

  console.log(`  ✓ Total Gross Stake Ingested: ${totalGrossStake} PTS across 6 tickets`);
  console.log(`  ✓ Scenario (2-0): Winning Payout = 1,420 PTS | Net Bookmaker Profit = +380 PTS`);
  console.log(`  ✓ Scenario (2-1): Winning Payout = 3,130 PTS | Net Bookmaker Loss = -1,330 PTS`);
  console.log(`  ✓ Scenario (0-1): Winning Payout = 420 PTS   | Net Bookmaker Profit = +1,380 PTS`);
  console.log('  ✅ Stage 1 Passed: Discrete multi-market scenario matrix mathematically confirmed.');

  // --------------------------------------------------------------------------
  // Stage 2: Worst-Case Drawdown & Probability-Weighted Expected P&L
  // --------------------------------------------------------------------------
  console.log('\n[Stage 2] Evaluating Drawdown Limits & Bivariate Probability Weighing...');

  assert.equal(report.worstCaseScenario.home, 2);
  assert.equal(report.worstCaseScenario.away, 1);
  assert.equal(report.worstCaseScenario.netLoss, 1330);

  // Inject Bivariate Poisson Probability Distribution
  const mockProbs = new Map<string, number>();
  // Distribute probabilities across key scorelines
  mockProbs.set('1-0', 0.12);
  mockProbs.set('2-0', 0.10);
  mockProbs.set('2-1', 0.09); // The heavy exposure cell
  mockProbs.set('0-0', 0.08);
  mockProbs.set('1-1', 0.13);
  mockProbs.set('0-1', 0.07);
  mockProbs.set('1-2', 0.06);

  const probReport = engine.calculateExposure(fixtureId, mockProbs);
  assert.ok(probReport.expectedPnL !== undefined);
  console.log(`  ✓ Worst-Case Scenario identified: (2-1) with Net Drawdown = ${probReport.maxScenarioLoss} PTS`);
  console.log(`  ✓ Probability-weighted Expected P&L: ${probReport.expectedPnL} PTS`);
  console.log('  ✅ Stage 2 Passed: Worst-case drawdown & expected P&L evaluated.');

  // --------------------------------------------------------------------------
  // Stage 3: Pre-Placement Scenario Gate & Max Stake Throttling
  // --------------------------------------------------------------------------
  console.log('\n[Stage 3] Testing Pre-Placement Scenario Gate & Stake Throttling...');
  const scenarioLimit = 1500.0; // Policy limit: max 1,500 PTS loss allowed on any scoreline

  // Proposed Bet 1: 200 PTS on Correct Score 2-1 @ 9.0
  // Adding this would increase scenario (2-1) payout by 1,800 PTS, gross stake by 200 PTS (net loss +1,600 PTS)
  // Projected loss = 1,330 + 1,600 = 2,930 PTS > 1,500 limit -> MUST BE REJECTED!
  const eval1 = engine.evaluateProposedBet(
    fixtureId,
    { marketType: 'CORRECT_SCORE', selection: '2-1', stake: 200, odds: 9.0 },
    scenarioLimit
  );

  assert.equal(eval1.approved, false);
  assert.equal(eval1.currentMaxLoss, 1330);
  assert.equal(eval1.projectedMaxLoss, 2930);
  assert.ok(eval1.reason?.includes('SCENARIO_EXPOSURE_BREACH'));
  assert.ok(eval1.maxPermissibleStake !== undefined);

  // Permissible stake headroom = (1,500 - 1,330) / (9.0 - 1.0) = 170 / 8 = 21.25 PTS
  assert.equal(eval1.maxPermissibleStake, 21.25);
  console.log(`  ✓ Rejected 200 PTS bet on Correct Score 2-1: Projected loss ${eval1.projectedMaxLoss} PTS > limit ${scenarioLimit} PTS`);
  console.log(`  ✓ Dynamically suggested Max Permissible Stake: ${eval1.maxPermissibleStake} PTS`);

  // Proposed Bet 2: 20 PTS on Correct Score 2-1 @ 9.0 (within 21.25 headroom)
  const eval2 = engine.evaluateProposedBet(
    fixtureId,
    { marketType: 'CORRECT_SCORE', selection: '2-1', stake: 20, odds: 9.0 },
    scenarioLimit
  );
  assert.equal(eval2.approved, true);
  assert.ok(eval2.projectedMaxLoss <= scenarioLimit);
  console.log(`  ✓ Approved 20 PTS bet: Projected loss ${eval2.projectedMaxLoss} PTS <= limit ${scenarioLimit} PTS`);

  // Proposed Bet 3: 500 PTS on Away Win (Chelsea) @ 3.5
  // Away win is countervailing to our current Home-heavy exposure -> MUST BE APPROVED!
  const eval3 = engine.evaluateProposedBet(
    fixtureId,
    { marketType: '1X2', selection: 'AWAY', stake: 500, odds: 3.5 },
    scenarioLimit
  );
  assert.equal(eval3.approved, true);
  console.log(`  ✓ Approved 500 PTS countervailing bet on Away Win: Safe against current exposure`);
  console.log('  ✅ Stage 3 Passed: Scenario policy gate and dynamic stake throttling verified.');

  // --------------------------------------------------------------------------
  // Stage 4: Dynamic Market Odds Shading Calculation
  // --------------------------------------------------------------------------
  console.log('\n[Stage 4] Testing Dynamic Market Odds Shading Recommendations...');
  const shading = engine.calculateMarketShading(fixtureId, scenarioLimit);

  const homeShading = shading.find((s) => s.marketType === '1X2' && s.selection === 'HOME')!;
  const awayShading = shading.find((s) => s.marketType === '1X2' && s.selection === 'AWAY')!;

  assert.ok(homeShading !== undefined);
  assert.ok(awayShading !== undefined);

  // Home is heavily exposed (>80% of limit), so recommended action is SHORTEN (multiplier < 1.0)
  assert.equal(homeShading.recommendedAction, 'SHORTEN');
  assert.ok(homeShading.shadingMultiplier < 1.0);

  // Away has minimal bookmaker exposure, so recommended action is LENGTHEN to attract balancing volume
  assert.equal(awayShading.recommendedAction, 'LENGTHEN');
  assert.ok(awayShading.shadingMultiplier > 1.0);

  console.log(`  ✓ Home Win (1X2): Risk Weight = ${homeShading.riskWeight} -> Action: ${homeShading.recommendedAction} (Odds x${homeShading.shadingMultiplier})`);
  console.log(`  ✓ Away Win (1X2): Risk Weight = ${awayShading.riskWeight} -> Action: ${awayShading.recommendedAction} (Odds x${awayShading.shadingMultiplier})`);
  console.log('  ✅ Stage 4 Passed: Concentration-based odds shading adjustments verified.');

  // --------------------------------------------------------------------------
  // Stage 5: Atomic Snapshot & Rollback Preservation via RiskManager
  // --------------------------------------------------------------------------
  console.log('\n[Stage 5] Verifying Atomic Snapshot & Rollback in RiskManager Placement...');
  const riskManager = RiskManager.getInstance();
  const ledger = LedgerService.getInstance();
  ledger.deposit('usr-scenario-test', 1000.0, 'PTS', 'DEP-01');

  BetPlacementService.resetInstance();
  const testMemRepo = new BetSlipMemoryRepository();
  const placementService = BetPlacementService.getInstance(testMemRepo);

  const initialTicketsCount = riskManager.getScenarioEngine().getTickets(fixtureId).length;

  // Place a successful bet
  const successfulBet = placementService.placeBet({
    userId: 'usr-scenario-test',
    betType: 'SINGLE',
    stake: 50.0,
    oddsTolerance: 'REJECT_ON_CHANGE',
    currencyCode: 'PTS',
    legs: [{
      fixtureId,
      fixtureName: 'Arsenal vs Chelsea',
      marketId: 'mkt-1x2',
      marketName: 'Match Winner',
      marketType: '1X2',
      selectionId: 'sel-home-99',
      selectionName: 'HOME',
      submittedOdds: 2.1,
    }],
  }, (_selId) => 2.1);
  assert.equal(successfulBet.status, 'ACCEPTED');
  assert.equal(riskManager.getScenarioEngine().getTickets(fixtureId).length, initialTicketsCount + 1);

  // Now simulate an atomic failure during placement
  const snap = riskManager.snapshotPlacementState();
  riskManager.registerPosition({
    ticketId: 'tkt-failed-test',
    fixtureId,
    marketType: '1X2',
    selection: 'DRAW',
    stake: 500.0,
    potentialPayout: 1500.0,
    status: 'ACCEPTED',
  });
  assert.equal(riskManager.getScenarioEngine().getTickets(fixtureId).length, initialTicketsCount + 2);

  // Rollback snapshot
  riskManager.restorePlacementState(snap);
  assert.equal(
    riskManager.getScenarioEngine().getTickets(fixtureId).length,
    initialTicketsCount + 1,
    'Orphaned scenario positions must be fully unwound on rollback'
  );

  console.log(`  ✓ Bet accepted and recorded in scenario engine: Total positions = ${initialTicketsCount + 1}`);
  console.log(`  ✓ Simulated placement error: Unwound atomically leaving zero orphaned liabilities`);
  console.log('  ✅ Stage 5 Passed: Atomic snapshot & rollback preservation verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Quantitative Scenario Risk Engine Tests PASSED!      ');
  console.log('===============================================================\n');
}

runScenarioExposureTests().catch((err) => {
  console.error('\n❌ Scenario Exposure Risk Test Suite Failed:', err);
  process.exit(1);
});
