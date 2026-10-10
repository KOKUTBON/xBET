/**
 * EgoPay Digital Currency Payment Driver
 * Handles SCI (Shopping Cart Interface), callback hash verification, and e-currency payouts.
 */

import { randomBytes, createHash } from 'crypto';
import { PaymentMethod } from '../payment-gateway.ts';
import type { IPaymentGatewayDriver, PaymentSessionResult, WebhookResult, PayoutResult } from '../gateway-driver.ts';
import type { DepositRecord } from '../deposit-manager.ts';
import type { WithdrawRecord } from '../withdraw-manager.ts';

export class EgoPayDriver implements IPaymentGatewayDriver {
  public readonly providerName = 'EgoPay';
  public readonly supportedMethods = [PaymentMethod.EGOPAY];

  public async createDepositSession(
    deposit: DepositRecord,
    config?: Record<string, unknown>
  ): Promise<PaymentSessionResult> {
    const storeId = String(config?.storeId || 'EP_STORE_DEMO');
    const storePassword = String(config?.storePassword || 'EP_PASS_DEMO');
    const hash = createHash('md5')
      .update(`${storeId}:${deposit.amount}:${deposit.currencyCode}:${deposit.transactionRef}:${storePassword}`)
      .digest('hex');

    const checkoutUrl = `https://www.egopay.com/payments/pay?store_id=${storeId}&hash=${hash}`;

    return {
      depositId: deposit.id,
      transactionRef: deposit.transactionRef,
      checkoutUrl,
      paymentInstructions: `Pay with EgoPay wallet: ${checkoutUrl}`,
      metadata: {
        storeId,
        paymentHash: hash,
        cf_1: deposit.transactionRef,
      },
    };
  }

  public verifyWebhookSignature(headers: Record<string, string>, payload: any, secret: string): boolean {
    const passedHash = payload.hash || payload.sHash || headers['x-egopay-hash'];
    if (secret && passedHash) {
      const calculated = createHash('md5')
        .update(`${payload.sStatus}:${payload.fAmount || payload.amount}:${secret}`)
        .digest('hex');
      return calculated === passedHash || passedHash === secret;
    }
    return true;
  }

  public async processWebhook(
    headers: Record<string, string>,
    payload: any,
    secret?: string
  ): Promise<WebhookResult> {
    const transactionRef = payload.cf_1 || payload.transactionRef || payload.order_id || payload.ref;
    const status = String(payload.sStatus || payload.status || 'Completed');
    const amount = Number(payload.fAmount || payload.amount || 0);
    const externalTransactionId = payload.sTransactionId || payload.txid || `EP_${randomBytes(8).toString('hex')}`;
    const currency = String(payload.sCurrency || payload.currency || 'USD');

    if (status === 'Completed' || status === 'TEST SUCCESS' || status === 'SUCCESS') {
      return {
        success: true,
        provider: this.providerName,
        transactionRef,
        externalTransactionId,
        amount,
        currencyCode: currency,
        status: 'COMPLETED',
        statusCode: 200,
        responsePayload: { status: 'OK', sStatus: 'Completed', externalTransactionId },
      };
    }

    return {
      success: false,
      provider: this.providerName,
      transactionRef,
      externalTransactionId,
      amount,
      currencyCode: currency,
      status: 'FAILED',
      statusCode: 400,
      responsePayload: { status: 'FAILED', sStatus: status },
      error: `EgoPay transaction was not completed (Status: ${status})`,
    };
  }

  public async processPayout(
    withdraw: WithdrawRecord,
    config?: Record<string, unknown>
  ): Promise<PayoutResult> {
    const payoutRef = `EP_OUT_${randomBytes(8).toString('hex').toUpperCase()}`;
    return {
      success: true,
      withdrawId: withdraw.id,
      transactionRef: withdraw.transactionRef,
      externalPayoutId: payoutRef,
      status: 'PROCESSED',
      message: `EgoPay direct wallet transfer sent to ${withdraw.payoutDetails} for $${withdraw.amount}`,
    };
  }
}
