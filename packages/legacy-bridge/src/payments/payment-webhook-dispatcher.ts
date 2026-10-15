/**
 * Payment Webhook Dispatcher & Settlement Pipeline
 * Routes incoming payment IPN callbacks, verifies cryptographic signatures,
 * guards idempotency, and fulfills user wallet deposits.
 */

import { EventEmitter } from 'events';
import type { IPaymentGatewayDriver, WebhookResult } from './gateway-driver.ts';
import { BlockChainBtcDriver } from './drivers/blockchain-btc-driver.ts';
import { CoinPaymentsDriver } from './drivers/coinpayments-driver.ts';
import { PaypalDriver } from './drivers/paypal-driver.ts';
import { SkrillDriver } from './drivers/skrill-driver.ts';
import { InterSwitchDriver } from './drivers/interswitch-driver.ts';
import { AgentCreditDriver } from './drivers/agent-credit-driver.ts';
import { StripeDriver } from './drivers/stripe-driver.ts';
import { CryptoUsdtDriver } from './drivers/crypto-usdt-driver.ts';
import { PerfectMoneyDriver } from './drivers/perfectmoney-driver.ts';
import { WeCashUpDriver } from './drivers/wecashup-driver.ts';
import { NovinPalDriver } from './drivers/novinpal-driver.ts';
import { EgoPayDriver } from './drivers/egopay-driver.ts';
import { EtranzactDriver } from './drivers/etranzact-driver.ts';
import { LunaWalletDriver } from './drivers/lunawallet-driver.ts';
import { DepositManager } from './deposit-manager.ts';
import type { DepositRecord } from './deposit-manager.ts';

export interface DispatcherStats {
  totalWebhooksReceived: number;
  totalCompletedDeposits: number;
  totalFailedWebhooks: number;
  totalDepositedVolume: number;
  processedTransactionHashes: number;
}

export class PaymentWebhookDispatcher extends EventEmitter {
  private static instance: PaymentWebhookDispatcher;
  private drivers: Map<string, IPaymentGatewayDriver> = new Map();
  private providerSecrets: Map<string, string> = new Map();
  private depositManager: DepositManager;

  // Idempotency tracking: Set of completed externalTransactionIds / transactionRefs
  private processedTransactions: Set<string> = new Set();

  private stats: DispatcherStats = {
    totalWebhooksReceived: 0,
    totalCompletedDeposits: 0,
    totalFailedWebhooks: 0,
    totalDepositedVolume: 0,
    processedTransactionHashes: 0,
  };

