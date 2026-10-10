/**
 * Plinko Pegboard Engine
 * Physics-based binary peg drop simulation across 8-16 rows
 * with Low, Medium, and High volatility risk profiles.
 */

import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import { randomUUID } from 'crypto';
import type { GameRoundResult } from './base-game.ts';

export type PlinkoRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export class PlinkoEngine {
  // Payout multiplier matrices: [risk][rows][slotIndex]
  private static readonly PAYOUT_TABLES: Record<PlinkoRisk, Record<number, number[]>> = {
    LOW: {
      8: [5.6, 2.1, 1.1, 1, 0.5, 1, 1.1, 2.1, 5.6],
      10: [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
      12: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
      16: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    },
    MEDIUM: {
      8: [13, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 13],
      10: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
      12: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
      16: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    },
    HIGH: {
      8: [29, 4, 1.5, 0.3, 0.2, 0.3, 1.5, 4, 29],
      10: [76, 10, 3, 0.9, 0.2, 0.2, 0.2, 0.9, 3, 10, 76],
      12: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
      16: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
    },
  };

  public static drop(params: {
    userId: string;
    wager: number;
    rows?: number; // 8, 10, 12, 16 (default 8)
    risk?: PlinkoRisk; // LOW, MEDIUM, HIGH (default MEDIUM)
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  }): GameRoundResult {
    const roundId = randomUUID();
    const rows = [8, 10, 12, 16].includes(params.rows || 0) ? (params.rows as number) : 8;
    const risk = params.risk || 'MEDIUM';

    // Simulate peg decisions: 0 = left, 1 = right
    const path: number[] = [];
    let rightCount = 0;

    for (let i = 0; i < rows; i++) {
      // 0 or 1
      const direction = ProvablyFairRNG.generateInt(0, 1, params.serverSeed, params.clientSeed, params.nonce, i);
      path.push(direction);
      if (direction === 1) rightCount++;
    }

    const slotIndex = rightCount;
    const paytable = this.PAYOUT_TABLES[risk][rows] || this.PAYOUT_TABLES.MEDIUM[8];
    const multiplier = paytable[slotIndex] ?? 1.0;
    const payout = parseFloat((params.wager * multiplier).toFixed(2));

    return {
      roundId,
      gameCode: 'plinko',
      userId: params.userId,
      wager: params.wager,
      payout,
      profit: parseFloat((payout - params.wager).toFixed(2)),
      isCompleted: true,
      gameState: {
        rows,
        risk,
        path,
        slotIndex,
        multiplier,
        paytable,
      },
    };
  }
}
