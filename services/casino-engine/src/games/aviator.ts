/**
 * Aviator / Crash Game Engine
 * Provably Fair multiplier curve progression with real-time crash calculation,
 * auto-cashout triggers, dual-bet capability, and seamless wallet settlement.
 */

import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import { createHmac, randomUUID } from 'crypto';
import type { GameRoundResult } from './base-game.ts';

export interface AviatorBet {
  betId: string;
  userId: string;
  wager: number;
  autoCashoutMultiplier?: number;
  cashedOutMultiplier?: number;
  payout?: number;
  isCashedOut: boolean;
  timestamp: number;
}

export interface AviatorRound {
  roundId: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  crashMultiplier: number;
  startTime: number;
  durationMs: number;
  isCompleted: boolean;
  bets: Map<string, AviatorBet>;
}

export class AviatorEngine {
  private static instance: AviatorEngine;
  private activeRounds: Map<string, AviatorRound> = new Map();
  private history: Array<{ roundId: string; crashMultiplier: number; timestamp: number }> = [];

  private constructor() {}

  public static getInstance(): AviatorEngine {
    if (!AviatorEngine.instance) {
      AviatorEngine.instance = new AviatorEngine();
    }
    return AviatorEngine.instance;
  }

  /**
   * Generates a Provably Fair crash multiplier.
   * House edge: 3% (0.97 multiplier factor, 1% instant crash at 1.00x)
   */
  public static calculateCrashPoint(serverSeed: string, clientSeed: string, nonce: number): number {
    const hash = createHmac('sha256', serverSeed)
      .update(`${clientSeed}:${nonce}`)
      .digest('hex');

    // Take first 52 bits (13 hex chars)
    const subHash = hash.substring(0, 13);
    const intVal = parseInt(subHash, 16);
    const maxVal = Math.pow(2, 52);

    // 1 in 33 chance of instant crash at 1.00x (3% house edge base)
    if (intVal % 33 === 0) {
      return 1.00;
    }

    const rawMultiplier = (100 * maxVal - intVal) / (maxVal - intVal) / 100;
    const crashMultiplier = Math.floor(rawMultiplier * 100) / 100;

    return Math.max(1.00, Math.min(1000.00, crashMultiplier));
  }

  /**
   * Starts a new Aviator round
   */
  public createRound(serverSeed?: string, clientSeed?: string, nonce?: number): AviatorRound {
    const sSeed = serverSeed || ProvablyFairRNG.generateServerSeed();
    const cSeed = clientSeed || 'aviator_client_seed_global';
    const n = nonce ?? (this.history.length + 1);

    const crashMultiplier = AviatorEngine.calculateCrashPoint(sSeed, cSeed, n);
    const roundId = randomUUID();

    // Approximate duration in milliseconds based on e^(0.06 * t) curve
    const durationMs = Math.round(Math.log(crashMultiplier) / 0.06 * 1000);

    const round: AviatorRound = {
      roundId,
      serverSeed: sSeed,
      clientSeed: cSeed,
      nonce: n,
      crashMultiplier,
      startTime: Date.now(),
      durationMs,
      isCompleted: false,
      bets: new Map(),
    };

    this.activeRounds.set(roundId, round);
    return round;
  }

  /**
   * Places a bet in an active Aviator round
   */
  public placeBet(params: {
    roundId: string;
    userId: string;
    wager: number;
    autoCashoutMultiplier?: number;
  }): AviatorBet {
    const round = this.activeRounds.get(params.roundId);
    if (!round) {
      throw new Error('ROUND_NOT_FOUND');
    }
    if (round.isCompleted) {
      throw new Error('ROUND_ALREADY_COMPLETED');
    }

    const betId = randomUUID();
    const bet: AviatorBet = {
      betId,
      userId: params.userId,
      wager: params.wager,
      autoCashoutMultiplier: params.autoCashoutMultiplier,
      isCashedOut: false,
      timestamp: Date.now(),
    };

    round.bets.set(betId, bet);
    return bet;
  }

  public getBet(roundId: string, betId: string): AviatorBet | undefined {
    return this.activeRounds.get(roundId)?.bets.get(betId);
  }

  /**
   * Cashes out an active bet at the current flight multiplier
   */
  public cashOut(params: {
    roundId: string;
    betId: string;
    currentMultiplier: number;
  }): { bet: AviatorBet; payout: number; won: boolean } {
    const round = this.activeRounds.get(params.roundId);
    if (!round) {
      throw new Error('ROUND_NOT_FOUND');
    }
    const bet = round.bets.get(params.betId);
    if (!bet) {
      throw new Error('BET_NOT_FOUND');
    }
    if (bet.isCashedOut) {
      throw new Error('BET_ALREADY_CASHED_OUT');
    }

    // Check if the current multiplier has already exceeded the crash point
    if (params.currentMultiplier > round.crashMultiplier) {
      bet.isCashedOut = true;
      bet.cashedOutMultiplier = 0;
      bet.payout = 0;
      return { bet, payout: 0, won: false };
    }

    const multiplier = Math.floor(params.currentMultiplier * 100) / 100;
    const payout = parseFloat((bet.wager * multiplier).toFixed(2));

    bet.isCashedOut = true;
    bet.cashedOutMultiplier = multiplier;
    bet.payout = payout;

    return { bet, payout, won: true };
  }

  /**
   * Completes a round, resolving all auto-cashouts and un-cashed bets
   */
  public completeRound(roundId: string): GameRoundResult {
    const round = this.activeRounds.get(roundId);
    if (!round) {
      throw new Error('ROUND_NOT_FOUND');
    }

    round.isCompleted = true;
    let totalWager = 0;
    let totalPayout = 0;

    for (const bet of round.bets.values()) {
      totalWager += bet.wager;

      if (!bet.isCashedOut) {
        // Evaluate auto cashout
        if (bet.autoCashoutMultiplier && bet.autoCashoutMultiplier <= round.crashMultiplier) {
          bet.isCashedOut = true;
          bet.cashedOutMultiplier = bet.autoCashoutMultiplier;
          bet.payout = parseFloat((bet.wager * bet.autoCashoutMultiplier).toFixed(2));
          totalPayout += bet.payout;
        } else {
          bet.isCashedOut = true;
          bet.cashedOutMultiplier = 0;
          bet.payout = 0;
        }
      } else if (bet.payout) {
        totalPayout += bet.payout;
      }
    }

    this.history.unshift({
      roundId: round.roundId,
      crashMultiplier: round.crashMultiplier,
      timestamp: Date.now(),
    });
    if (this.history.length > 50) this.history.pop();

    return {
      roundId: round.roundId,
      gameCode: 'aviator_crash',
      userId: 'multi_user_round',
      wager: parseFloat(totalWager.toFixed(2)),
      payout: parseFloat(totalPayout.toFixed(2)),
      profit: parseFloat((totalPayout - totalWager).toFixed(2)),
      isCompleted: true,
      gameState: {
        crashMultiplier: round.crashMultiplier,
        durationMs: round.durationMs,
        totalBets: round.bets.size,
        history: this.getRecentHistory(10),
      },
    };
  }

  public getRecentHistory(limit: number = 20): Array<{ roundId: string; crashMultiplier: number }> {
    return this.history.slice(0, limit);
  }
}
