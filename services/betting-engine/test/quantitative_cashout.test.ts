import assert from 'node:assert/strict';
import { LedgerService } from '../src/wallet/ledger-service.ts';
import { RiskManager } from '../src/risk/risk-manager.ts';
import { BetPlacementService, BetSlipStatus, LegStatus } from '../src/betting/bet-placement.ts';
import { BetSlipMemoryRepository } from '../src/repositories/memory/betslip-memory-repository.ts';
import { QuantitativeCashoutEngine } from '../src/cashout/quantitative-cashout-engine.ts';
import { CashoutService } from '../src/betting/cashout-service.ts';

async function runQuantitativeCashoutTests() {
  console.log('===============================================================');
  console.log('  💸 Running Quantitative In-Play Cashout Engine Test Suite    ');
  console.log('===============================================================');

  // Reset singletons for pristine test environment
  BetPlacementService.resetInstance();
  QuantitativeCashoutEngine.resetInstance();
  CashoutService.resetInstance();
  RiskManager.resetInstance();

  const testMemRepo = new BetSlipMemoryRepository();
  const placementService = BetPlacementService.getInstance(testMemRepo);
  const ledger = LedgerService.getInstance();
  const riskManager = RiskManager.getInstance();
  const cashoutEngine = QuantitativeCashoutEngine.getInstance(testMemRepo);
  const cashoutService = CashoutService.getInstance();

  const userAlice = 'usr-alice-cashout';
  const userBob = 'usr-bob-cashout';
  const userCharlie = 'usr-charlie-cashout';
  const userDave = 'usr-dave-cashout';

  ledger.deposit(userAlice, 1000.0, 'PTS', 'DEP-ALICE');
  ledger.deposit(userBob, 1000.0, 'PTS', 'DEP-BOB');
  ledger.deposit(userCharlie, 1000.0, 'PTS', 'DEP-CHARLIE');
  ledger.deposit(userDave, 1000.0, 'PTS', 'DEP-DAVE');

  // --------------------------------------------------------------------------
  // Stage 1: Single-Bet Dynamic Valuation Across In-Play Progression
  // --------------------------------------------------------------------------
  console.log('\n[Stage 1] Testing Dynamic Fair Value Cashout Across Match Progression...');
  const fixture1 = 'fix-arsenal-chelsea-001';

  // Alice places 100 PTS on Arsenal Home Win @ 2.0 (Potential Payout: 200 PTS)
  const aliceSlip = placementService.placeBet({
    userId: userAlice,
    betType: 'SINGLE',
    stake: 100.0,
    oddsTolerance: 'ACCEPT_HIGHER_ODDS',
    currencyCode: 'PTS',
    legs: [{
      fixtureId: fixture1,
      fixtureName: 'Arsenal vs Chelsea',
      marketId: 'mkt-1x2',
      marketName: 'Match Winner',
      marketType: '1X2',
      selectionId: 'sel-arsenal-win',
      selectionName: 'HOME',
      submittedOdds: 2.0,
    }],
  }, (_id) => 2.0);

  assert.equal(aliceSlip.status, 'ACCEPTED');
  assert.equal(aliceSlip.potentialPayout, 200.0);

  // 1a. Minute 0 (0-0): Pre-match state
  cashoutEngine.updateMatchState({
    fixtureId: fixture1,
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    currentScore: { home: 0, away: 0 },
    minute: 0,
    redCards: { home: 0, away: 0 },
    status: 'LIVE',
  });

  const quoteMin0 = cashoutEngine.calculateCashoutQuote(aliceSlip.id);
  assert.equal(quoteMin0.status, 'AVAILABLE');
  assert.ok(quoteMin0.fairValue >= 90.0 && quoteMin0.fairValue <= 130.0, `Fair value at min 0: ${quoteMin0.fairValue}`);
  assert.ok(quoteMin0.cashoutOffer! >= 80.0 && quoteMin0.cashoutOffer! <= 120.0, `Offer at min 0: ${quoteMin0.cashoutOffer}`);
  console.log(`  ✓ Min 00 (0-0): P(Home) = ${(quoteMin0.legs[0].conditionalProbability * 100).toFixed(1)}% | Fair Value = ${quoteMin0.fairValue} PTS | Offer = ${quoteMin0.cashoutOffer} PTS`);

  // 1b. Minute 45 (1-0): Arsenal leading at half time
  cashoutEngine.updateMatchState({
    fixtureId: fixture1,
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    currentScore: { home: 1, away: 0 },
    minute: 45,
    redCards: { home: 0, away: 0 },
    status: 'HALF_TIME',
  });

  const quoteMin45 = cashoutEngine.calculateCashoutQuote(aliceSlip.id);
  assert.ok(quoteMin45.fairValue > quoteMin0.fairValue, 'Fair value must increase when leading');
  assert.ok(quoteMin45.cashoutOffer! > quoteMin0.cashoutOffer!, 'Cashout offer must increase when leading');
  console.log(`  ✓ Min 45 (1-0): P(Home) = ${(quoteMin45.legs[0].conditionalProbability * 100).toFixed(1)}% | Fair Value = ${quoteMin45.fairValue} PTS | Offer = ${quoteMin45.cashoutOffer} PTS`);

  // 1c. Minute 80 (2-0): Arsenal dominates late in the game
  cashoutEngine.updateMatchState({
    fixtureId: fixture1,
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    currentScore: { home: 2, away: 0 },
    minute: 80,
    redCards: { home: 0, away: 0 },
    status: 'LIVE',
  });

  const quoteMin80 = cashoutEngine.calculateCashoutQuote(aliceSlip.id);
  assert.ok(quoteMin80.fairValue > quoteMin45.fairValue);
  assert.ok(quoteMin80.cashoutOffer! > quoteMin45.cashoutOffer!);
  assert.ok(quoteMin80.legs[0].conditionalProbability > 0.90, 'High win probability at 2-0 min 80');
  console.log(`  ✓ Min 80 (2-0): P(Home) = ${(quoteMin80.legs[0].conditionalProbability * 100).toFixed(1)}% | Fair Value = ${quoteMin80.fairValue} PTS | Offer = ${quoteMin80.cashoutOffer} PTS`);
  console.log('  ✅ Stage 1 Passed: Monotonic valuation progression across in-play states verified.');

  // --------------------------------------------------------------------------
  // Stage 2: In-Play Suspension Protection (Anti-Arbitrage Guard)
  // --------------------------------------------------------------------------
  console.log('\n[Stage 2] Verifying In-Play Suspension & Market Freeze Protection...');
  // At Minute 82, Chelsea scores a goal or VAR is called -> Market suspended!
  cashoutEngine.updateMatchState({
    fixtureId: fixture1,
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    currentScore: { home: 2, away: 1 },
    minute: 82,
    redCards: { home: 0, away: 0 },
    status: 'SUSPENDED',
    isSuspended: true,
  });

  const suspendedQuote = cashoutEngine.calculateCashoutQuote(aliceSlip.id);
  assert.equal(suspendedQuote.status, 'SUSPENDED');
  assert.equal(suspendedQuote.cashoutOffer, null);
  assert.ok(suspendedQuote.suspensionReason?.includes('MARKET_SUSPENDED'));

  // Attempting execution while suspended must throw CASHOUT_SUSPENDED
  assert.throws(() => {
    cashoutService.executeCashout(aliceSlip.id, 160.0);
  }, /CASHOUT_SUSPENDED/);
  console.log('  ✓ In-play suspension correctly locked cashout and prevented execution');

  // Resume trading after VAR confirmation
  cashoutEngine.updateMatchState({
    fixtureId: fixture1,
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    currentScore: { home: 2, away: 1 },
    minute: 84,
    redCards: { home: 0, away: 0 },
    status: 'LIVE',
    isSuspended: false,
  });

  const resumedQuote = cashoutEngine.calculateCashoutQuote(aliceSlip.id);
  assert.equal(resumedQuote.status, 'AVAILABLE');
  assert.ok(resumedQuote.cashoutOffer !== null && resumedQuote.cashoutOffer > 100.0);
  console.log(`  ✓ Resumed Min 84 (2-1): Offer reopened at ${resumedQuote.cashoutOffer} PTS`);
  console.log('  ✅ Stage 2 Passed: Anti-arbitrage market suspension guards verified.');

  // --------------------------------------------------------------------------
  // Stage 3: Multi-Leg Accumulator (Combi) Cashout Valuation
  // --------------------------------------------------------------------------
  console.log('\n[Stage 3] Testing Multi-Leg Accumulator (Combi) Cashout Valuation...');
  const fixtureA = 'fix-combi-madrid-barca';
  const fixtureB = 'fix-combi-bayern-dortmund';
  const fixtureC = 'fix-combi-liverpool-city';

  // Bob places a 3-leg combi: 50 PTS stake @ Odds: 2.0 * 1.8 * 2.0 = 7.2 (Payout: 360 PTS)
  const bobSlip = placementService.placeBet({
    userId: userBob,
    betType: 'COMBI',
    stake: 50.0,
    oddsTolerance: 'ACCEPT_HIGHER_ODDS',
    currencyCode: 'PTS',
    legs: [
      {
        fixtureId: fixtureA,
        fixtureName: 'Real Madrid vs Barcelona',
        marketId: 'mkt-1x2-a',
        marketName: 'Match Winner',
        marketType: '1X2',
        selectionId: 'sel-madrid-win',
        selectionName: 'HOME',
        submittedOdds: 2.0,
      },
      {
        fixtureId: fixtureB,
        fixtureName: 'Bayern vs Dortmund',
        marketId: 'mkt-ou-b',
        marketName: 'Total Goals (Over/Under 2.5)',
        marketType: 'TOTAL_GOALS',
        selectionId: 'sel-bayern-over',
        selectionName: 'OVER 2.5',
        submittedOdds: 1.8,
      },
      {
        fixtureId: fixtureC,
        fixtureName: 'Liverpool vs Man City',
        marketId: 'mkt-btts-c',
        marketName: 'Both Teams To Score',
        marketType: 'BTTS',
        selectionId: 'sel-liv-btts',
        selectionName: 'YES',
        submittedOdds: 2.0,
      },
    ],
  }, (_id) => 2.0);

  // Setup match states:
  // Leg 1: Finished 3-1 (Madrid Won) -> Mark Leg WON!
  bobSlip.legs[0].status = LegStatus.WON;

  // Leg 2: Minute 65, Score 1-1 (2 goals so far, line 2.5) -> In-play model
  cashoutEngine.updateMatchState({
    fixtureId: fixtureB,
    homeTeam: 'Bayern',
    awayTeam: 'Dortmund',
    currentScore: { home: 1, away: 1 },
    minute: 65,
    status: 'LIVE',
  });

  // Leg 3: Minute 30, Score 1-1 -> BTTS is ALREADY GUARANTEED WON!
  cashoutEngine.updateMatchState({
    fixtureId: fixtureC,
    homeTeam: 'Liverpool',
    awayTeam: 'Man City',
    currentScore: { home: 1, away: 1 },
    minute: 30,
    status: 'LIVE',
  });

  const bobQuote = cashoutEngine.calculateCashoutQuote(bobSlip.id);
  assert.equal(bobQuote.status, 'AVAILABLE');

  // Leg 1 was WON -> Prob = 1.0
  assert.equal(bobQuote.legs[0].conditionalProbability, 1.0);
  // Leg 3 BTTS condition (1-1) was reached -> Prob = 1.0 (physically guaranteed)
  assert.equal(bobQuote.legs[2].conditionalProbability, 1.0);
  // Overall joint probability is driven by Leg 2
  assert.ok(bobQuote.jointProbability > 0.40 && bobQuote.jointProbability < 0.90);
  assert.ok(bobQuote.cashoutOffer! > 100.0, `Accumulator cashout offer: ${bobQuote.cashoutOffer}`);
  console.log(`  ✓ Combi Legs: Leg 1 (WON, 100%) | Leg 2 (${(bobQuote.legs[1].conditionalProbability * 100).toFixed(1)}%) | Leg 3 (GUARANTEED, 100%)`);
  console.log(`  ✓ Joint Ticket Probability: ${(bobQuote.jointProbability * 100).toFixed(1)}% | Cashout Offer: ${bobQuote.cashoutOffer} PTS (Stake: 50 PTS, Max Payout: 360 PTS)`);
  console.log('  ✅ Stage 3 Passed: Multi-leg accumulator conditional joint probability confirmed.');

  // --------------------------------------------------------------------------
  // Stage 4: Partial Cashout Execution & Sequential Splitting
  // --------------------------------------------------------------------------
  console.log('\n[Stage 4] Testing Partial Cashout & Sequential Double-Entry Escrow Splitting...');
  const fixturePartial = 'fix-partial-cashout-001';

  // Charlie places 100 PTS on Single Bet @ 2.5 (Payout: 250 PTS)
  const charlieSlip = placementService.placeBet({
    userId: userCharlie,
    betType: 'SINGLE',
    stake: 100.0,
    oddsTolerance: 'ACCEPT_HIGHER_ODDS',
    currencyCode: 'PTS',
    legs: [{
      fixtureId: fixturePartial,
      fixtureName: 'Milan vs Inter',
      marketId: 'mkt-1x2',
      marketName: 'Match Winner',
      marketType: '1X2',
      selectionId: 'sel-milan-win',
      selectionName: 'HOME',
      submittedOdds: 2.5,
    }],
  }, (_id) => 2.5);

  const charlieInitialBalance = ledger.getBalance(userCharlie, 'PTS');
  assert.equal(charlieInitialBalance, 900.0); // 1000 - 100 stake held in escrow

  // Minute 60: Milan leads 1-0
  cashoutEngine.updateMatchState({
    fixtureId: fixturePartial,
    homeTeam: 'Milan',
    awayTeam: 'Inter',
    currentScore: { home: 1, away: 0 },
    minute: 60,
    status: 'LIVE',
  });

  const charlieQuote = cashoutEngine.calculateCashoutQuote(charlieSlip.id);
  assert.ok(charlieQuote.cashoutOffer! >= 120.0, `Offer at min 60: ${charlieQuote.cashoutOffer}`);
  const fullOffer = charlieQuote.cashoutOffer!;

  // Charlie executes a 50% PARTIAL CASHOUT
  console.log(`  -> Charlie executes 50% Partial Cashout on ${fullOffer} PTS offer...`);
  const partialResult = cashoutEngine.executeCashout({
    slipId: charlieSlip.id,
    cashoutPercentage: 0.50,
  });

  assert.equal(partialResult.isPartial, true);
  assert.equal(partialResult.cashoutPercentage, 0.50);
  const expectedPartialPayout = parseFloat((fullOffer * 0.50).toFixed(2));
  assert.equal(partialResult.cashoutAmount, expectedPartialPayout);

  // Charlie's active ticket remains ACCEPTED with reduced stake and potential payout
  assert.equal(charlieSlip.status, 'ACCEPTED');
  assert.equal(charlieSlip.stake, 50.0); // 50% of 100
  assert.equal(charlieSlip.potentialPayout, 125.0); // 50% of 250
  assert.equal(charlieSlip.actualPayout, expectedPartialPayout);

  // Charlie's balance increased by partial cashout amount
  const charlieMidBalance = ledger.getBalance(userCharlie, 'PTS');
  assert.equal(charlieMidBalance, 900.0 + expectedPartialPayout);
  console.log(`  ✓ 50% Partial Cashed Out: Received ${expectedPartialPayout} PTS | Balance: ${charlieMidBalance} PTS`);
  console.log(`  ✓ Remaining Active Ticket: Stake = ${charlieSlip.stake} PTS | Potential Payout = ${charlieSlip.potentialPayout} PTS | Status = ${charlieSlip.status}`);

  // Scenario engine positions updated to the remaining 50 / 125 PTS
  const scenarioTickets = riskManager.getScenarioEngine().getTickets(fixturePartial);
  const charliePos = scenarioTickets.find((t) => t.ticketId === charlieSlip.id);
  assert.ok(charliePos !== undefined);
  assert.equal(charliePos.stake, 50.0);
  assert.equal(charliePos.potentialPayout, 125.0);
  console.log(`  ✓ Scenario Risk Engine Position updated: Stake ${charliePos.stake} PTS, Potential Payout ${charliePos.potentialPayout} PTS`);

  // Charlie later executes 100% FULL CASHOUT on the remaining active 50 PTS portion
  console.log('  -> Charlie executes remaining Full Cashout at Minute 75...');
  cashoutEngine.updateMatchState({
    fixtureId: fixturePartial,
    homeTeam: 'Milan',
    awayTeam: 'Inter',
    currentScore: { home: 2, away: 0 },
    minute: 75,
    status: 'LIVE',
  });

  const remainingResult = cashoutEngine.executeCashout({
    slipId: charlieSlip.id,
    cashoutPercentage: 1.0,
  });

  assert.equal(remainingResult.isPartial, false);
  assert.equal(charlieSlip.status, 'CASHED_OUT');
  assert.equal(charlieSlip.potentialPayout, 125.0);

  // Total balance conservation verified
  const isConserved = ledger.verifyLedgerConservation();
  assert.equal(isConserved, true, 'Double-entry ledger must remain conserved after partial + full cashouts');
  console.log(`  ✓ Remaining portion cashed out: Received ${remainingResult.cashoutAmount} PTS | Final Ticket Status = ${charlieSlip.status}`);
  console.log('  ✅ Stage 4 Passed: Partial cashout execution & double-entry conservation verified.');

  // --------------------------------------------------------------------------
  // Stage 5: Slippage Protection & Atomic Snapshot Rollback
  // --------------------------------------------------------------------------
  console.log('\n[Stage 5] Testing Slippage Protection & Atomic Placement Rollback...');
  const fixtureDave = 'fix-slippage-test-001';

  const daveSlip = placementService.placeBet({
    userId: userDave,
    betType: 'SINGLE',
    stake: 100.0,
    oddsTolerance: 'ACCEPT_HIGHER_ODDS',
    currencyCode: 'PTS',
    legs: [{
      fixtureId: fixtureDave,
      fixtureName: 'Juventus vs Napoli',
      marketId: 'mkt-1x2',
      marketName: 'Match Winner',
      marketType: '1X2',
      selectionId: 'sel-juve-win',
      selectionName: 'HOME',
      submittedOdds: 2.0,
    }],
  }, (_id) => 2.0);

  cashoutEngine.updateMatchState({
    fixtureId: fixtureDave,
    homeTeam: 'Juventus',
    awayTeam: 'Napoli',
    currentScore: { home: 0, away: 0 },
    minute: 30,
    status: 'LIVE',
  });

  const daveQuote = cashoutEngine.calculateCashoutQuote(daveSlip.id);
  const currentOffer = daveQuote.cashoutOffer!;

  // 5a. Slippage violation: Expected amount is 150 PTS but current offer is ~90 PTS
  assert.throws(() => {
    cashoutEngine.executeCashout({
      slipId: daveSlip.id,
      expectedAmount: currentOffer + 20.0, // Exceeds tolerance
      maxSlippage: 1.0,
    });
  }, /CASHOUT_VALUE_CHANGED/);

  // Verify state untouched after slippage rejection
  assert.equal(daveSlip.status, 'ACCEPTED');
  assert.equal(ledger.getBalance(userDave, 'PTS'), 900.0);
  console.log('  ✓ Slippage protection rejected stale quote request without modifying balance');

  // 5b. Successful execution within slippage tolerance
  const successfulResult = cashoutEngine.executeCashout({
    slipId: daveSlip.id,
    expectedAmount: currentOffer,
    maxSlippage: 0.50,
  });
  assert.equal(successfulResult.slip.status, 'CASHED_OUT');
  assert.equal(ledger.getBalance(userDave, 'PTS'), 900.0 + currentOffer);
  console.log(`  ✓ Accepted cashout with exact quote match: User balance updated to ${ledger.getBalance(userDave, 'PTS')} PTS`);
  console.log('  ✅ Stage 5 Passed: Slippage validation and atomic consistency verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Quantitative In-Play Cashout Engine Tests PASSED!     ');
  console.log('===============================================================\n');
}

runQuantitativeCashoutTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
