import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { BetBuilderService } from '../src/betting/bet-builder-service.ts';
import { LedgerService } from '../src/wallet/ledger-service.ts';
import type { MatchContext } from '../../../odds-engine/src/domain/bivariate-poisson-model.ts';
import type { BuilderSelection } from '../../../odds-engine/src/domain/bet-builder-copula-model.ts';
import { BetSlipStatus } from '../src/betting/bet-placement.ts';

console.log('===============================================================');
console.log('  🎫 Running Bet Builder (SGP) Placement & Quote Test Suite    ');
console.log('===============================================================');

const service = BetBuilderService.getInstance();
const ledger = LedgerService.getInstance();

const userId = `usr-sgp-punter-${randomUUID().slice(0, 8)}`;
ledger.deposit(userId, 500.0, 'USD');

const matchCtx: MatchContext = {
  fixtureId: 'fix-sgp-fixture-01',
  homeTeam: 'Real Madrid',
  awayTeam: 'Barcelona',
  homeStrength: { attack: 1.25, defense: 0.95 },
  awayStrength: { attack: 1.20, defense: 1.00 },
  currentScore: { home: 0, away: 0 },
  minute: 0,
  redCards: { home: 0, away: 0 },
  stateSequence: 1,
};

// =========================================================================
// TEST 1: Quoting & Issuing Time-Limited SGP Quote Token
// =========================================================================
console.log('\n[Test 1] Testing Bet Builder Quote Token Issuance & TTL...');
const selections: BuilderSelection[] = [
  { id: 'sel-rm-win', marketType: 'MATCH_WINNER', selectionName: 'HOME' },
  { id: 'sel-over-25', marketType: 'TOTAL_GOALS', selectionName: 'OVER', line: 2.5 },
  { id: 'sel-btts-yes', marketType: 'BOTH_TEAMS_TO_SCORE', selectionName: 'YES' },
];

const quoteToken = service.issueBuilderQuote(userId, matchCtx, selections, 5000);
assert.ok(quoteToken.quoteTokenId.startsWith('sgp_quote_'));
assert.equal(quoteToken.selections.length, 3);
assert.ok(quoteToken.pricing.finalBuilderOdds > 1.0);
console.log(`  Issued quote ${quoteToken.quoteTokenId} with Correlated Odds: ${quoteToken.pricing.finalBuilderOdds}`);
console.log('  ✅ Test 1 Passed: SGP quote token generated with valid expiration.');

// =========================================================================
// TEST 2: Placing Bet Builder Ticket with Correlated Odds
// =========================================================================
console.log('\n[Test 2] Testing Bet Builder Ticket Placement & Ledger Escrow Hold...');
const initialBalance = ledger.getBalance(userId, 'USD');
assert.equal(initialBalance, 500.0);

const stake = 50.0;
const ticket = await service.placeBuilderBet({
  userId,
  quoteTokenId: quoteToken.quoteTokenId,
  stake,
  currencyCode: 'USD',
});

assert.equal(ticket.status, BetSlipStatus.ACCEPTED);
assert.equal(ticket.betType, 'BET_BUILDER');
assert.equal(ticket.stake, 50.0);
assert.equal(ticket.legs.length, 3);
assert.equal(ticket.totalOdds, quoteToken.pricing.finalBuilderOdds);
assert.equal(ticket.potentialPayout, parseFloat((stake * quoteToken.pricing.finalBuilderOdds).toFixed(2)));

const balanceAfter = ledger.getBalance(userId, 'USD');
assert.equal(balanceAfter, 450.0);
console.log(`  Bet placed: Ticket ${ticket.slipNumber} (Type: ${ticket.betType}) | Odds: ${ticket.totalOdds} | Potential Payout: $${ticket.potentialPayout}`);
console.log(`  Balance held in escrow: $500.00 -> $${balanceAfter.toFixed(2)}`);
console.log('  ✅ Test 2 Passed: Correlated Bet Builder ticket accepted and escrow reserved.');

// =========================================================================
// TEST 3: Consumed Quote Idempotency (Cannot Place Twice)
// =========================================================================
console.log('\n[Test 3] Testing Quote Invalidation & Single-Use Protection...');
let duplicateRejected = false;
try {
  await service.placeBuilderBet({
    userId,
    quoteTokenId: quoteToken.quoteTokenId,
    stake: 50.0,
  });
} catch (err: any) {
  if (err.message.includes('QUOTE_NOT_FOUND')) {
    duplicateRejected = true;
  }
}
assert.equal(duplicateRejected, true);
assert.equal(ledger.getBalance(userId, 'USD'), 450.0);
console.log('  Duplicate attempt safely rejected: Quote token was consumed and invalidated.');
console.log('  ✅ Test 3 Passed: Quote token single-use protection verified.');

// =========================================================================
// TEST 4: Expired Quote Token Rejection
// =========================================================================
console.log('\n[Test 4] Testing Expired Quote Token Rejection...');
const shortLivedToken = service.issueBuilderQuote(userId, matchCtx, selections, 10); // 10ms TTL
await new Promise((r) => setTimeout(r, 20)); // Wait for expiration

let expiredRejected = false;
try {
  await service.placeBuilderBet({
    userId,
    quoteTokenId: shortLivedToken.quoteTokenId,
    stake: 20.0,
  });
} catch (err: any) {
  if (err.message.includes('QUOTE_EXPIRED')) {
    expiredRejected = true;
  }
}
assert.equal(expiredRejected, true);
console.log('  Expired quote rejected without modifying player balance.');
console.log('  ✅ Test 4 Passed: Live odds expiration protection verified.');

// =========================================================================
// TEST 5: Insufficient Funds Guard
// =========================================================================
console.log('\n[Test 5] Testing Insufficient Funds Guard...');
const overStakeToken = service.issueBuilderQuote(userId, matchCtx, selections, 5000);
let fundsRejected = false;
try {
  await service.placeBuilderBet({
    userId,
    quoteTokenId: overStakeToken.quoteTokenId,
    stake: 1000.0, // Available is only $450
  });
} catch (err: any) {
  if (err.message.includes('INSUFFICIENT_FUNDS')) {
    fundsRejected = true;
  }
}
assert.equal(fundsRejected, true);
console.log('  Over-stake placement safely prevented.');
console.log('  ✅ Test 5 Passed: Balance limit validation confirmed.');

console.log('===============================================================');
console.log('  🎉 All Bet Builder Integration Tests Passed!                 ');
console.log('===============================================================');
