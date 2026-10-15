import assert from 'node:assert/strict';
import { BetPlacementService } from '../src/betting/bet-placement.ts';
import { BetSlipType } from '../src/betting/bet-validator.ts';
import { LedgerService } from '../src/wallet/ledger-service.ts';
import { RiskManager } from '../src/risk/risk-manager.ts';
import { BetSlipMemoryRepository } from '../src/repositories/memory/betslip-memory-repository.ts';
import { LedgerMemoryRepository } from '../src/repositories/memory/ledger-memory-repository.ts';
import { RiskMemoryRepository } from '../src/repositories/memory/risk-memory-repository.ts';
import type { BetSlipRecord } from '../src/betting/bet-placement.ts';
import type { JournalEntry } from '../src/wallet/ledger-service.ts';

const request = {
  userId: 'atomicity-user',
  betType: BetSlipType.SINGLE,
  currencyCode: 'USD',
  stake: 10,
  legs: [{
    fixtureId: 'fixture', fixtureName: 'Home v Away', marketId: 'market',
    marketName: '1X2', selectionId: 'selection', selectionName: 'Home', submittedOdds: 2,
  }],
};

function setup(ledgerRepo = new LedgerMemoryRepository(), ticketRepo = new BetSlipMemoryRepository()) {
  LedgerService.resetInstance();
  RiskManager.resetInstance();
  BetPlacementService.resetInstance();
  const riskRepo = new RiskMemoryRepository();
  const ledger = LedgerService.getInstance(ledgerRepo);
  RiskManager.getInstance(riskRepo);
  const bets = BetPlacementService.getInstance(ticketRepo);
  ledger.deposit(request.userId, 100);
  return { ledger, ledgerRepo, riskRepo, bets, ticketRepo };
}

function assertNoPartialBet(state: ReturnType<typeof setup>) {
  assert.equal(state.ledger.getBalance(request.userId), 100);
  assert.equal(state.ledgerRepo.getJournalSync().length, 1);
  assert.equal(state.riskRepo.getLiabilitySync('selection'), 0);
  assert.deepEqual(state.bets.getUserTickets(request.userId), []);
  assert.equal(state.bets.getAllTickets().length, 0);
}

class FailingJournalRepository extends LedgerMemoryRepository {
  override addJournalEntrySync(entry: JournalEntry): void {
    super.addJournalEntrySync(entry);
    if (entry.referenceType === 'BET_SLIP') throw new Error('journal write failed');
  }
}

class FailingTicketRepository extends BetSlipMemoryRepository {
  override saveSync(slip: BetSlipRecord): void {
    super.saveSync(slip);
    throw new Error('ticket write failed');
  }
}

class FailingTicketIndexRepository extends BetSlipMemoryRepository {
  override addUserTicketSync(userId: string, slipId: string): void {
    super.addUserTicketSync(userId, slipId);
    throw new Error('ticket index write failed');
  }
}

for (const [name, ledgerRepo, ticketRepo] of [
  ['journal', new FailingJournalRepository(), new BetSlipMemoryRepository()],
  ['ticket', new LedgerMemoryRepository(), new FailingTicketRepository()],
  ['ticket index', new LedgerMemoryRepository(), new FailingTicketIndexRepository()],
] as const) {
  const state = setup(ledgerRepo, ticketRepo);
  assert.throws(() => state.bets.placeBet(request, () => 2), /write failed/);
  assertNoPartialBet(state);
  console.log(`Rollback verified after ${name} failure`);
}

const insufficient = setup();
insufficient.ledger.adminAdjustPoints(request.userId, -100, 'test', 'USD');
assert.throws(() => insufficient.bets.placeBet(request, () => 2), /INSUFFICIENT_FUNDS/);
assert.equal(insufficient.riskRepo.getLiabilitySync('selection'), 0);
assert.equal(insufficient.bets.getAllTickets().length, 0);

const liability = setup();
liability.riskRepo.setLiabilitySync('other-selection', 49_990);
assert.throws(() => liability.bets.placeBet({
  ...request,
  betType: BetSlipType.COMBI,
  legs: [request.legs[0], { ...request.legs[0], selectionId: 'other-selection' }],
}, () => 2), /MARKET_LIABILITY_LIMIT/);
assert.equal(liability.riskRepo.getLiabilitySync('selection'), 0);
assert.equal(liability.riskRepo.getLiabilitySync('other-selection'), 49_990);
assertNoPartialBet(liability);

const nonMemory = setup();
BetPlacementService.resetInstance();
const dbLike = BetPlacementService.getInstance({} as BetSlipMemoryRepository);
assert.throws(() => dbLike.placeBet(request, () => 2), /ATOMIC_PLACEMENT_UNAVAILABLE/);
assert.equal(nonMemory.ledger.getBalance(request.userId), 100);

console.log('Placement atomicity tests passed');