  private constructor() {
    super();
    this.depositManager = DepositManager.getInstance();

    // Register all default gateway drivers
    this.registerDriver(new StripeDriver());
    this.registerDriver(new CryptoUsdtDriver());
    this.registerDriver(new PerfectMoneyDriver());
    this.registerDriver(new WeCashUpDriver());
    this.registerDriver(new BlockChainBtcDriver());
    this.registerDriver(new CoinPaymentsDriver());
    this.registerDriver(new PaypalDriver());
    this.registerDriver(new SkrillDriver());
    this.registerDriver(new InterSwitchDriver());
    this.registerDriver(new AgentCreditDriver());
    this.registerDriver(new NovinPalDriver());
    this.registerDriver(new EgoPayDriver());
    this.registerDriver(new EtranzactDriver());
    this.registerDriver(new LunaWalletDriver());

    // Load sandbox / production secrets from environment
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      this.setProviderSecret('stripe', process.env.STRIPE_WEBHOOK_SECRET);
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: STRIPE_WEBHOOK_SECRET environment variable is required at startup in production mode');
    }
    if (process.env.PAYPAL_WEBHOOK_SECRET) this.setProviderSecret('paypal', process.env.PAYPAL_WEBHOOK_SECRET);
    if (process.env.COINPAYMENTS_IPN_SECRET) this.setProviderSecret('coinpayments', process.env.COINPAYMENTS_IPN_SECRET);
    if (process.env.PERFECTMONEY_PASSPHRASE) this.setProviderSecret('perfectmoney', process.env.PERFECTMONEY_PASSPHRASE);
    if (process.env.WECASHUP_SECRET_KEY) this.setProviderSecret('wecashup', process.env.WECASHUP_SECRET_KEY);
    if (process.env.NOVINPAL_API_KEY) this.setProviderSecret('novinpal', process.env.NOVINPAL_API_KEY);
    if (process.env.EGOPAY_STORE_PASSWORD) this.setProviderSecret('egopay', process.env.EGOPAY_STORE_PASSWORD);
    if (process.env.ETRANZACT_SECRET_KEY) this.setProviderSecret('etranzact', process.env.ETRANZACT_SECRET_KEY);
    if (process.env.LUNAWALLET_API_KEY) this.setProviderSecret('lunawallet', process.env.LUNAWALLET_API_KEY);
  }

  public static getInstance(): PaymentWebhookDispatcher {
    if (!PaymentWebhookDispatcher.instance) {
      PaymentWebhookDispatcher.instance = new PaymentWebhookDispatcher();
    }
    return PaymentWebhookDispatcher.instance;
  }

  public registerDriver(driver: IPaymentGatewayDriver): void {
    this.drivers.set(driver.providerName.toLowerCase(), driver);
  }

  public setProviderSecret(providerName: string, secret: string): void {
    this.providerSecrets.set(providerName.toLowerCase(), secret);
  }

  public getDriver(providerName: string): IPaymentGatewayDriver {
    const driver = this.drivers.get(providerName.toLowerCase());
    if (!driver) throw new Error(`DRIVER_NOT_FOUND: No payment driver registered for '${providerName}'`);
    return driver;
  }

  /**
   * Convenience alias for dispatching webhooks with signature or raw headers
   */
  public async processWebhook(providerName: string, payload: any, signature?: string): Promise<WebhookResult> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-webhook-signature': signature || '',
      'stripe-signature': signature || '',
      'hmac': signature || '',
    };
    return this.handleWebhook(providerName, headers, payload);
  }

  /**
   * Dispatches and processes an incoming payment webhook
   */
  public async handleWebhook(
    providerName: string,
    headers: Record<string, string>,
    payload: any
  ): Promise<WebhookResult> {
    this.stats.totalWebhooksReceived++;
    const driver = this.getDriver(providerName);
    const secret = this.providerSecrets.get(providerName.toLowerCase());

    const result = await driver.processWebhook(headers, payload, secret);

    if (!result.success || result.status === 'FAILED') {
      this.stats.totalFailedWebhooks++;
      if (result.transactionRef) {
        this.depositManager.failDeposit(result.transactionRef, result.error);
      }
      return result;
    }

    if (result.status === 'COMPLETED') {
      const idempotencyKey = `${providerName}_${result.externalTransactionId || result.transactionRef}`;

      // Idempotency check
      if (this.processedTransactions.has(idempotencyKey)) {
        console.log(`[PaymentDispatcher] Duplicate webhook received for ${idempotencyKey} (Idempotent response)`);
        return result;
      }

      this.processedTransactions.add(idempotencyKey);
      this.stats.processedTransactionHashes++;

      // Complete deposit record
      const deposit = this.depositManager.completeDeposit(result.transactionRef, result.externalTransactionId);
      this.stats.totalCompletedDeposits++;
      this.stats.totalDepositedVolume += result.amount || deposit.amount;

      // Emit event for wallet credit & downstream listeners
      this.emit('deposit:completed', {
        provider: providerName,
        deposit,
        amount: result.amount || deposit.amount,
        currencyCode: result.currencyCode || deposit.currencyCode,
        externalTransactionId: result.externalTransactionId,
      });

      console.log(
        `[PaymentDispatcher] Deposit ${deposit.transactionRef} successfully fulfilled via ${providerName} ($${result.amount || deposit.amount})`
      );
    }

    return result;
  }

  /**
   * Simulates an end-to-end sandbox deposit for testing
   */
  public simulateSandboxDeposit(params: {
    userId: string;
    provider: string;
    amount: number;
    currencyCode?: string;
  }): { deposit: DepositRecord; webhookResult: WebhookResult } {
    const methodMap: Record<string, string> = {
      stripe: 'CARD_STRIPE',
      paypal: 'CREDIT_CARD',
      blockchain: 'CRYPTO_BTC',
      bitcoin: 'CRYPTO_BTC',
      crypto_btc: 'CRYPTO_BTC',
      crypto_usdt: 'CRYPTO_USDT',
      usdt: 'CRYPTO_USDT',
      perfectmoney: 'PERFECT_MONEY',
      perfect_money: 'PERFECT_MONEY',
      wecashup: 'WECASHUP_MOBILE_MONEY',
      wecashup_mobile_money: 'WECASHUP_MOBILE_MONEY',
      skrill: 'E_WALLET_SKRILL',
      interswitch: 'BANK_TRANSFER',
      agent_credit: 'PREPAID_VOUCHER',
      novinpal: 'NOVINPAL',
      egopay: 'EGOPAY',
      etranzact: 'ETRANZACT',
      lunawallet: 'LUNAWALLET',
    };

    const method = (methodMap[params.provider.toLowerCase()] || params.provider.toUpperCase()) as any;

    const deposit = this.depositManager.createDeposit({
      userId: params.userId,
      amount: params.amount,
      currencyCode: params.currencyCode || 'USD',
      method,
    });

    const completedDeposit = this.depositManager.completeDeposit(deposit.transactionRef, `sb_tx_${Date.now()}`);
    this.stats.totalCompletedDeposits++;
    this.stats.totalDepositedVolume += params.amount;

    return {
      deposit: completedDeposit,
      webhookResult: {
        success: true,
        provider: params.provider,
        transactionRef: deposit.transactionRef,
        externalTransactionId: completedDeposit.externalTransactionId || '',
        amount: params.amount,
        currencyCode: params.currencyCode || 'USD',
        status: 'COMPLETED',
        statusCode: 200,
      },
    };
  }

  public getStats(): DispatcherStats {
    return { ...this.stats };
  }

  public isTransactionProcessed(idempotencyKey: string): boolean {
    return this.processedTransactions.has(idempotencyKey);
  }
}
