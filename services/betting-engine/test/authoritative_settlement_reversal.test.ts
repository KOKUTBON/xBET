import assert from 'node:assert/strict';
import {
  AuthoritativeSettlementService,
  type StoredTicket,
  type FinalMatchResult,
} from '../src/settlement/authoritative-settlement.ts';
import { LedgerService } from '../src/wallet/ledger-service.ts';

async function runSettlementAndReversalTests() {
  console.log('===============================================================');
  console.log('  ⚖️ Running Authoritative Settlement & Reversal Test Suite');
  console.log('===============================================================');

  const settlementService = AuthoritativeSettlementService.getInstance();
  const ledger = LedgerService.getInstance();

  const userA = 'punter-settle-alice';
  const userB = 'punter-settle-bob';
  const userC = 'punter-settle-charlie';
  const userD = 'punter-settle-david';

  // Deposit initial funds
  ledger.deposit(userA, 100.0, 'PTS', 'DEP-ALICE-100');
  ledger.deposit(userB, 100.0, 'PTS', 'DEP-BOB-100');
  ledger.deposit(userC, 100.0, 'PTS', 'DEP-CHARLIE-100');
  ledger.deposit(userD, 100.0, 'PTS', 'DEP-DAVID-100');

  // --------------------------------------------------------------------------
  // Stage 1: Register and Escrow Bets
  // --------------------------------------------------------------------------
  console.log('\n[Stage 1] Escrowing Stakes & Registering Open Tickets...');
  const fixtureId = 'fix-arsenal-chelsea-final';

  // Alice: Home @ 1.80, Stake 50 PTS, Payout 90 PTS
  ledger.holdBetStake(userA, 't-001', 50.0, 'PTS');
  settlementService.registerTicket({
    id: 't-001',
    userId: userA,
    fixtureId,
    marketName: 'Match Winner (1X2)',
    selectionName: 'Home',
    stake: 50.0,
    odds: 1.80,
    potentialPayout: 90.0,
    status: 'ACCEPTED',
    currencyCode: 'PTS',
  });

  // Bob: Draw @ 3.50, Stake 30 PTS, Payout 105 PTS
  ledger.holdBetStake(userB, 't-002', 30.0, 'PTS');
  settlementService.registerTicket({
    id: 't-002',
    userId: userB,
    fixtureId,
    marketName: 'Match Winner (1X2)',
    selectionName: 'Draw',
    stake: 30.0,
    odds: 3.50,
    potentialPayout: 105.0,
    status: 'ACCEPTED',
    currencyCode: 'PTS',
  });

  // Charlie: Over 2.5 @ 2.10, Stake 40 PTS, Payout 84 PTS
  ledger.holdBetStake(userC, 't-003', 40.0, 'PTS');
  settlementService.registerTicket({
    id: 't-003',
    userId: userC,
    fixtureId,
    marketName: 'Total Goals (Over/Under 2.5)',
    marketLine: '2.5',
    selectionName: 'Over 2.5',
    stake: 40.0,
    odds: 2.10,
    potentialPayout: 84.0,
    status: 'ACCEPTED',
    currencyCode: 'PTS',
  });

  // David: BTTS Yes @ 1.90, Stake 25 PTS, Payout 47.5 PTS
  ledger.holdBetStake(userD, 't-004', 25.0, 'PTS');
  settlementService.registerTicket({
    id: 't-004',
    userId: userD,
    fixtureId,
    marketName: 'Both Teams To Score',
    selectionName: 'Yes',
    stake: 25.0,
    odds: 1.90,
    potentialPayout: 47.5,
    status: 'ACCEPTED',
    currencyCode: 'PTS',
  });

  assert.equal(ledger.getBalance(userA, 'PTS'), 50.0);
  assert.equal(ledger.getBalance(userB, 'PTS'), 70.0);
  assert.equal(ledger.getBalance(userC, 'PTS'), 60.0);
  assert.equal(ledger.getBalance(userD, 'PTS'), 75.0);
  assert.equal(ledger.verifyLedgerConservation(), true);
  console.log('  ✅ Stage 1 Passed: 4 tickets accepted, stakes held in escrow, ledger balanced.');

  // --------------------------------------------------------------------------
  // Stage 2: Authoritative Settlement (Initial Whistle: Arsenal 2 - Chelsea 1)
  // --------------------------------------------------------------------------
  console.log('\n[Stage 2] Settling Match Outcome: Arsenal 2 - Chelsea 1 (Total: 3 Goals)...');
  const initialResult: FinalMatchResult = {
    fixtureId,
    homeScore: 2,
    awayScore: 1,
    status: 'FINISHED',
    source: 'canonical-feed-referee',
  };

  const settlementReport = await settlementService.settleFixture(initialResult);
  assert.equal(settlementReport.revision, 1);
  assert.equal(settlementReport.totalSettled, 4);
  assert.equal(settlementReport.winningTickets, 3); // Home, Over 2.5, BTTS Yes
  assert.equal(settlementReport.losingTickets, 1);  // Draw

  // Verify ticket statuses and updated balances
  assert.equal(settlementService.getTicket('t-001')!.status, 'SETTLED_WON');
  assert.equal(settlementService.getTicket('t-002')!.status, 'SETTLED_LOST');
  assert.equal(settlementService.getTicket('t-003')!.status, 'SETTLED_WON');
  assert.equal(settlementService.getTicket('t-004')!.status, 'SETTLED_WON');

  // Alice won 90: start 100 - 50 + 90 = 140
  assert.equal(ledger.getBalance(userA, 'PTS'), 140.0);
  // Bob lost 30: start 100 - 30 = 70
  assert.equal(ledger.getBalance(userB, 'PTS'), 70.0);
  // Charlie won 84: start 100 - 40 + 84 = 144
  assert.equal(ledger.getBalance(userC, 'PTS'), 144.0);
  // David won 47.5: start 100 - 25 + 47.5 = 122.5
  assert.equal(ledger.getBalance(userD, 'PTS'), 122.5);

  assert.equal(ledger.verifyLedgerConservation(), true);
  console.log(`  ✓ Alice (Home) won: Balance = ${ledger.getBalance(userA, 'PTS')} PTS`);
  console.log(`  ✓ Bob (Draw) lost: Balance = ${ledger.getBalance(userB, 'PTS')} PTS`);
  console.log(`  ✓ Charlie (Over 2.5) won: Balance = ${ledger.getBalance(userC, 'PTS')} PTS`);
  console.log(`  ✓ David (BTTS) won: Balance = ${ledger.getBalance(userD, 'PTS')} PTS`);
  console.log('  ✅ Stage 2 Passed: Initial settlement executed with full ledger conservation.');

  // --------------------------------------------------------------------------
  // Stage 3: Result Correction & Reversals (VAR Overturn: Arsenal 1 - Chelsea 1)
  // --------------------------------------------------------------------------
  console.log('\n[Stage 3] Applying Post-Match Result Revision: VAR Overturns 2nd Goal (Score: 1 - 1)...');
  const revisedResult: FinalMatchResult = {
    fixtureId,
    homeScore: 1,
    awayScore: 1,
    status: 'FINISHED',
    source: 'canonical-feed-var-tribunal',
  };

  const reversalReport = await settlementService.reviseFixtureResult(
    revisedResult,
    'POST_MATCH_VAR_OFFSIDE_OVERTURN'
  );

  assert.equal(reversalReport.priorRevision, 1);
  assert.equal(reversalReport.newRevision, 2);
  assert.equal(reversalReport.reversedTickets.length, 2); // Alice (Home) & Charlie (Over 2.5)
  assert.equal(reversalReport.newlySettledTickets.length, 1); // Bob (Draw)

  // Verify updated ticket statuses
  assert.equal(settlementService.getTicket('t-001')!.status, 'SETTLED_LOST', 'Alice ticket must be reversed to LOST');
  assert.equal(settlementService.getTicket('t-002')!.status, 'SETTLED_WON', 'Bob ticket must be revised to WON');
  assert.equal(settlementService.getTicket('t-003')!.status, 'SETTLED_LOST', 'Charlie ticket must be reversed to LOST (2 goals < 2.5)');
  assert.equal(settlementService.getTicket('t-004')!.status, 'SETTLED_WON', 'David ticket remains WON (1-1 is still BTTS)');

  // Alice: 140 - 90 = 50 PTS (net lost 50 stake)
  assert.equal(ledger.getBalance(userA, 'PTS'), 50.0);
  // Bob: 70 + 105 = 175 PTS (net won 105 - 30 = +75)
  assert.equal(ledger.getBalance(userB, 'PTS'), 175.0);
  // Charlie: 144 - 84 = 60 PTS (net lost 40 stake)
  assert.equal(ledger.getBalance(userC, 'PTS'), 60.0);
  // David: remains 122.5 PTS
  assert.equal(ledger.getBalance(userD, 'PTS'), 122.5);

  const isConserved = ledger.verifyLedgerConservation();
  assert.equal(isConserved, true, 'Ledger equation must strictly hold across reversals');

  console.log(`  ✓ Reversal Report: ${reversalReport.reversedTickets.length} reversed, ${reversalReport.newlySettledTickets.length} newly settled`);
  console.log(`  ✓ Alice balance debited: ${ledger.getBalance(userA, 'PTS')} PTS`);
  console.log(`  ✓ Bob balance credited: ${ledger.getBalance(userB, 'PTS')} PTS`);
  console.log(`  ✓ Ledger mathematical conservation: ${isConserved}`);
  console.log('  ✅ Stage 3 Passed: Post-match VAR result correction and journal reversals verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Authoritative Settlement & Reversal Tests PASSED!    ');
  console.log('===============================================================\n');
}

runSettlementAndReversalTests().catch((err) => {
  console.error('\n❌ Settlement & Reversal Test Suite Failed:', err);
  process.exit(1);
});
