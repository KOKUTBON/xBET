import { DatabaseClient } from '../../../database/src/client.ts';
import type { IPaymentRepository } from '../interfaces.ts';
import type { DepositTransaction } from '../../payments/deposit-manager.ts';

export class PaymentPrismaRepository implements IPaymentRepository {
  public async saveDeposit(deposit: DepositTransaction): Promise<void> {
    try {
      const prisma = await DatabaseClient.getClient();
      // Record transaction into PostgreSQL ledger
      await prisma.journalEntry.create({
        data: {
          transactionType: 'DEPOSIT',
          referenceId: deposit.id,
          referenceType: deposit.method,
          description: `Deposit ${deposit.id} via ${deposit.method} ($${deposit.amount})`,
          createdAt: deposit.createdAt,
        },
      });
    } catch (err) {
      console.warn('[PaymentPrismaRepository] Failed to save deposit to DB:', err);
    }
  }

  public async findDepositById(id: string): Promise<DepositTransaction | undefined> {
    return undefined;
  }

  public async findDepositsByUserId(userId: string): Promise<DepositTransaction[]> {
    return [];
  }
}
