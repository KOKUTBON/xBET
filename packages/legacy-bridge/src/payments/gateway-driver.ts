/**
 * Payment Gateway Driver Interface & Shared Contracts
 */

import { PaymentMethod } from './payment-gateway.ts';
import type { DepositRecord } from './deposit-manager.ts';
import type { WithdrawRecord } from './withdraw-manager.ts';

export interface PaymentSessionResult {
  depositId: string;
  transactionRef: string;
  checkoutUrl?: string;
  receivingAddress?: string;
  paymentInstructions?: string;
  metadata?: Record<string, unknown>;
}

export interface WebhookResult {
  success: boolean;
  provider: string;
  transactionRef: string;
  externalTransactionId?: string;
  amount: number;
  currencyCode: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED';
  responsePayload: string | Record<string, unknown>;
  statusCode: number;
  error?: string;
}

export interface PayoutResult {
  success: boolean;
  withdrawId: string;
  transactionRef: string;
  externalPayoutId?: string;
  status: 'PROCESSED' | 'PENDING' | 'REJECTED';
  message?: string;
}

export interface IPaymentGatewayDriver {
  readonly providerName: string;
  readonly supportedMethods: PaymentMethod[];

  createDepositSession(deposit: DepositRecord, config?: Record<string, unknown>): Promise<PaymentSessionResult>;
  verifyWebhookSignature(headers: Record<string, string>, payload: any, secret: string): boolean;
  processWebhook(headers: Record<string, string>, payload: any, secret?: string): Promise<WebhookResult>;
  processPayout(withdraw: WithdrawRecord, config?: Record<string, unknown>): Promise<PayoutResult>;
}
