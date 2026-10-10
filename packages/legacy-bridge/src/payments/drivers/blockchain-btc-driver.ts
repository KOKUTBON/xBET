/**
 * Blockchain Bitcoin Payment Driver
 * Handles Bitcoin address generation, IPN callback verification,
 * confirmation thresholds, and satoshi conversion.
 */

import { createHash, randomBytes } from 'crypto';
import { PaymentMethod } from '../payment-gateway.ts';
import type { IPaymentGatewayDriver, PaymentSessionResult, WebhookResult, PayoutResult } from '../gateway-driver.ts';
import type { DepositRecord } from '../deposit-manager.ts';
import type { WithdrawRecord } from '../withdraw-manager.ts';

export class BlockChainBtcDriver implements IPaymentGatewayDriver {
  public readonly providerName = 'BlockChain';
  public readonly supportedMethods = [PaymentMethod.CRYPTO_BTC];

  public async createDepositSession(deposit: DepositRecord, config?: Record<string, unknown>): Promise<PaymentSessionResult> {
    const mockSecret = config?.secret as string || randomBytes(16).toString('hex');
    const mockAddress = `bc1q${randomBytes(18).toString('hex')}`;

    return {
      depositId: deposit.id,
      transactionRef: deposit.transactionRef,
      receivingAddress: mockAddress,
      paymentInstructions: `Send exactly ${(deposit.amount / 60000).toFixed(6)} BTC to ${mockAddress}`,
      metadata: {
        secret: mockSecret,
        generatedAddress: mockAddress,
        exchangeRateBtcUsd: 60000.0,
      },
    };
  }

  public verifyWebhookSignature(headers: Record<string, string>, payload: any, secret: string): boolean {
    const passedSecret = payload.secret || payload.Secret || headers['x-secret'];
    if (!passedSecret || !secret) return false;
    return passedSecret === secret;
  }

  public async processWebhook(headers: Record<string, string>, payload: any, secret?: string): Promise<WebhookResult> {
    if (secret && !this.verifyWebhookSignature(headers, payload, secret)) {
      return {
        success: false,
        provider: this.providerName,
        transactionRef: payload.payment_id || payload.transactionRef || '',
        amount: 0,
        currencyCode: 'USD',
        status: 'FAILED',
        statusCode: 403,
        responsePayload: '*bad_secret*',
        error: 'INVALID_BLOCKCHAIN_SECRET',
      };
    }

    const txHash = payload.transaction_hash || payload.tx_hash;
    const confirmations = parseInt(payload.confirmations || '0', 10);
    const satoshis = parseInt(payload.value || '0', 10);
    const btcValue = satoshis > 0 ? satoshis / 100000000 : parseFloat(payload.btc_amount || '0');
    const usdAmount = parseFloat(payload.usd_amount || (btcValue * 60000).toFixed(2));
    const transactionRef = payload.payment_id || payload.transactionRef;

    if (!transactionRef || !txHash) {
      return {
        success: false,
        provider: this.providerName,
        transactionRef: transactionRef || '',
        amount: 0,
        currencyCode: 'USD',
        status: 'FAILED',
        statusCode: 400,
        responsePayload: '*missing_params*',
        error: 'MISSING_TRANSACTION_PARAMS',
      };
    }

    if (confirmations < 3) {
      return {
        success: true,
        provider: this.providerName,
        transactionRef,
        externalTransactionId: txHash,
        amount: usdAmount,
        currencyCode: 'USD',
        status: 'PENDING',
        statusCode: 200,
        responsePayload: `Waiting for confirmations. Got ${confirmations}/3`,
      };
    }

    return {
      success: true,
      provider: this.providerName,
      transactionRef,
      externalTransactionId: txHash,
      amount: usdAmount,
      currencyCode: 'USD',
      status: 'COMPLETED',
      statusCode: 200,
      responsePayload: '*ok*',
    };
  }

  public async processPayout(withdraw: WithdrawRecord, config?: Record<string, unknown>): Promise<PayoutResult> {
    const txHash = `btc_tx_${randomBytes(16).toString('hex')}`;
    return {
      success: true,
      withdrawId: withdraw.id,
      transactionRef: withdraw.transactionRef,
      externalPayoutId: txHash,
      status: 'PROCESSED',
      message: `Sent $${withdraw.amount} BTC to ${withdraw.payoutDetails} (TxHash: ${txHash})`,
    };
  }
}
