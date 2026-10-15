import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import type { GameRoundResult } from './base-game.ts';
import { randomUUID } from 'crypto';

export interface RouletteBet {
  type: 'STRAIGHT' | 'SPLIT' | 'STREET' | 'CORNER' | 'SIX_LINE' | 'DOZEN' | 'COLUMN' | 'RED' | 'BLACK' | 'EVEN' | 'ODD' | 'LOW' | 'HIGH';
  value: string | number; // e.g. 17, 'RED', 'DOZEN_1', 'SPLIT_17_18'
  amount: number;
}

export class EuropeanRouletteEngine {
  private static readonly RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  private static readonly BLACK_NUMBERS = new Set([2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]);

  public static spin(params: {
    userId: string;
    bets: RouletteBet[];
    serverSeed: string;
    clientSeed: string;
    nonce: number;
    roundId?: string;
  }): GameRoundResult {
    const roundId = params.roundId || randomUUID();
    let totalWager = 0;
    for (const b of params.bets) {
      if (!Number.isFinite(b.amount) || b.amount <= 0) {
        throw new Error('INVALID_BET_AMOUNT');
      }
      totalWager += b.amount;
    }

    // Cryptographically unbiased Provably Fair wheel spin in [0, 36] via rejection sampling
    const { value: winningNumber } = ProvablyFairRNG.generateUnbiasedInt(0, 36, params.serverSeed, params.clientSeed, params.nonce);

    const winningColor = winningNumber === 0 ? 'GREEN' : this.RED_NUMBERS.has(winningNumber) ? 'RED' : 'BLACK';
    const isEven = winningNumber !== 0 && winningNumber % 2 === 0;
    const isOdd = winningNumber !== 0 && winningNumber % 2 !== 0;
    const isLow = winningNumber >= 1 && winningNumber <= 18;
    const isHigh = winningNumber >= 19 && winningNumber <= 36;

    let totalPayout = 0;
    const betResults: Array<{ bet: RouletteBet; won: boolean; payout: number }> = [];

    for (const bet of params.bets) {
      let won = false;
      let multiplier = 0;

      switch (bet.type) {
        case 'STRAIGHT':
          if (Number(bet.value) === winningNumber) {
            won = true;
            multiplier = 35; // 35:1 + stake returned = 36x
          }
          break;

        case 'RED':
          if (winningColor === 'RED') {
            won = true;
            multiplier = 1; // 1:1
          }
          break;

        case 'BLACK':
          if (winningColor === 'BLACK') {
            won = true;
            multiplier = 1;
          }
          break;

        case 'EVEN':
          if (isEven) {
            won = true;
            multiplier = 1;
          }
          break;

        case 'ODD':
          if (isOdd) {
            won = true;
            multiplier = 1;
          }
          break;

        case 'LOW':
          if (isLow) {
            won = true;
            multiplier = 1;
          }
          break;

        case 'HIGH':
          if (isHigh) {
            won = true;
            multiplier = 1;
          }
          break;

        case 'DOZEN':
          if (
            (bet.value === 'DOZEN_1' && winningNumber >= 1 && winningNumber <= 12) ||
            (bet.value === 'DOZEN_2' && winningNumber >= 13 && winningNumber <= 24) ||
            (bet.value === 'DOZEN_3' && winningNumber >= 25 && winningNumber <= 36)
          ) {
            won = true;
            multiplier = 2; // 2:1
          }
          break;
      }

      const payout = won ? bet.amount * (multiplier + 1) : 0;
      totalPayout += payout;
      betResults.push({ bet, won, payout });
    }

    return {
      roundId,
      gameCode: 'roulette_european',
      userId: params.userId,
      wager: totalWager,
      payout: parseFloat(totalPayout.toFixed(2)),
      profit: parseFloat((totalPayout - totalWager).toFixed(2)),
      isCompleted: true,
      gameState: {
        winningNumber,
        winningColor,
        isEven,
        isOdd,
        isLow,
        isHigh,
        betResults,
      },
      serverSeedHash: ProvablyFairRNG.hashServerSeed(params.serverSeed),
      serverSeed: params.serverSeed,
      clientSeed: params.clientSeed,
      nonce: params.nonce,
    };
  }
}
