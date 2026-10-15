import type { JournalEntry, LedgerTransaction, AccountType, TransactionType, Direction } from '../wallet/ledger-service.ts';
import type { BetSlipRecord, BetSlipStatus } from '../betting/bet-placement.ts';

export interface LedgerAccountRecord {
  id: string;
  userId?: string | null;
  accountType: AccountType;
  currencyCode: string;
  balance: number;
}

export interface JournalEntryParams {
  transactionType: TransactionType;
  referenceId: string;
  referenceType: string;
  description: string;
  legs: Array<{ accountId: string; direction: Direction; amount: number; currencyCode: string }>;
}

export interface ILedgerRepository {
  getAccount(accountId: string): Promise<LedgerAccountRecord | undefined>;
  setAccount(accountId: string, account: LedgerAccountRecord): Promise<void>;
  getUserAccountId(userId: string, currencyCode: string): Promise<string | undefined>;
  setUserAccountId(userId: string, currencyCode: string, accountId: string): Promise<void>;
  updateBalance(accountId: string, delta: number): Promise<void>;
  addJournalEntry(entry: JournalEntry): Promise<void>;
  getJournal(): Promise<JournalEntry[]>;
}

export interface IBetSlipRepository {
  save(slip: BetSlipRecord): Promise<void>;
  findById(id: string): Promise<BetSlipRecord | undefined>;
  findByUserId(userId: string): Promise<BetSlipRecord[]>;
  findAll(): Promise<BetSlipRecord[]>;
  findByStatus(status: BetSlipStatus): Promise<BetSlipRecord[]>;
  addUserTicket(userId: string, slipId: string): Promise<void>;
}

export interface RiskProfile {
  minStake: number;
  maxStake: number;
  maxPotentialPayout: number;
  maxSelectionLiability: number;
}

export interface IRiskRepository {
  getLiability(selectionId: string): Promise<number>;
  setLiability(selectionId: string, amount: number): Promise<void>;
  getDefaultProfile(): Promise<RiskProfile>;
}
