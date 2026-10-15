import assert from 'node:assert/strict';
import { LedgerService } from '../src/wallet/ledger-service.ts';
import { RiskManager } from '../src/risk/risk-manager.ts';
import { BetPlacementService, BetSlipStatus } from '../src/betting/bet-placement.ts';
import { BetSlipMemoryRepository } from '../src/repositories/memory/betslip-memory-repository.ts';
import { AuthoritativeSettlementService } from '../src/settlement/authoritative-settlement.ts';
import { QuantitativeCashoutEngine } from '../src/cashout/quantitative-cashout-engine.ts';
import { TraderOperationsService } from '../src/trader/trader-operations-service.ts';
import { AuthTokenManager, UserRole } from '../../../packages/core-types/src/auth.ts';

async function runTraderOperationsTests() {
  console.log('===============================================================');
  console.log('  🛡️ Running Operator & Trader Console (Phase 5) Test Suite   ');
  console.log('===============================================================');

  // Reset singletons for pristine test environment
  BetPlacementService.resetInstance();
  QuantitativeCashoutEngine.resetInstance();
  TraderOperationsService.resetInstance();
  AuthoritativeSettlementService.resetInstance();
  RiskManager.resetInstance();

  const testMemRepo = new BetSlipMemoryRepository();
  const placementService = BetPlacementService.getInstance(testMemRepo);
  const ledger = LedgerService.getInstance();
  const traderOps = TraderOperationsService.getInstance();
  const settlementService = AuthoritativeSettlementService.getInstance();

  const userPunter = 'usr-punter-trader-test';
  ledger.deposit(userPunter, 1000.0, 'PTS', 'DEP-PUNTER');

  // --------------------------------------------------------------------------
  // Stage 1: Role-Based Access Control (RBAC) & Health Summary
  // --------------------------------------------------------------------------
  console.log('\n[Stage 1] Verifying Trader RBAC & Operational Health Summary...');
  const playerToken = AuthTokenManager.createSession({
    id: userPunter,
    username: 'alice_punter',
    role: UserRole.PLAYER,
  });

  const traderToken = AuthTokenManager.createSession({
    id: 'usr-trader-01',
    username: 'trader_bob',
    role: UserRole.TRADER,
  });

  const adminToken = AuthTokenManager.createSession({
    id: 'usr-admin-01',
    username: 'admin_chief',
    role: UserRole.ADMINISTRATOR,
  });

  const playerVerified = AuthTokenManager.verifySession(playerToken);
  const traderVerified = AuthTokenManager.verifySession(traderToken);
  const adminVerified = AuthTokenManager.verifySession(adminToken);

  assert.equal(playerVerified?.role, UserRole.PLAYER);
  assert.equal(traderVerified?.role, UserRole.TRADER);
  assert.equal(adminVerified?.role, UserRole.ADMINISTRATOR);

  // Validate Trader privilege tier
  assert.equal(AuthTokenManager.isAuthorized(UserRole.PLAYER, UserRole.TRADER), false);
  assert.equal(AuthTokenManager.isAuthorized(UserRole.TRADER, UserRole.PLAYER), true);
  assert.equal(AuthTokenManager.isAuthorized(UserRole.ADMINISTRATOR, UserRole.TRADER), true);

  const health = traderOps.getOperationalHealthSummary();
  assert.equal(health.tradingStatus.globalEmergencyFreeze, false);
  assert.equal(health.financialAudit.isLedgerConserved, true);
  assert.equal(health.financialAudit.status, 'OPTIMAL');
  assert.ok(health.feedSlaStatus.providers.includes('EnetPulse'));
  console.log('  ✓ RBAC authorization tiers strictly verified for PLAYER vs TRADER vs ADMIN');
  console.log('  ✓ Operational health summary verified: Double-Entry Conservation = 100% Balanced');
  console.log('  ✅ Stage 1 Passed: Authentication & Operational Health metrics confirmed.');

  // --------------------------------------------------------------------------
  // Stage 2: Emergency Global Trading Freeze
  // --------------------------------------------------------------------------
  console.log('\n[Stage 2] Testing Emergency Global Trading Freeze...');
  const fixture1 = 'fix-trader-global-001';

  // Apply Global Freeze
  const freezeLog = traderOps.setGlobalEmergencyFreeze('trader_bob', true, 'Upstream Satellite Feed Interrupted');
  assert.equal(freezeLog.action, 'GLOBAL_EMERGENCY_FREEZE');
  assert.equal(traderOps.isGloballyFrozen().frozen, true);

  // Attempting to place bet must be rejected immediately by the trading gate
  assert.throws(() => {
    placementService.placeBet({
      userId: userPunter,
      betType: 'SINGLE',
      stake: 50.0,
      currencyCode: 'PTS',
      legs: [{
        fixtureId: fixture1,
        fixtureName: 'Liverpool vs Arsenal',
        marketId: 'mkt-1x2',
        marketName: 'Match Winner',
        marketType: '1X2',
        selectionId: 'sel-liv-win',
        selectionName: 'HOME',
        submittedOdds: 2.1,
      }],
    }, (_id) => 2.1);
  }, /GLOBAL_EMERGENCY_FREEZE/);
  console.log('  ✓ Bet placement safely blocked during Global Emergency Freeze');

  // Lift Global Freeze
  const liftLog = traderOps.setGlobalEmergencyFreeze('trader_bob', false, 'Feed connection restored');
  assert.equal(liftLog.action, 'GLOBAL_LIFT_FREEZE');
  assert.equal(traderOps.isGloballyFrozen().frozen, false);

  // Placement now succeeds
  const successfulBet = placementService.placeBet({
    userId: userPunter,
    betType: 'SINGLE',
    stake: 50.0,
    currencyCode: 'PTS',
    legs: [{
      fixtureId: fixture1,
      fixtureName: 'Liverpool vs Arsenal',
      marketId: 'mkt-1x2',
      marketName: 'Match Winner',
      marketType: '1X2',
      selectionId: 'sel-liv-win',
      selectionName: 'HOME',
      submittedOdds: 2.1,
    }],
  }, (_id) => 2.1);
  assert.equal(successfulBet.status, BetSlipStatus.ACCEPTED);
  console.log('  ✓ Trading resumed smoothly after lifting Global Emergency Freeze');
  console.log('  ✅ Stage 2 Passed: Global emergency freeze controls verified.');

  // --------------------------------------------------------------------------
  // Stage 3: Granular Fixture & Market Level Freezes
  // --------------------------------------------------------------------------
  console.log('\n[Stage 3] Testing Granular Fixture & Market Freezes...');
  const fixtureIsolated = 'fix-fixture-freeze-002';
  const fixtureOther = 'fix-normal-003';

  // 3a. Freeze single fixture
  traderOps.setFixtureFreeze('trader_bob', fixtureIsolated, true, 'VAR Review underway for possible penalty');
  assert.equal(traderOps.isFixtureFrozen(fixtureIsolated).frozen, true);
  assert.equal(traderOps.isFixtureFrozen(fixtureOther).frozen, false);

  // Attempt bet on frozen fixture -> Rejected
  assert.throws(() => {
    placementService.placeBet({
      userId: userPunter,
      betType: 'SINGLE',
      stake: 20.0,
      currencyCode: 'PTS',
      legs: [{
        fixtureId: fixtureIsolated,
        fixtureName: 'Bayern vs Leipzig',
        marketId: 'mkt-1x2',
        marketName: 'Match Winner',
        marketType: '1X2',
        selectionId: 'sel-bayern-win',
        selectionName: 'HOME',
        submittedOdds: 1.5,
      }],
    }, (_id) => 1.5);
  }, /FIXTURE_FREEZE/);

  // Bet on other fixture -> Allowed
  const allowedOtherBet = placementService.placeBet({
    userId: userPunter,
    betType: 'SINGLE',
    stake: 20.0,
    currencyCode: 'PTS',
    legs: [{
      fixtureId: fixtureOther,
      fixtureName: 'Inter vs Roma',
      marketId: 'mkt-1x2',
      marketName: 'Match Winner',
      marketType: '1X2',
      selectionId: 'sel-inter-win',
      selectionName: 'HOME',
      submittedOdds: 1.8,
    }],
  }, (_id) => 1.8);
  assert.equal(allowedOtherBet.status, BetSlipStatus.ACCEPTED);
  console.log('  ✓ Fixture-level freeze isolated strictly to target match');

  // Lift fixture freeze
  traderOps.setFixtureFreeze('trader_bob', fixtureIsolated, false, 'Penalty resolved');

  // 3b. Freeze specific Market (1X2) on fixtureOther
  traderOps.setMarketFreeze('trader_bob', fixtureOther, '1X2', true, 'Suspicious betting volume on 1X2');
  assert.equal(traderOps.isMarketFrozen(fixtureOther, '1X2').frozen, true);
  assert.equal(traderOps.isMarketFrozen(fixtureOther, 'TOTAL_GOALS').frozen, false);

  // Attempt 1X2 -> Rejected
  assert.throws(() => {
    placementService.placeBet({
      userId: userPunter,
      betType: 'SINGLE',
      stake: 10.0,
      currencyCode: 'PTS',
      legs: [{
        fixtureId: fixtureOther,
        fixtureName: 'Inter vs Roma',
        marketId: 'mkt-1x2',
        marketName: 'Match Winner',
        marketType: '1X2',
        selectionId: 'sel-inter-win',
        selectionName: 'HOME',
        submittedOdds: 1.8,
      }],
    }, (_id) => 1.8);
  }, /MARKET_FREEZE/);

  // Attempt Over/Under -> Accepted!
  const allowedTotalBet = placementService.placeBet({
    userId: userPunter,
    betType: 'SINGLE',
    stake: 10.0,
    currencyCode: 'PTS',
    legs: [{
      fixtureId: fixtureOther,
      fixtureName: 'Inter vs Roma',
      marketId: 'mkt-ou',
      marketName: 'Total Goals (Over/Under 2.5)',
      marketType: 'TOTAL_GOALS',
      selectionId: 'sel-inter-over',
      selectionName: 'OVER',
      submittedOdds: 1.9,
    }],
  }, (_id) => 1.9);
  assert.equal(allowedTotalBet.status, BetSlipStatus.ACCEPTED);
  console.log('  ✓ Market-level freeze selectively locks targeted market while keeping others tradable');
  console.log('  ✅ Stage 3 Passed: Multi-layer hierarchical freeze controls verified.');

  // --------------------------------------------------------------------------
  // Stage 4: Odds Shading & Target Margin Overrides
  // --------------------------------------------------------------------------
  console.log('\n[Stage 4] Testing Odds Shading & Target Margin Overrides...');
  const fixtureShade = 'fix-shade-004';

  // Apply shading multiplier override (e.g. 0.95 = 5% price haircut) with 100ms TTL
  traderOps.setPriceShadingOverride('trader_bob', fixtureShade, '1X2', 'HOME', 0.95, 'High sharp volume discount', 1);
  assert.equal(traderOps.getShadingMultiplier(fixtureShade, '1X2', 'HOME'), 0.95);
  assert.equal(traderOps.getShadingMultiplier(fixtureShade, '1X2', 'AWAY'), 1.0);

  // Apply target margin override (e.g. 1.08 instead of 1.06) with 100ms TTL
  traderOps.setMarginOverride('trader_bob', fixtureShade, 1.08, 'Derby match heightened uncertainty', 1);
  assert.equal(traderOps.getMarginOverride(fixtureShade), 1.08);

  console.log('  ✓ Active odds shading: Home x0.95 (Haircut applied) | Target Margin = 1.08');
  console.log('  ✅ Stage 4 Passed: Trader price shading and margin overrides verified.');

  // --------------------------------------------------------------------------
  // Stage 5: Post-Match Tribunal Result Correction & Reversal Preview
  // --------------------------------------------------------------------------
  console.log('\n[Stage 5] Testing Tribunal Result Correction & Reversal Preview...');
  const fixtureTribunal = 'fix-tribunal-var-005';

  const userAlice = 'usr-tribunal-alice';
  const userCharlie = 'usr-tribunal-charlie';
  ledger.deposit(userAlice, 500.0, 'PTS', 'DEP-ALICE');
  ledger.deposit(userCharlie, 500.0, 'PTS', 'DEP-CHARLIE');

  // Register tickets in authoritative settlement
  settlementService.registerTicket({
    id: 'tkt-alice-home',
    userId: userAlice,
    fixtureId: fixtureTribunal,
    marketName: '1X2',
    selectionName: 'HOME',
    stake: 100.0,
    odds: 2.0,
    potentialPayout: 200.0,
    status: 'ACCEPTED',
    currencyCode: 'PTS',
  });

  settlementService.registerTicket({
    id: 'tkt-charlie-draw',
    userId: userCharlie,
    fixtureId: fixtureTribunal,
    marketName: '1X2',
    selectionName: 'DRAW',
    stake: 50.0,
    odds: 3.5,
    potentialPayout: 175.0,
    status: 'ACCEPTED',
    currencyCode: 'PTS',
  });

  // Initial settlement: Arsenal 2 - Chelsea 1 (Home Won)
  await settlementService.settleFixture({
    fixtureId: fixtureTribunal,
    homeScore: 2,
    awayScore: 1,
    status: 'FINISHED',
    source: 'OFFICIAL_FEED',
  });

  // Verify Alice won 200 PTS, Charlie lost
  assert.equal(settlementService.getTicket('tkt-alice-home')?.status, 'SETTLED_WON');
  assert.equal(settlementService.getTicket('tkt-charlie-draw')?.status, 'SETTLED_LOST');

  // Now simulate post-match VAR overturn: Kai Havertz goal overturned for handball -> Score: 1 - 1 (DRAW)
  // Step 5a. Generate Tribunal Reversal Preview
  const preview = traderOps.previewTribunalReversal(fixtureTribunal, { home: 1, away: 1 });
  assert.equal(preview.totalTicketsEvaluated, 2);
  assert.equal(preview.ticketsToReverse, 1); // Alice must be reversed
  assert.equal(preview.ticketsNewlyWinning, 1); // Charlie newly wins
  assert.equal(preview.grossDebitAmount, 200.0); // Reclaim 200 PTS from Alice
  assert.equal(preview.grossCreditAmount, 175.0); // Credit 175 PTS to Charlie
  assert.equal(preview.netBookmakerImpact, 25.0); // Bookmaker gains +25 PTS net

  console.log(`  ✓ Reversal Preview: Reclaim ${preview.grossDebitAmount} PTS from 1 ticket | Credit ${preview.grossCreditAmount} PTS to 1 ticket`);

  // Step 5b. Commit Tribunal Correction
  const report = await traderOps.executeTribunalCorrection(
    'tribunal_judge_01',
    fixtureTribunal,
    { home: 1, away: 1 },
    'Official FA tribunal overturn of 89th minute goal for handball'
  );

  assert.equal(report.reversedTickets.length, 1);
  assert.equal(report.newlySettledTickets.length, 1);
  assert.equal(settlementService.getTicket('tkt-alice-home')?.status, 'SETTLED_LOST');
  assert.equal(settlementService.getTicket('tkt-charlie-draw')?.status, 'SETTLED_WON');

  // Verify total double-entry ledger balance conservation
  const isConserved = ledger.verifyLedgerConservation();
  assert.equal(isConserved, true, 'Ledger must maintain 100% mathematical conservation after tribunal reversals');
  console.log('  ✓ Tribunal correction committed: Alice reversed, Charlie credited');
  console.log('  ✓ Double-entry ledger strictly conserved with zero balance leakage');
  console.log('  ✅ Stage 5 Passed: Tribunal result correction and reversal preview confirmed.');

  // --------------------------------------------------------------------------
  // Stage 6: Regulatory Audit Log Inspection
  // --------------------------------------------------------------------------
  console.log('\n[Stage 6] Verifying Regulatory Audit Log Stream...');
  const logs = traderOps.getAuditLog();
  assert.ok(logs.length >= 6);

  const actionsLogged = logs.map((l) => l.action);
  assert.ok(actionsLogged.includes('GLOBAL_EMERGENCY_FREEZE'));
  assert.ok(actionsLogged.includes('GLOBAL_LIFT_FREEZE'));
  assert.ok(actionsLogged.includes('FIXTURE_FREEZE'));
  assert.ok(actionsLogged.includes('MARKET_FREEZE'));
  assert.ok(actionsLogged.includes('SHADE_ODDS'));
  assert.ok(actionsLogged.includes('MANUAL_RESULT_CORRECTION'));

  for (const log of logs) {
    assert.ok(log.id && log.actor && log.action && log.createdAt);
  }
  console.log(`  ✓ Total Audit Records Logged: ${logs.length} across 6 action categories`);
  console.log('  ✅ Stage 6 Passed: Regulatory immutable audit trail verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Operator & Trader Console (Phase 5) Tests PASSED!     ');
  console.log('===============================================================\n');
}

runTraderOperationsTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
