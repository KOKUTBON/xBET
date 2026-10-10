/**
 * Live Dealer Casino Aggregator Protocol
 *
 * Demonstrates a seamless-wallet integration pattern for third-party live-dealer studios:
 * signed HMAC launch URLs, session validation, and debit/credit/rollback wallet callbacks.
 * The provider names and endpoints below are illustrative placeholders — wire in a real
 * licensed provider's actual API details to use this in production.
 */

import { createHmac, randomBytes } from 'crypto';
import { LedgerService } from '../../../betting-engine/src/wallet/ledger-service.ts';

export type LiveCasinoProvider = 'STUDIO_ONE' | 'STUDIO_TWO' | 'STUDIO_THREE' | 'STUDIO_FOUR' | 'STUDIO_FIVE' | 'STUDIO_SIX' | 'STUDIO_SEVEN' | 'STUDIO_EIGHT';

export interface LiveTableLaunchConfig {
  userId: string;
  gameCode: string;
  provider: LiveCasinoProvider;
  currencyCode?: string;
  locale?: string;
  clientIp?: string;
}

export interface LiveLaunchResult {
  sessionId: string;
  token: string;
  launchUrl: string;
  provider: LiveCasinoProvider;
  gameCode: string;
  expiresAt: string;
}

export interface LiveCasinoTransactionResult {
  success: boolean;
  transactionId: string;
  roundId: string;
  userId: string;
  balance: number;
  error?: string;
}

export class LiveCasinoAggregator {
  private static instance: LiveCasinoAggregator;
  private ledger: LedgerService;
  private secretKey: string = 'live_casino_aggregator_secret_key_888';
  // Placeholder endpoints — replace with a real licensed provider's launch URL.
  private providerBaseUrls: Record<LiveCasinoProvider, string> = {
    STUDIO_ONE: 'https://studio-one.example.com/game/launch',
    STUDIO_TWO: 'https://studio-two.example.com/play',
    STUDIO_THREE: 'https://studio-three.example.com/auth',
    STUDIO_FOUR: 'https://studio-four.example.com/tables',
    STUDIO_FIVE: 'https://studio-five.example.com/iframe',
    STUDIO_SIX: 'https://studio-six.example.com/play',
    STUDIO_SEVEN: 'https://studio-seven.example.com/live',
    STUDIO_EIGHT: 'https://studio-eight.example.com/games',
  };

  private activeSessions: Map<string, { userId: string; gameCode: string; provider: LiveCasinoProvider; expiresAt: number }> = new Map();
  private processedTransactions: Set<string> = new Set();

  private constructor() {
    this.ledger = LedgerService.getInstance();
  }

  public static getInstance(): LiveCasinoAggregator {
    if (!LiveCasinoAggregator.instance) {
      LiveCasinoAggregator.instance = new LiveCasinoAggregator();
    }
    return LiveCasinoAggregator.instance;
  }

