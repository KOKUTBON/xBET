import { randomUUID } from 'crypto';
import { LedgerService } from '../../../betting-engine/src/wallet/ledger-service.ts';

export interface CasinoSessionRecord {
  token: string;
  userId: string;
  gameCode: string;
  currencyCode: string;
  createdAt: Date;
}

export interface AuthResponse {
  userId: string;
  currencyCode: string;
  balance: number;
}

/**
 * SeamlessWalletAdapter provides a unified interface for the casino engine to interact
 * with the LedgerService (and optionally via HTTP).
 */
export class SeamlessWalletAdapter {
  private static instance: SeamlessWalletAdapter;
  private ledger: LedgerService;
  private sessions: Map<string, CasinoSessionRecord> = new Map();

  private constructor() {
    this.ledger = LedgerService.getInstance();
  }

  public static getInstance(): SeamlessWalletAdapter {
    if (!SeamlessWalletAdapter.instance) {
      SeamlessWalletAdapter.instance = new SeamlessWalletAdapter();
    }
    return SeamlessWalletAdapter.instance;
  }

  public createSession(userId: string, gameCode: string, currencyCode: string = 'USD'): string {
    const token = `c-sess-${randomUUID()}`;
    this.sessions.set(token, {
      token,
      userId,
      gameCode,
      currencyCode,
      createdAt: new Date(),
    });
    this.ledger.getOrCreateUserAccount(userId, currencyCode);
    return token;
  }

  public authenticate(sessionToken: string): AuthResponse {
    const sess = this.sessions.get(sessionToken);
    if (!sess) {
      throw new Error('INVALID_SESSION_TOKEN');
    }
    const balance = this.ledger.getBalance(sess.userId, sess.currencyCode);
    return {
      userId: sess.userId,
      currencyCode: sess.currencyCode,
      balance,
    };
  }

  public getOrCreateUserAccount(userId: string, currencyCode: string = 'USD'): string {
    return this.ledger.getOrCreateUserAccount(userId, currencyCode);
  }

  public getBalance(userId: string, currencyCode: string = 'USD'): number {
    return this.ledger.getBalance(userId, currencyCode);
  }

  public deposit(userId: string, amount: number, currencyCode: string = 'USD', refId?: string): any {
    return this.ledger.deposit(userId, amount, currencyCode, refId);
  }

  /** Admin grant (+) / revoke (-) of points. Returns the new balance. */
  public adminAdjust(userId: string, delta: number, reason: string = 'Admin adjustment', currencyCode: string = 'USD'): number {
    return this.ledger.adminAdjustPoints(userId, delta, reason, currencyCode).newBalance;
  }

  /** Ensure a player has at least `minBalance` points (used to seed demo accounts once). */
  public ensureMinimumBalance(userId: string, minBalance: number, currencyCode: string = 'USD'): number {
    const current = this.ledger.getBalance(userId, currencyCode);
    if (current < minBalance) {
      this.ledger.adminAdjustPoints(userId, minBalance - current, 'Initial demo points', currencyCode);
    }
    return this.ledger.getBalance(userId, currencyCode);
  }

  public processWager(
    userId: string,
    roundId: string,
    gameCode: string,
    amount: number,
    currencyCode: string = 'USD'
  ): number {
    this.ledger.holdBetStake(userId, roundId, amount, currencyCode);
    return this.ledger.getBalance(userId, currencyCode);
  }

  public processPayout(
    userId: string,
    roundId: string,
    gameCode: string,
    wager: number,
    payout: number,
    currencyCode: string = 'USD'
  ): number {
    if (payout > 0) {
      this.ledger.settleWinningBet(userId, roundId, wager, payout, currencyCode);
    } else {
      this.ledger.settleLosingBet(userId, roundId, wager, currencyCode);
    }
    return this.ledger.getBalance(userId, currencyCode);
  }
}

export const WalletAdapter = SeamlessWalletAdapter;
export type WalletAdapter = SeamlessWalletAdapter;
