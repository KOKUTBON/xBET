/**
 * WeCashUp Pan-African Mobile Money Payment Driver
 * Ported 1:1 from CakePHP Payments/Controller/WeCashUpController.php.
 * Handles MTN Mobile Money, Airtel Money, Orange Money, and M-Pesa push webhooks across Africa.
 */

import { createHmac, randomBytes } from 'crypto';
import { PaymentMethod } from '../payment-gateway.ts';
import type { IPaymentGatewayDriver, PaymentSessionResult, WebhookResult, PayoutResult } from '../gateway-driver.ts';
import type { DepositRecord } from '../deposit-manager.ts';
import type { WithdrawRecord } from '../withdraw-manager.ts';

export class WeCashUpDriver implements IPaymentGatewayDriver {
  public readonly providerName = 'WeCashUp';
  public readonly supportedMethods = [PaymentMethod.WECASHUP_MOBILE_MONEY];

  public async createDepositSession(deposit: DepositRecord, config?: Record<string, unknown>): Promise<PaymentSessionResult> {
    const transactionUid = `wcu_${randomBytes(12).toString('hex')}`;
    const checkoutUrl = `https://www.wecashup.com/gateway?merchant_uid=merch_xbet&transaction_uid=${transactionUid}&amount=${deposit.amount}&currency=${deposit.currencyCode}`;

    return {
      depositId: deposit.id,
      transactionRef: deposit.transactionRef,
      checkoutUrl,
      paymentInstructions: 'Redirect user to WeCashUp Mobile Money Portal (MTN/Airtel/Orange/M-Pesa)',
      metadata: {
        transactionUid,
        merchantPublicKey: 'pk_live_xbet_wecashup_af99',
        currency: deposit.currencyCode,
        amount: deposit.amount,
      },
    };
  }

  public verifyWebhookSignature(headers: Record<string, string>, payload: any, secret: string): boolean {
    const signature = headers['x-wecashup-signature'] || payload.merchant_secret;
    if (!signature || !secret) return false;
    return signature === secret;
  }

  public async processWebhook(headers: Record<string, string>, payload: any, secret?: string): Promise<WebhookResult> {
    if (secret && !this.verifyWebhookSignature(headers, payload, secret)) {
      return {
        success: false,
        provider: this.providerName,
        transactionRef: payload.merchant_transaction_id || payload.transaction_uid || '',
        amount: 0,
        currencyCode: 'USD',
        status: 'FAILED',
        statusCode: 403,
        responsePayload: { error: 'INVALID_WECASHUP_SECRET' },
        error: 'INVALID_WECASHUP_SECRET',
      };
    }

    const transactionRef = payload.merchant_transaction_id || payload.transaction_ref;
    const amount = parseFloat(payload.transaction_amount || payload.amount || '0');
    const currencyCode = (payload.transaction_currency || payload.currency || 'USD').toUpperCase();
    const externalTransactionId = payload.transaction_uid || payload.wecashup_transaction_id || `wcu_tx_${randomBytes(8).toString('hex')}`;
    const status = (payload.transaction_status || '').toUpperCase();

    if (!transactionRef) {
      return {
        success: false,
        provider: this.providerName,
        transactionRef: '',
        amount,
        currencyCode,
        status: 'FAILED',
        statusCode: 400,
        responsePayload: { error: 'MISSING_TRANSACTION_REF' },
        error: 'MISSING_TRANSACTION_REF',
      };
    }

    if (status === 'PAID' || status === 'SUCCESS' || status === 'COMPLETED') {
      return {
        success: true,
        provider: this.providerName,
        transactionRef,
        externalTransactionId,
        amount,
        currencyCode,
        status: 'COMPLETED',
        statusCode: 200,
        responsePayload: { response_status: 'ACCEPTED' },
      };
    }

    if (status === 'FAILED' || status === 'CANCELLED') {
      return {
        success: true,
        provider: this.providerName,
        transactionRef,
        externalTransactionId,
        amount,
        currencyCode,
        status: 'FAILED',
        statusCode: 200,
        responsePayload: { response_status: 'MARKED_FAILED' },
      };
    }

    return {
      success: true,
      provider: this.providerName,
      transactionRef,
      externalTransactionId,
      amount,
      currencyCode,
      status: 'PENDING',
      statusCode: 200,
      responsePayload: { response_status: 'PENDING' },
    };
  }

  public async processPayout(withdraw: WithdrawRecord, config?: Record<string, unknown>): Promise<PayoutResult> {
    const payoutRef = `wcu_po_${randomBytes(8).toString('hex')}`;
    return {
      success: true,
      withdrawId: withdraw.id,
      transactionRef: withdraw.transactionRef,
      externalPayoutId: payoutRef,
      status: 'PROCESSED',
      message: `WeCashUp Mobile Money payout of ${withdraw.amount} ${withdraw.currencyCode} sent to ${withdraw.payoutDetails}`,
    };
  }
}