  /**
   * Generates a cryptographically signed HMAC launch session URL for live dealer tables
   */
  public createLaunchSession(config: LiveTableLaunchConfig): LiveLaunchResult {
    const sessionId = `live_sess_${randomBytes(12).toString('hex')}`;
    const token = createHmac('sha256', this.secretKey)
      .update(`${sessionId}:${config.userId}:${config.gameCode}:${config.provider}`)
      .digest('hex');

    const expiresAt = Date.now() + 6 * 60 * 60 * 1000; // 6 hours validity
    this.activeSessions.set(token, {
      userId: config.userId,
      gameCode: config.gameCode,
      provider: config.provider,
      expiresAt,
    });

    const baseUrl = this.providerBaseUrls[config.provider] || this.providerBaseUrls.STUDIO_ONE;
    const currency = config.currencyCode || 'USD';
    const lang = config.locale || 'eng';
    const launchUrl = `${baseUrl}?token=${token}&game=${config.gameCode}&currency=${currency}&lang=${lang}&session=${sessionId}`;

    console.log(`[LiveCasino] Generated launch URL for User ${config.userId} on ${config.provider}:${config.gameCode}`);

    return {
      sessionId,
      token,
      launchUrl,
      provider: config.provider,
      gameCode: config.gameCode,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  /**
   * Validates launch session token
   */
  public validateToken(token: string): { valid: boolean; userId?: string; provider?: LiveCasinoProvider } {
    const session = this.activeSessions.get(token);
    if (!session || Date.now() > session.expiresAt) {
      return { valid: false };
    }
    return { valid: true, userId: session.userId, provider: session.provider };
  }

  /**
   * Seamless Wallet: Balance Check Callback
   */
  public handleBalance(userId: string): { balance: number; currency: string } {
    const balance = this.ledger.getBalance(userId);
    return { balance, currency: 'USD' };
  }

  /**
   * Seamless Wallet: Debit (Place Bet on Live Table)
   */
  public handleDebit(params: {
    userId: string;
    transactionId: string;
    roundId: string;
    amount: number;
    gameCode: string;
  }): LiveCasinoTransactionResult {
    const idempotencyKey = `debit_${params.transactionId}`;
    if (this.processedTransactions.has(idempotencyKey)) {
      return {
        success: true,
        transactionId: params.transactionId,
        roundId: params.roundId,
        userId: params.userId,
        balance: this.ledger.getBalance(params.userId),
      };
    }

    try {
      this.ledger.holdBetStake(params.userId, params.transactionId, params.amount);
      this.processedTransactions.add(idempotencyKey);
      const balance = this.ledger.getBalance(params.userId);
      console.log(`[LiveCasino:Debit] User ${params.userId} bet $${params.amount} on round ${params.roundId} (New Balance: $${balance})`);

      return {
        success: true,
        transactionId: params.transactionId,
        roundId: params.roundId,
        userId: params.userId,
        balance,
      };
    } catch (err: any) {
      return {
        success: false,
        transactionId: params.transactionId,
        roundId: params.roundId,
        userId: params.userId,
        balance: this.ledger.getBalance(params.userId),
        error: err.message || 'INSUFFICIENT_FUNDS',
      };
    }
  }

  /**
   * Seamless Wallet: Credit (Settle Winnings / Losing Result)
   */
  public handleCredit(params: {
    userId: string;
    transactionId: string;
    roundId: string;
    debitAmount: number;
    payout: number;
  }): LiveCasinoTransactionResult {
    const idempotencyKey = `credit_${params.transactionId}`;
    if (this.processedTransactions.has(idempotencyKey)) {
      return {
        success: true,
        transactionId: params.transactionId,
        roundId: params.roundId,
        userId: params.userId,
        balance: this.ledger.getBalance(params.userId),
      };
    }

    if (params.payout > 0) {
      this.ledger.settleWinningBet(params.userId, params.transactionId, params.debitAmount, params.payout);
    } else {
      this.ledger.settleLosingBet(params.userId, params.transactionId, params.debitAmount);
    }

    this.processedTransactions.add(idempotencyKey);
    const balance = this.ledger.getBalance(params.userId);
    console.log(`[LiveCasino:Credit] Round ${params.roundId} settled: Payout $${params.payout} (New Balance: $${balance})`);

    return {
      success: true,
      transactionId: params.transactionId,
      roundId: params.roundId,
      userId: params.userId,
      balance,
    };
  }

  /**
   * Seamless Wallet: Rollback / Refund on cancelled dealer rounds
   */
  public handleRollback(params: {
    userId: string;
    transactionId: string;
    roundId: string;
    amount: number;
  }): LiveCasinoTransactionResult {
    const idempotencyKey = `rollback_${params.transactionId}`;
    if (this.processedTransactions.has(idempotencyKey)) {
      return {
        success: true,
        transactionId: params.transactionId,
        roundId: params.roundId,
        userId: params.userId,
        balance: this.ledger.getBalance(params.userId),
      };
    }

    this.ledger.settleVoidBet(params.userId, params.transactionId, params.amount);
    this.processedTransactions.add(idempotencyKey);
    const balance = this.ledger.getBalance(params.userId);

    console.log(`[LiveCasino:Rollback] Bet $${params.amount} on round ${params.roundId} refunded (New Balance: $${balance})`);

    return {
      success: true,
      transactionId: params.transactionId,
      roundId: params.roundId,
      userId: params.userId,
      balance,
    };
  }
}
