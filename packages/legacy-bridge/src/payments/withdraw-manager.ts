import { randomUUID } from 'crypto';
import { PaymentMethod, PaymentGatewayRegistry } from './payment-gateway.ts';
import { UserManager, KycStatus } from '../users/user-manager.ts';
import { RolloverTracker } from '../bonus/rollover-tracker.ts';

export interface WithdrawRecord {
  id: string;
  transactionRef: string;
  userId: string;
  method: PaymentMethod;
  amount: number;
  currencyCode: string;
  payoutDetails: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  rejectionReason?: string;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewedBy?: string;
}

export class WithdrawManager {
  private static instance: WithdrawManager;
  private withdrawals: Map<string, WithdrawRecord> = new Map();
  private userManager: UserManager;
  private rolloverTracker: RolloverTracker;

  private constructor() {
    this.userManager = UserManager.getInstance();
    this.rolloverTracker = RolloverTracker.getInstance();
  }

  public static getInstance(): WithdrawManager {
    if (!WithdrawManager.instance) {
      WithdrawManager.instance = new WithdrawManager();
    }
    return WithdrawManager.instance;
  }

  public requestWithdrawal(params: {
    userId: string;
    method: PaymentMethod;
    amount: number;
    payoutDetails: string;
    currencyCode?: string;
  }): WithdrawRecord {
    const user = this.userManager.getUserById(params.userId);
    if (!user) throw new Error(`User ${params.userId} not found`);

    // 1. KYC verification check
    if (user.kycStatus !== KycStatus.VERIFIED) {
      throw new Error('KYC_REQUIRED: Your identity must be verified before requesting a withdrawal. Please complete KYC.');
    }

    // 2. Bonus wagering requirement check
    if (this.rolloverTracker.hasUnfinishedWagering(params.userId)) {
      throw new Error('WAGERING_UNFULFILLED: You have active bonus funds with incomplete rollover wagering requirements.');
    }

    // 3. Payment Gateway limits check
    const gateway = PaymentGatewayRegistry.getGateway(params.method);
    if (!gateway) throw new Error(`INVALID_PAYMENT_METHOD: Method ${params.method} not supported`);

    if (params.amount < gateway.minWithdraw) {
      throw new Error(`WITHDRAW_TOO_LOW: Minimum withdrawal for ${gateway.name} is $${gateway.minWithdraw.toFixed(2)}`);
    }
    if (params.amount > gateway.maxWithdraw) {
      throw new Error(`WITHDRAW_TOO_HIGH: Maximum withdrawal for ${gateway.name} is $${gateway.maxWithdraw.toFixed(2)}`);
    }

    const id = randomUUID();
    const transactionRef = `WTH-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const withdraw: WithdrawRecord = {
      id,
      transactionRef,
      userId: params.userId,
      method: params.method,
      amount: params.amount,
      currencyCode: params.currencyCode || 'USD',
      payoutDetails: params.payoutDetails,
      status: 'PENDING_APPROVAL',
      createdAt: new Date(),
      reviewedAt: null,
    };

    this.withdrawals.set(id, withdraw);
    console.log(`[WithdrawManager] Withdrawal ${transactionRef} requested by User ${params.userId}: $${params.amount} via ${params.method}`);
    return withdraw;
  }

  public approveWithdrawal(withdrawId: string, adminUserId: string): WithdrawRecord {
    const withdraw = this.withdrawals.get(withdrawId);
    if (!withdraw) throw new Error(`Withdrawal ${withdrawId} not found`);

    if (withdraw.status !== 'PENDING_APPROVAL') {
      throw new Error(`CANNOT_APPROVE: Withdrawal is in status: ${withdraw.status}`);
    }

    withdraw.status = 'APPROVED';
    withdraw.reviewedAt = new Date();
    withdraw.reviewedBy = adminUserId;

    console.log(`[WithdrawManager] Withdrawal ${withdraw.transactionRef} APPROVED by Admin ${adminUserId}`);
    return withdraw;
  }

  public rejectWithdrawal(withdrawId: string, adminUserId: string, reason: string): WithdrawRecord {
    const withdraw = this.withdrawals.get(withdrawId);
    if (!withdraw) throw new Error(`Withdrawal ${withdrawId} not found`);

    if (withdraw.status !== 'PENDING_APPROVAL') {
      throw new Error(`CANNOT_REJECT: Withdrawal is in status: ${withdraw.status}`);
    }

    withdraw.status = 'REJECTED';
    withdraw.rejectionReason = reason;
    withdraw.reviewedAt = new Date();
    withdraw.reviewedBy = adminUserId;

    console.log(`[WithdrawManager] Withdrawal ${withdraw.transactionRef} REJECTED by Admin ${adminUserId}: ${reason}`);
    return withdraw;
  }

  public cancelWithdrawal(withdrawId: string, userId: string): WithdrawRecord {
    const withdraw = this.withdrawals.get(withdrawId);
    if (!withdraw) throw new Error(`Withdrawal ${withdrawId} not found`);

    if (withdraw.userId !== userId) {
      throw new Error('FORBIDDEN: Cannot cancel withdrawal belonging to another user');
    }

    if (withdraw.status !== 'PENDING_APPROVAL') {
      throw new Error(`CANNOT_CANCEL: Withdrawal already processed in status: ${withdraw.status}`);
    }

    withdraw.status = 'CANCELLED';
    withdraw.reviewedAt = new Date();
    return withdraw;
  }

  public getWithdrawalById(id: string): WithdrawRecord | undefined {
    return this.withdrawals.get(id);
  }

  public getPendingWithdrawals(): WithdrawRecord[] {
    return Array.from(this.withdrawals.values()).filter((w) => w.status === 'PENDING_APPROVAL');
  }

  public getUserWithdrawals(userId: string): WithdrawRecord[] {
    return Array.from(this.withdrawals.values()).filter((w) => w.userId === userId);
  }

  public getAllWithdrawals(): WithdrawRecord[] {
    return Array.from(this.withdrawals.values());
  }
}
