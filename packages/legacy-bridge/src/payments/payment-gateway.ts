export const PaymentMethod = {
  CREDIT_CARD: 'CREDIT_CARD',
  CARD_STRIPE: 'CARD_STRIPE',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CRYPTO_BTC: 'CRYPTO_BTC',
  CRYPTO_USDT: 'CRYPTO_USDT',
  PERFECT_MONEY: 'PERFECT_MONEY',
  WECASHUP_MOBILE_MONEY: 'WECASHUP_MOBILE_MONEY',
  E_WALLET_SKRILL: 'E_WALLET_SKRILL',
  PREPAID_VOUCHER: 'PREPAID_VOUCHER',
  NOVINPAL: 'NOVINPAL',
  EGOPAY: 'EGOPAY',
  ETRANZACT: 'ETRANZACT',
  LUNAWALLET: 'LUNAWALLET',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export interface PaymentGatewayConfig {
  method: PaymentMethod;
  name: string;
  minDeposit: number;
  maxDeposit: number;
  minWithdraw: number;
  maxWithdraw: number;
  feePercentage: number;
  isInstant: boolean;
}

export class PaymentGatewayRegistry {
  private static gateways: Record<PaymentMethod, PaymentGatewayConfig> = {
    CREDIT_CARD: {
      method: 'CREDIT_CARD',
      name: 'Credit / Debit Card (Visa, Mastercard)',
      minDeposit: 10.0,
      maxDeposit: 5000.0,
      minWithdraw: 20.0,
      maxWithdraw: 10000.0,
      feePercentage: 0.0,
      isInstant: true,
    },
    CARD_STRIPE: {
      method: 'CARD_STRIPE',
      name: 'Stripe Card Checkout (Visa, Mastercard, Apple Pay)',
      minDeposit: 10.0,
      maxDeposit: 10000.0,
      minWithdraw: 20.0,
      maxWithdraw: 10000.0,
      feePercentage: 0.0,
      isInstant: true,
    },
    BANK_TRANSFER: {
      method: 'BANK_TRANSFER',
      name: 'Direct Bank Wire / SEPA',
      minDeposit: 50.0,
      maxDeposit: 50000.0,
      minWithdraw: 100.0,
      maxWithdraw: 50000.0,
      feePercentage: 0.0,
      isInstant: false,
    },
    CRYPTO_BTC: {
      method: 'CRYPTO_BTC',
      name: 'Cryptocurrency (Bitcoin BTC)',
      minDeposit: 20.0,
      maxDeposit: 100000.0,
      minWithdraw: 20.0,
      maxWithdraw: 100000.0,
      feePercentage: 0.0,
      isInstant: false,
    },
    CRYPTO_USDT: {
      method: 'CRYPTO_USDT',
      name: 'Tether USD (USDT TRC-20 / ERC-20)',
      minDeposit: 10.0,
      maxDeposit: 250000.0,
      minWithdraw: 15.0,
      maxWithdraw: 250000.0,
      feePercentage: 0.0,
      isInstant: true,
    },
    PERFECT_MONEY: {
      method: 'PERFECT_MONEY',
      name: 'Perfect Money (USD / EUR)',
      minDeposit: 5.0,
      maxDeposit: 50000.0,
      minWithdraw: 10.0,
      maxWithdraw: 50000.0,
      feePercentage: 0.0,
      isInstant: true,
    },
    WECASHUP_MOBILE_MONEY: {
      method: 'WECASHUP_MOBILE_MONEY',
      name: 'WeCashUp Mobile Money (MTN, Orange, Airtel, M-Pesa)',
      minDeposit: 2.0,
      maxDeposit: 5000.0,
      minWithdraw: 5.0,
      maxWithdraw: 5000.0,
      feePercentage: 0.0,
      isInstant: true,
    },
    E_WALLET_SKRILL: {
      method: 'E_WALLET_SKRILL',
      name: 'E-Wallet (Skrill / Neteller)',
      minDeposit: 10.0,
      maxDeposit: 10000.0,
      minWithdraw: 20.0,
      maxWithdraw: 10000.0,
      feePercentage: 0.0,
      isInstant: false,
    },
    PREPAID_VOUCHER: {
      method: 'PREPAID_VOUCHER',
      name: 'Retail Prepaid Pin / Voucher',
      minDeposit: 5.0,
      maxDeposit: 1000.0,
      minWithdraw: 0.0,
      maxWithdraw: 0.0,
      feePercentage: 0.0,
      isInstant: false,
    },
    NOVINPAL: {
      method: 'NOVINPAL',
      name: 'NovinPal Payment Gateway (Toman / IRR)',
      minDeposit: 10000.0,
      maxDeposit: 50000000.0,
      minWithdraw: 50000.0,
      maxWithdraw: 100000000.0,
      feePercentage: 0.0,
      isInstant: true,
    },
    EGOPAY: {
      method: 'EGOPAY',
      name: 'EgoPay Digital Currency (USD / EUR)',
      minDeposit: 5.0,
      maxDeposit: 25000.0,
      minWithdraw: 10.0,
      maxWithdraw: 25000.0,
      feePercentage: 0.0,
      isInstant: true,
    },
    ETRANZACT: {
      method: 'ETRANZACT',
      name: 'eTranzact Multi-Network Payment Switch',
      minDeposit: 10.0,
      maxDeposit: 5000000.0,
      minWithdraw: 20.0,
      maxWithdraw: 5000000.0,
      feePercentage: 0.0,
      isInstant: true,
    },
    LUNAWALLET: {
      method: 'LUNAWALLET',
      name: 'LunaWallet Crypto Merchant Gateway',
      minDeposit: 10.0,
      maxDeposit: 100000.0,
      minWithdraw: 20.0,
      maxWithdraw: 100000.0,
      feePercentage: 0.0,
      isInstant: true,
    },
  };

  public static getAvailableGateways(): PaymentGatewayConfig[] {
    return Object.values(this.gateways);
  }

  public static getGateway(method: PaymentMethod): PaymentGatewayConfig | undefined {
    return this.gateways[method];
  }
}
