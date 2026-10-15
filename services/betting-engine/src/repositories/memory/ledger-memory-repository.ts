import type { ILedgerRepository, LedgerAccountRecord } from '../interfaces.ts';
import type { JournalEntry } from '../../wallet/ledger-service.ts';

/**
 * In-memory implementation of ILedgerRepository.
 * All methods return already-resolved Promises for async interface compatibility,
 * but also expose synchronous accessors for backward-compatible synchronous callers.
 */
export class LedgerMemoryRepository implements ILedgerRepository {
  private accounts: Map<string, LedgerAccountRecord> = new Map();
  private userAccountMap: Map<string, string> = new Map();
  private journal: JournalEntry[] = [];

  public snapshot(): { accounts: Map<string, LedgerAccountRecord>; userAccountMap: Map<string, string>; journal: JournalEntry[] } {
    return {
      accounts: new Map(Array.from(this.accounts, ([id, account]) => [id, { ...account }])),
      userAccountMap: new Map(this.userAccountMap),
      journal: [...this.journal],
    };
  }

  public restore(snapshot: ReturnType<LedgerMemoryRepository['snapshot']>): void {
    this.accounts = snapshot.accounts;
    this.userAccountMap = snapshot.userAccountMap;
    this.journal = snapshot.journal;
  }

  // ---- Async interface (ILedgerRepository) ----

  public async getAccount(accountId: string): Promise<LedgerAccountRecord | undefined> {
    return this.accounts.get(accountId);
  }

  public async setAccount(accountId: string, account: LedgerAccountRecord): Promise<void> {
    this.accounts.set(accountId, account);
  }

  public async getUserAccountId(userId: string, currencyCode: string): Promise<string | undefined> {
    return this.userAccountMap.get(`${userId}:${currencyCode}`);
  }

  public async setUserAccountId(userId: string, currencyCode: string, accountId: string): Promise<void> {
    this.userAccountMap.set(`${userId}:${currencyCode}`, accountId);
  }

  public async updateBalance(accountId: string, delta: number): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }
    account.balance += delta;
    this.accounts.set(accountId, account);
  }

  public async addJournalEntry(entry: JournalEntry): Promise<void> {
    this.journal.push(entry);
  }

  public async getJournal(): Promise<JournalEntry[]> {
    return [...this.journal];
  }

  // ---- Synchronous accessors (for backward-compatible callers) ----

  public getAccountSync(accountId: string): LedgerAccountRecord | undefined {
    return this.accounts.get(accountId);
  }

  public setAccountSync(accountId: string, account: LedgerAccountRecord): void {
    this.accounts.set(accountId, account);
  }

  public getUserAccountIdSync(userId: string, currencyCode: string): string | undefined {
    return this.userAccountMap.get(`${userId}:${currencyCode}`);
  }

  public setUserAccountIdSync(userId: string, currencyCode: string, accountId: string): void {
    this.userAccountMap.set(`${userId}:${currencyCode}`, accountId);
  }

  public updateBalanceSync(accountId: string, delta: number): void {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }
    account.balance += delta;
    this.accounts.set(accountId, account);
  }

  public addJournalEntrySync(entry: JournalEntry): void {
    this.journal.push(entry);
  }

  public getJournalSync(): JournalEntry[] {
    return [...this.journal];
  }
}
