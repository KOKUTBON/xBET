import { randomUUID } from 'crypto';
import { PaymentMethod, PaymentGatewayRegistry } from './payment-gateway.ts';
import { BonusCodeRegistry } from '../bonus/bonus-codes.ts';
import { RolloverTracker } from '../bonus/rollover-tracker.ts';

export interface DepositRecord {
  id: string;
  transactionRef: string;
  userId: string;
  method: PaymentMethod;
  amount: number;
  currencyCode: string;
  bonusCode?: string | null;
  bonusAmount: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: Date;
  completedAt: Date | null;
}

export class DepositManager {
  private static instance: DepositManager;
  private deposits: Map<string, DepositRecord> = new Map();
  private refIndex: Map<string, string> = new Map(); // transactionRef -> id
  private rolloverTracker: RolloverTracker;

  private constructor() {
    this.rolloverTracker = RolloverTracker.getInstance();
  }

  public static getInstance(): DepositManager {
    if (!DepositManager.instance) {
      DepositManager.instance = new DepositManager();
    }
    return DepositManager.instance;
  }

  public createDeposit(params: {
    userId: string;
    method: PaymentMethod;
    amount: number;
    currencyCode?: string;
    bonusCode?: string;
  }): DepositRecord {
    const gateway = PaymentGatewayRegistry.getGateway(params.method);
    if (!gateway) throw new Error(`INVALID_PAYMENT_METHOD: Method ${params.method} not supported`);

    if (params.amount < gateway.minDeposit) {
      throw new Error(`DEPOSIT_TOO_LOW: Minimum deposit for ${gateway.name} is $${gateway.minDeposit.toFixed(2)}`);
    }
    if (params.amount > gateway.maxDeposit) {
      throw new Error(`DEPOSIT_TOO_HIGH: Maximum deposit for ${gateway.name} is $${gateway.maxDeposit.toFixed(2)}`);
    }

    const id = randomUUID();
    const transactionRef = `DEP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    let bonusAmount = 0;
    if (params.bonusCode) {
      const bonusCalc = BonusCodeRegistry.calculateBonus(params.bonusCode, params.amount);
      if (bonusCalc) {
        bonusAmount = bonusCalc.bonusAmount;
      }
    }

    const deposit: DepositRecord = {
      id,
      transactionRef,
      userId: params.userId,
      method: params.method,
      amount: params.amount,
      currencyCode: params.currencyCode || 'USD',
      bonusCode: params.bonusCode || null,
      bonusAmount,
      status: gateway.isInstant ? 'COMPLETED' : 'PENDING',
      createdAt: new Date(),
      completedAt: gateway.isInstant ? new Date() : null,
    };

    if (gateway.isInstant && bonusAmount > 0 && params.bonusCode) {
      const bonusCalc = BonusCodeRegistry.calculateBonus(params.bonusCode, params.amount);
      if (bonusCalc) {
        this.rolloverTracker.grantBonus(params.userId, bonusAmount, bonusCalc.config);
      }
    }

    this.deposits.set(id, deposit);
    this.refIndex.set(transactionRef, id);

    console.log(`[DepositManager] Deposit ${transactionRef} created for User ${params.userId}: $${params.amount} via ${params.method} (Bonus: $${bonusAmount})`);
    return deposit;
  }

  public getDepositById(id: string): DepositRecord | undefined {
    return this.deposits.get(id);
  }

  public getDepositByRef(ref: string): DepositRecord | undefined {
    const id = this.refIndex.get(ref);
    if (id) return this.deposits.get(id);
    return Array.from(this.deposits.values()).find((d) => d.transactionRef === ref || d.id === ref);
  }

  public completeDeposit(ref: string, externalId?: string): DepositRecord {
    const deposit = this.getDepositByRef(ref);
    if (!deposit) throw new Error(`Deposit reference ${ref} not found`);

    if (deposit.status === 'COMPLETED') {
      return deposit; // Idempotent
    }

    deposit.status = 'COMPLETED';
    deposit.completedAt = new Date();

    if (deposit.bonusAmount > 0 && deposit.bonusCode) {
      const bonusCalc = BonusCodeRegistry.calculateBonus(deposit.bonusCode, deposit.amount);
      if (bonusCalc) {
        this.rolloverTracker.grantBonus(deposit.userId, deposit.bonusAmount, bonusCalc.config);
      }
    }

    console.log(`[DepositManager] Deposit ${deposit.transactionRef} marked COMPLETED (ExtId: ${externalId || 'N/A'})`);
    return deposit;
  }

  public failDeposit(ref: string, reason?: string): DepositRecord {
    const deposit = this.getDepositByRef(ref);
    if (!deposit) throw new Error(`Deposit reference ${ref} not found`);

    deposit.status = 'FAILED';
    console.log(`[DepositManager] Deposit ${deposit.transactionRef} marked FAILED: ${reason || 'Unknown error'}`);
    return deposit;
  }

  public getAllDeposits(): DepositRecord[] {
    return Array.from(this.deposits.values());
  }
}
