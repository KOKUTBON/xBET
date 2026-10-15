/**
 * Agent Credit & Retail Shop Cashier Payment Driver
 * Handles offline shop cash deposits, cashier voucher activation,
 * and agent credit tree limit deduction.
 */

import { randomBytes } from 'crypto';
import { PaymentMethod } from '../payment-gateway.ts';
import type { IPaymentGatewayDriver, PaymentSessionResult, WebhookResult, PayoutResult } from '../gateway-driver.ts';
import type { DepositRecord } from '../deposit-manager.ts';
import type { WithdrawRecord } from '../withdraw-manager.ts';
import { AgentCreditTree } from '../../users/agent-credit-tree.ts';

export class AgentCreditDriver implements IPaymentGatewayDriver {
  public readonly providerName = 'AgentCredit';
  public readonly supportedMethods = [PaymentMethod.PREPAID_VOUCHER];
  private creditTree: AgentCreditTree;

  constructor() {
    this.creditTree = AgentCreditTree.getInstance();
  }

  public async createDepositSession(deposit: DepositRecord, config?: Record<string, unknown>): Promise<PaymentSessionResult> {
    const voucherPin = `${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    return {
      depositId: deposit.id,
      transactionRef: deposit.transactionRef,
      paymentInstructions: `Provide Voucher PIN ${voucherPin} or Invoice ${invoiceNumber} to cashier at shop counter`,
      metadata: {
        voucherPin,
        invoiceNumber,
        agentId: config?.agentId || 'agent-shop-001',
      },
    };
  }

  public verifyWebhookSignature(headers: Record<string, string>, payload: any, secret: string): boolean {
    const agentToken = headers['x-agent-key'] || payload.agentSecret;
    if (secret && agentToken) {
      return agentToken === secret;
    }
    return true;
  }

  public async processWebhook(headers: Record<string, string>, payload: any, secret?: string): Promise<WebhookResult> {
    const agentId = payload.agentId || 'agent-shop-001';
    const transactionRef = payload.transactionRef || payload.invoiceNumber;
    const amount = parseFloat(payload.amount || '0');
    const currency = payload.currencyCode || 'USD';

    try {
      // Deduct from agent's till float
      this.creditTree.deductAgentCredit(agentId, amount);

      return {
        success: true,
        provider: this.providerName,
        transactionRef,
        externalTransactionId: `INVOICE_${randomBytes(6).toString('hex')}`,
        amount,
        currencyCode: currency,
        status: 'COMPLETED',
        statusCode: 200,
        responsePayload: { success: true, agentId, amount, status: 'CREDITED' },
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        provider: this.providerName,
        transactionRef,
        amount,
        currencyCode: currency,
        status: 'FAILED',
        statusCode: 400,
        responsePayload: { success: false, error: errMsg },
        error: errMsg,
      };
    }
  }

  public async processPayout(withdraw: WithdrawRecord, config?: Record<string, unknown>): Promise<PayoutResult> {
    const cashierReceipt = `RECEIPT_${randomBytes(6).toString('hex').toUpperCase()}`;
    return {
      success: true,
      withdrawId: withdraw.id,
      transactionRef: withdraw.transactionRef,
      externalPayoutId: cashierReceipt,
      status: 'PROCESSED',
      message: `Cashier physical cash payout approved. Collect cash with receipt: ${cashierReceipt}`,
    };
  }
}
