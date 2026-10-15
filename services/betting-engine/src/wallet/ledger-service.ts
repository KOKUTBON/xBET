import { randomUUID } from 'crypto';
import type { ILedgerRepository, LedgerAccountRecord, JournalEntryParams } from '../repositories/interfaces.ts';
import { LedgerMemoryRepository } from '../repositories/memory/ledger-memory-repository.ts';

export const AccountType = {
  PLAYER_MAIN: 'PLAYER_MAIN',
  PLAYER_BONUS: 'PLAYER_BONUS',
  HOUSE_MARGIN: 'HOUSE_MARGIN',
  HOUSE_ESCROW: 'HOUSE_ESCROW',
  PAYMENT_CLEARING: 'PAYMENT_CLEARING',
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const TransactionType = {
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  BET_STAKE: 'BET_STAKE',
  BET_PAYOUT: 'BET_PAYOUT',
  BET_REFUND: 'BET_REFUND',
  BET_CASHOUT: 'BET_CASHOUT',
  CASINO_WAGER: 'CASINO_WAGER',
  CASINO_PAYOUT: 'CASINO_PAYOUT',
} as const;
export type TransactionType = (typeof TransactionType)[keyof typeof TransactionType];

export const Direction = {
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT',
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export interface LedgerTransaction {
  id: string;
  journalEntryId: string;
  accountId: string;
  direction: Direction;
  amount: number;
  currencyCode: string;
  createdAt: Date;
}

export interface JournalEntry {
  id: string;
  entryNumber: number;
  transactionType: TransactionType;
  referenceId: string;
  referenceType: string;
  description: string;
  createdAt: Date;
  transactions: LedgerTransaction[];
}

export class LedgerService {
  private static instance: LedgerService;
  private repo: ILedgerRepository;
  private memRepo: LedgerMemoryRepository | null; // Direct sync access when using in-memory
  private entryCounter: number = 0;

  // System Account Constants
  public readonly HOUSE_ESCROW_ID = '00000000-0000-0000-0000-000000000003';
  public readonly HOUSE_MARGIN_ID = '00000000-0000-0000-0000-000000000001';
  public readonly PAYMENT_CLEARING_ID = '00000000-0000-0000-0000-000000000005';

  private constructor(repo?: ILedgerRepository) {
    if (repo && !(repo instanceof LedgerMemoryRepository)) {
      this.repo = repo;
      this.memRepo = null;
    } else {
      const memoryRepo = (repo as LedgerMemoryRepository) || new LedgerMemoryRepository();
      this.repo = memoryRepo;
      this.memRepo = memoryRepo;
    }
    this.initializeSystemAccounts();
  }

  public static getInstance(repo?: ILedgerRepository): LedgerService {
    if (!LedgerService.instance) {
      LedgerService.instance = new LedgerService(repo);
    }
    return LedgerService.instance;
  }

  /** Reset singleton — used for testing with different repositories */
  public static resetInstance(): void {
    LedgerService.instance = undefined as any;
  }

  public snapshotPlacementState(): { repository: ReturnType<LedgerMemoryRepository['snapshot']>; entryCounter: number } {
    if (!this.memRepo) throw new Error('ATOMIC_PLACEMENT_UNAVAILABLE');
    return { repository: this.memRepo.snapshot(), entryCounter: this.entryCounter };
  }

  public restorePlacementState(snapshot: ReturnType<LedgerService['snapshotPlacementState']>): void {
    if (!this.memRepo) throw new Error('ATOMIC_PLACEMENT_UNAVAILABLE');
    this.memRepo.restore(snapshot.repository);
    this.entryCounter = snapshot.entryCounter;
  }

  private initializeSystemAccounts(): void {
    const accounts: Array<{ id: string; type: AccountType; balance: number }> = [
      { id: this.HOUSE_MARGIN_ID, type: AccountType.HOUSE_MARGIN, balance: 1000000.0 },
      { id: this.HOUSE_ESCROW_ID, type: AccountType.HOUSE_ESCROW, balance: 0.0 },
      { id: this.PAYMENT_CLEARING_ID, type: AccountType.PAYMENT_CLEARING, balance: 0.0 },
    ];

    for (const acct of accounts) {
      const record: LedgerAccountRecord = {
        id: acct.id,
        accountType: acct.type,
        currencyCode: 'USD',
        balance: acct.balance,
      };
      if (this.memRepo) {
        this.memRepo.setAccountSync(acct.id, record);
      } else {
        this.repo.setAccount(acct.id, record);
      }
    }
  }

  public getOrCreateUserAccount(userId: string, currencyCode: string = 'USD'): string {
    if (!this.memRepo) {
      throw new Error('Synchronous access not supported with non-memory repository. Use getOrCreateUserAccountAsync().');
    }

    const existing = this.memRepo.getUserAccountIdSync(userId, currencyCode);
    if (existing) return existing;

    const accountId = randomUUID();
    this.memRepo.setAccountSync(accountId, {
      id: accountId,
      userId,
      accountType: AccountType.PLAYER_MAIN,
      currencyCode,
      balance: 0.0,
    });
    this.memRepo.setUserAccountIdSync(userId, currencyCode, accountId);
    return accountId;
  }

  public getBalance(userId: string, currencyCode: string = 'USD'): number {
    if (!this.memRepo) {
      throw new Error('Synchronous access not supported with non-memory repository. Use getBalanceAsync().');
    }
    const accountId = this.getOrCreateUserAccount(userId, currencyCode);
    const account = this.memRepo.getAccountSync(accountId);
    return account ? account.balance : 0.0;
  }

  /**
   * Deposit: Debit Payment Clearing, Credit Player Main Account
   */
  public deposit(userId: string, amount: number, currencyCode: string = 'USD', referenceId: string = randomUUID()): JournalEntry {
    if (amount <= 0) throw new Error('Deposit amount must be greater than 0');

    const userAccountId = this.getOrCreateUserAccount(userId, currencyCode);

    if (this.memRepo) {
      this.memRepo.updateBalanceSync(userAccountId, amount);
      this.memRepo.updateBalanceSync(this.PAYMENT_CLEARING_ID, -amount);
    } else {
      this.repo.updateBalance(userAccountId, amount);
      this.repo.updateBalance(this.PAYMENT_CLEARING_ID, -amount);
    }

    return this.createJournalEntry({
      transactionType: TransactionType.DEPOSIT,
      referenceId,
      referenceType: 'PAYMENT_GATEWAY',
      description: `Deposit of ${amount} ${currencyCode}`,
      legs: [
        { accountId: this.PAYMENT_CLEARING_ID, direction: Direction.DEBIT, amount, currencyCode },
        { accountId: userAccountId, direction: Direction.CREDIT, amount, currencyCode },
      ],
    });
  }

  /**
   * Admin Points Adjustment (education mode).
   * Grants (positive) or revokes (negative) points for a player. Revoking is capped at the
   * player's available balance so points never go negative. Balanced against HOUSE_MARGIN.
   */
  public adminAdjustPoints(
    userId: string,
    delta: number,
    reason: string = 'Admin adjustment',
    currencyCode: string = 'PTS'
  ): { journalEntry: JournalEntry; newBalance: number } {
    if (!Number.isFinite(delta) || delta === 0) {
      throw new Error('Adjustment amount must be a non-zero number');
    }

    const userAccountId = this.getOrCreateUserAccount(userId, currencyCode);
    const balance = this.getBalance(userId, currencyCode);

    // Clamp a debit so the player can't be pushed below zero.
    let applied = delta;
    if (delta < 0 && Math.abs(delta) > balance) {
      applied = -balance;
    }

    if (this.memRepo) {
      this.memRepo.updateBalanceSync(userAccountId, applied);
      this.memRepo.updateBalanceSync(this.HOUSE_MARGIN_ID, -applied);
    } else {
      this.repo.updateBalance(userAccountId, applied);
      this.repo.updateBalance(this.HOUSE_MARGIN_ID, -applied);
    }

    const journalEntry = this.createJournalEntry({
      transactionType: applied >= 0 ? TransactionType.DEPOSIT : TransactionType.WITHDRAWAL,
      referenceId: randomUUID(),
      referenceType: 'ADMIN_ADJUSTMENT',
      description: `${applied >= 0 ? 'Granted' : 'Revoked'} ${Math.abs(applied)} ${currencyCode} — ${reason}`,
      legs:
        applied >= 0
          ? [
              { accountId: this.HOUSE_MARGIN_ID, direction: Direction.DEBIT, amount: applied, currencyCode },
              { accountId: userAccountId, direction: Direction.CREDIT, amount: applied, currencyCode },
            ]
          : [
              { accountId: userAccountId, direction: Direction.DEBIT, amount: -applied, currencyCode },
              { accountId: this.HOUSE_MARGIN_ID, direction: Direction.CREDIT, amount: -applied, currencyCode },
            ],
    });

    return { journalEntry, newBalance: this.getBalance(userId, currencyCode) };
  }

  /**
   * Hold Bet Stake: Debit Player Main Account, Credit House Escrow
   */
  public holdBetStake(userId: string, betSlipId: string, stake: number, currencyCode: string = 'USD'): JournalEntry {
    if (stake <= 0) throw new Error('Stake must be greater than 0');

    const userAccountId = this.getOrCreateUserAccount(userId, currencyCode);
    const balance = this.getBalance(userId, currencyCode);

    if (balance < stake) {
      throw new Error(`INSUFFICIENT_FUNDS: Available ${balance.toFixed(2)}, required ${stake.toFixed(2)}`);
    }

    if (this.memRepo) {
      this.memRepo.updateBalanceSync(userAccountId, -stake);
      this.memRepo.updateBalanceSync(this.HOUSE_ESCROW_ID, stake);
    } else {
      this.repo.updateBalance(userAccountId, -stake);
      this.repo.updateBalance(this.HOUSE_ESCROW_ID, stake);
    }

    return this.createJournalEntry({
      transactionType: TransactionType.BET_STAKE,
      referenceId: betSlipId,
      referenceType: 'BET_SLIP',
      description: `Hold stake of ${stake} ${currencyCode} for Bet ${betSlipId}`,
      legs: [
        { accountId: userAccountId, direction: Direction.DEBIT, amount: stake, currencyCode },
        { accountId: this.HOUSE_ESCROW_ID, direction: Direction.CREDIT, amount: stake, currencyCode },
      ],
    });
  }

  /**
   * Hold Withdrawal: Debit Player Main Account, Credit House Escrow
   */
  public holdWithdrawal(userId: string, withdrawalId: string, amount: number, currencyCode: string = 'USD'): JournalEntry {
    if (amount <= 0) throw new Error('Withdrawal amount must be greater than 0');

    const userAccountId = this.getOrCreateUserAccount(userId, currencyCode);
    const balance = this.getBalance(userId, currencyCode);

    if (balance < amount) {
      throw new Error(`INSUFFICIENT_FUNDS: Available ${balance.toFixed(2)}, required ${amount.toFixed(2)}`);
    }

    if (this.memRepo) {
      this.memRepo.updateBalanceSync(userAccountId, -amount);
      this.memRepo.updateBalanceSync(this.HOUSE_ESCROW_ID, amount);
    } else {
      this.repo.updateBalance(userAccountId, -amount);
      this.repo.updateBalance(this.HOUSE_ESCROW_ID, amount);
    }

    return this.createJournalEntry({
      transactionType: TransactionType.WITHDRAWAL,
      referenceId: withdrawalId,
      referenceType: 'WITHDRAWAL_HOLD',
      description: `Hold withdrawal of ${amount} ${currencyCode} for ${withdrawalId}`,
      legs: [
        { accountId: userAccountId, direction: Direction.DEBIT, amount, currencyCode },
        { accountId: this.HOUSE_ESCROW_ID, direction: Direction.CREDIT, amount, currencyCode },
      ],
    });
  }

  /**
   * Settle Withdrawal: Debit House Escrow, Credit Payment Clearing
   */
  public settleWithdrawal(userId: string, withdrawalId: string, amount: number, currencyCode: string = 'USD'): JournalEntry {
    if (this.memRepo) {
      this.memRepo.updateBalanceSync(this.HOUSE_ESCROW_ID, -amount);
      this.memRepo.updateBalanceSync(this.PAYMENT_CLEARING_ID, amount);
    } else {
      this.repo.updateBalance(this.HOUSE_ESCROW_ID, -amount);
      this.repo.updateBalance(this.PAYMENT_CLEARING_ID, amount);
    }

    return this.createJournalEntry({
      transactionType: TransactionType.WITHDRAWAL,
      referenceId: withdrawalId,
      referenceType: 'WITHDRAWAL_SETTLED',
      description: `Settled withdrawal of ${amount} ${currencyCode} for ${withdrawalId}`,
      legs: [
        { accountId: this.HOUSE_ESCROW_ID, direction: Direction.DEBIT, amount, currencyCode },
        { accountId: this.PAYMENT_CLEARING_ID, direction: Direction.CREDIT, amount, currencyCode },
      ],
    });
  }

  /**
   * Cancel/Reject Withdrawal: Debit House Escrow, Credit Player Main Account (Refund)
   */
  public cancelWithdrawal(userId: string, withdrawalId: string, amount: number, currencyCode: string = 'USD'): JournalEntry {
    const userAccountId = this.getOrCreateUserAccount(userId, currencyCode);

    if (this.memRepo) {
      this.memRepo.updateBalanceSync(this.HOUSE_ESCROW_ID, -amount);
      this.memRepo.updateBalanceSync(userAccountId, amount);
    } else {
      this.repo.updateBalance(this.HOUSE_ESCROW_ID, -amount);
      this.repo.updateBalance(userAccountId, amount);
    }

    return this.createJournalEntry({
      transactionType: TransactionType.WITHDRAWAL,
      referenceId: withdrawalId,
      referenceType: 'WITHDRAWAL_CANCELLED',
      description: `Refunded held withdrawal of ${amount} ${currencyCode} for ${withdrawalId}`,
      legs: [
        { accountId: this.HOUSE_ESCROW_ID, direction: Direction.DEBIT, amount, currencyCode },
        { accountId: userAccountId, direction: Direction.CREDIT, amount, currencyCode },
      ],
    });
  }

  /**
   * Settle Winning Bet
   */
  public settleWinningBet(userId: string, betSlipId: string, stake: number, payout: number, currencyCode: string = 'USD'): JournalEntry {
    const userAccountId = this.getOrCreateUserAccount(userId, currencyCode);
    const profit = parseFloat((payout - stake).toFixed(2));

    const legs: Array<{ accountId: string; direction: Direction; amount: number; currencyCode: string }> = [
      { accountId: this.HOUSE_ESCROW_ID, direction: Direction.DEBIT, amount: stake, currencyCode },
    ];

    if (profit > 0) {
      if (this.memRepo) {
        this.memRepo.updateBalanceSync(this.HOUSE_ESCROW_ID, -stake);
        this.memRepo.updateBalanceSync(this.HOUSE_MARGIN_ID, -profit);
        this.memRepo.updateBalanceSync(userAccountId, payout);
      } else {
        this.repo.updateBalance(this.HOUSE_ESCROW_ID, -stake);
        this.repo.updateBalance(this.HOUSE_MARGIN_ID, -profit);
        this.repo.updateBalance(userAccountId, payout);
      }
      legs.push({ accountId: this.HOUSE_MARGIN_ID, direction: Direction.DEBIT, amount: profit, currencyCode });
      legs.push({ accountId: userAccountId, direction: Direction.CREDIT, amount: payout, currencyCode });
    } else if (profit < 0) {
      const houseRetained = Math.abs(profit);
      if (this.memRepo) {
        this.memRepo.updateBalanceSync(this.HOUSE_ESCROW_ID, -stake);
        this.memRepo.updateBalanceSync(this.HOUSE_MARGIN_ID, houseRetained);
        this.memRepo.updateBalanceSync(userAccountId, payout);
      } else {
        this.repo.updateBalance(this.HOUSE_ESCROW_ID, -stake);
        this.repo.updateBalance(this.HOUSE_MARGIN_ID, houseRetained);
        this.repo.updateBalance(userAccountId, payout);
      }
      legs.push({ accountId: userAccountId, direction: Direction.CREDIT, amount: payout, currencyCode });
      legs.push({ accountId: this.HOUSE_MARGIN_ID, direction: Direction.CREDIT, amount: houseRetained, currencyCode });
    } else {
      if (this.memRepo) {
        this.memRepo.updateBalanceSync(this.HOUSE_ESCROW_ID, -stake);
        this.memRepo.updateBalanceSync(userAccountId, payout);
      } else {
        this.repo.updateBalance(this.HOUSE_ESCROW_ID, -stake);
        this.repo.updateBalance(userAccountId, payout);
      }
      legs.push({ accountId: userAccountId, direction: Direction.CREDIT, amount: payout, currencyCode });
    }

    return this.createJournalEntry({
      transactionType: TransactionType.BET_PAYOUT,
      referenceId: betSlipId,
      referenceType: 'BET_SLIP',
      description: `Payout of ${payout.toFixed(2)} ${currencyCode} for winning Bet ${betSlipId}`,
      legs,
    });
  }

  /**
   * Settle Losing Bet
   */
  public settleLosingBet(userId: string, betSlipId: string, stake: number, currencyCode: string = 'USD'): JournalEntry {
    if (this.memRepo) {
      this.memRepo.updateBalanceSync(this.HOUSE_ESCROW_ID, -stake);
      this.memRepo.updateBalanceSync(this.HOUSE_MARGIN_ID, stake);
    } else {
      this.repo.updateBalance(this.HOUSE_ESCROW_ID, -stake);
      this.repo.updateBalance(this.HOUSE_MARGIN_ID, stake);
    }

    return this.createJournalEntry({
      transactionType: TransactionType.BET_PAYOUT,
      referenceId: betSlipId,
      referenceType: 'BET_SLIP',
      description: `Losing Bet ${betSlipId} stake ${stake} ${currencyCode} transferred to House Margin`,
      legs: [
        { accountId: this.HOUSE_ESCROW_ID, direction: Direction.DEBIT, amount: stake, currencyCode },
        { accountId: this.HOUSE_MARGIN_ID, direction: Direction.CREDIT, amount: stake, currencyCode },
      ],
    });
  }

  /**
   * Settle Void / Refund Bet
   */
  public settleVoidBet(userId: string, betSlipId: string, stake: number, currencyCode: string = 'USD'): JournalEntry {
    const userAccountId = this.getOrCreateUserAccount(userId, currencyCode);

    if (this.memRepo) {
      this.memRepo.updateBalanceSync(this.HOUSE_ESCROW_ID, -stake);
      this.memRepo.updateBalanceSync(userAccountId, stake);
    } else {
      this.repo.updateBalance(this.HOUSE_ESCROW_ID, -stake);
      this.repo.updateBalance(userAccountId, stake);
    }

    return this.createJournalEntry({
      transactionType: TransactionType.BET_REFUND,
      referenceId: betSlipId,
      referenceType: 'BET_SLIP',
      description: `Refund stake of ${stake} ${currencyCode} for cancelled/void Bet ${betSlipId}`,
      legs: [
        { accountId: this.HOUSE_ESCROW_ID, direction: Direction.DEBIT, amount: stake, currencyCode },
        { accountId: userAccountId, direction: Direction.CREDIT, amount: stake, currencyCode },
      ],
    });
  }

  /**
   * Settle Cashout
   */
  public settleCashout(userId: string, betSlipId: string, stake: number, cashoutAmount: number, currencyCode: string = 'USD'): JournalEntry {
    const userAccountId = this.getOrCreateUserAccount(userId, currencyCode);

    if (this.memRepo) {
      this.memRepo.updateBalanceSync(this.HOUSE_ESCROW_ID, -stake);
      this.memRepo.updateBalanceSync(userAccountId, cashoutAmount);
    } else {
      this.repo.updateBalance(this.HOUSE_ESCROW_ID, -stake);
      this.repo.updateBalance(userAccountId, cashoutAmount);
    }

    const legs: Array<{ accountId: string; direction: Direction; amount: number; currencyCode: string }> = [
      { accountId: this.HOUSE_ESCROW_ID, direction: Direction.DEBIT, amount: stake, currencyCode },
    ];

    if (cashoutAmount >= stake) {
      const profit = cashoutAmount - stake;
      if (profit > 0) {
        if (this.memRepo) {
          this.memRepo.updateBalanceSync(this.HOUSE_MARGIN_ID, -profit);
        } else {
          this.repo.updateBalance(this.HOUSE_MARGIN_ID, -profit);
        }
        legs.push({ accountId: this.HOUSE_MARGIN_ID, direction: Direction.DEBIT, amount: profit, currencyCode });
      }
    } else {
      const houseRetained = stake - cashoutAmount;
      if (this.memRepo) {
        this.memRepo.updateBalanceSync(this.HOUSE_MARGIN_ID, houseRetained);
      } else {
        this.repo.updateBalance(this.HOUSE_MARGIN_ID, houseRetained);
      }
      legs.push({ accountId: this.HOUSE_MARGIN_ID, direction: Direction.CREDIT, amount: houseRetained, currencyCode });
    }

    legs.push({ accountId: userAccountId, direction: Direction.CREDIT, amount: cashoutAmount, currencyCode });

    return this.createJournalEntry({
      transactionType: TransactionType.BET_CASHOUT,
      referenceId: betSlipId,
      referenceType: 'BET_SLIP',
      description: `Early Cashout of ${cashoutAmount.toFixed(2)} ${currencyCode} for Bet ${betSlipId}`,
      legs,
    });
  }

  private createJournalEntry(params: JournalEntryParams): JournalEntry {
    const entryId = randomUUID();
    this.entryCounter += 1;

    // Verify debit sum == credit sum
    const totalDebit = params.legs
      .filter((l) => l.direction === Direction.DEBIT)
      .reduce((sum, l) => sum + l.amount, 0);
    const totalCredit = params.legs
      .filter((l) => l.direction === Direction.CREDIT)
      .reduce((sum, l) => sum + l.amount, 0);

    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new Error(`LEDGER_UNBALANCED_ERROR: Debits (${totalDebit}) do not equal Credits (${totalCredit})`);
    }

    const transactions: LedgerTransaction[] = params.legs.map((leg) => ({
      id: randomUUID(),
      journalEntryId: entryId,
      accountId: leg.accountId,
      direction: leg.direction,
      amount: leg.amount,
      currencyCode: leg.currencyCode,
      createdAt: new Date(),
    }));

    const entry: JournalEntry = {
      id: entryId,
      entryNumber: this.entryCounter,
      transactionType: params.transactionType,
      referenceId: params.referenceId,
      referenceType: params.referenceType,
      description: params.description,
      createdAt: new Date(),
      transactions,
    };

    if (this.memRepo) {
      this.memRepo.addJournalEntrySync(entry);
    } else {
      this.repo.addJournalEntry(entry);
    }
    return entry;
  }

  /**
   * Verifies total ledger accounting balance across all historic entries
   */
  public verifyLedgerConservation(): boolean {
    const journal = this.memRepo ? this.memRepo.getJournalSync() : [];
    for (const entry of journal) {
      const debitSum = entry.transactions
        .filter((t) => t.direction === Direction.DEBIT)
        .reduce((sum, t) => sum + t.amount, 0);
      const creditSum = entry.transactions
        .filter((t) => t.direction === Direction.CREDIT)
        .reduce((sum, t) => sum + t.amount, 0);

      if (Math.abs(debitSum - creditSum) > 0.0001) {
        return false;
      }
    }
    return true;
  }

  public getJournal(): JournalEntry[] {
    return this.memRepo ? this.memRepo.getJournalSync() : [];
  }

  /** Returns the underlying repository */
  public getRepository(): ILedgerRepository {
    return this.repo;
  }
}
