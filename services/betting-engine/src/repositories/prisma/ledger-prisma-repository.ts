import { DatabaseClient } from '../../../../packages/database/src/client.ts';
import type { ILedgerRepository, LedgerAccountRecord } from '../interfaces.ts';
import type { JournalEntry, LedgerTransaction, AccountType, Direction, TransactionType } from '../../wallet/ledger-service.ts';

export class LedgerPrismaRepository implements ILedgerRepository {
  public async getAccount(accountId: string): Promise<LedgerAccountRecord | undefined> {
    const prisma = await DatabaseClient.getClient();
    const acct = await prisma.ledgerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acct) return undefined;

    // Calculate balance from transaction records
    const balanceAgg = await prisma.transaction.aggregate({
      where: { accountId },
      _sum: { amount: true },
    });

    const debits = await prisma.transaction.aggregate({
      where: { accountId, direction: 'DEBIT' },
      _sum: { amount: true },
    });

    const credits = await prisma.transaction.aggregate({
      where: { accountId, direction: 'CREDIT' },
      _sum: { amount: true },
    });

    const debitTotal = Number(debits._sum.amount || 0);
    const creditTotal = Number(credits._sum.amount || 0);
    const balance = creditTotal - debitTotal;

    return {
      id: acct.id,
      userId: acct.userId,
      accountType: acct.accountType as AccountType,
      currencyCode: acct.currencyCode,
      balance,
    };
  }

  public async setAccount(accountId: string, account: LedgerAccountRecord): Promise<void> {
    const prisma = await DatabaseClient.getClient();
    await prisma.ledgerAccount.upsert({
      where: { id: accountId },
      create: {
        id: accountId,
        userId: account.userId || null,
        accountType: account.accountType,
        currencyCode: account.currencyCode,
        name: `${account.accountType}_${account.userId || 'SYSTEM'}`,
      },
      update: {
        accountType: account.accountType,
        currencyCode: account.currencyCode,
      },
    });
  }

  public async getUserAccountId(userId: string, currencyCode: string): Promise<string | undefined> {
    const prisma = await DatabaseClient.getClient();
    const acct = await prisma.ledgerAccount.findFirst({
      where: {
        userId,
        currencyCode,
        accountType: 'PLAYER_MAIN',
      },
    });
    return acct?.id;
  }

  public async setUserAccountId(userId: string, currencyCode: string, accountId: string): Promise<void> {
    const prisma = await DatabaseClient.getClient();
    await prisma.ledgerAccount.upsert({
      where: { id: accountId },
      create: {
        id: accountId,
        userId,
        accountType: 'PLAYER_MAIN',
        currencyCode,
        name: `PLAYER_MAIN_${userId}`,
      },
      update: {
        userId,
        currencyCode,
      },
    });
  }

  public async updateBalance(accountId: string, delta: number): Promise<void> {
    // In PostgreSQL double-entry bookkeeping, balances are derived from transactions.
    // However, if called directly, we verify the account exists.
    const prisma = await DatabaseClient.getClient();
    const acct = await prisma.ledgerAccount.findUnique({
      where: { id: accountId },
    });
    if (!acct) {
      throw new Error(`Account not found: ${accountId}`);
    }
  }

  public async addJournalEntry(entry: JournalEntry): Promise<void> {
    const prisma = await DatabaseClient.getClient();
    await prisma.$transaction(async (tx: any) => {
      const createdEntry = await tx.journalEntry.create({
        data: {
          id: entry.id,
          transactionType: entry.transactionType,
          referenceId: entry.referenceId,
          referenceType: entry.referenceType,
          description: entry.description,
          createdAt: entry.createdAt,
        },
      });

      for (const leg of entry.transactions) {
        await tx.transaction.create({
          data: {
            id: leg.id,
            journalEntryId: createdEntry.id,
            accountId: leg.accountId,
            direction: leg.direction,
            amount: leg.amount,
            currencyCode: leg.currencyCode,
            createdAt: leg.createdAt,
          },
        });
      }
    });
  }

  public async getJournal(): Promise<JournalEntry[]> {
    const prisma = await DatabaseClient.getClient();
    const entries = await prisma.journalEntry.findMany({
      include: { transactions: true },
      orderBy: { createdAt: 'asc' },
    });

    return entries.map((e: any) => ({
      id: e.id,
      entryNumber: Number(e.entryNumber || 0),
      transactionType: e.transactionType as TransactionType,
      referenceId: e.referenceId || '',
      referenceType: e.referenceType || '',
      description: e.description || '',
      createdAt: e.createdAt,
      transactions: e.transactions.map((t: any) => ({
        id: t.id,
        journalEntryId: t.journalEntryId,
        accountId: t.accountId,
        direction: t.direction as Direction,
        amount: Number(t.amount),
        currencyCode: t.currencyCode,
        createdAt: t.createdAt,
      })),
    }));
  }
}
