/**
 * Lucky 6 / Lucky Balls Engine
 * Classic European lottery game: 35 balls drawn from a drum of 48 colored balls.
 * Punters select 6 numbers. Payout multiplier is determined by which ball index completes the 6th match.
 */

import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import { randomUUID } from 'crypto';
import type { GameRoundResult } from './base-game.ts';

export interface LuckyBallItem {
  number: number;
  color: 'RED' | 'GREEN' | 'BLUE' | 'PURPLE' | 'BROWN' | 'YELLOW' | 'ORANGE' | 'BLACK';
}

export class LuckyBallsEngine {
  private static readonly COLORS: Array<LuckyBallItem['color']> = [
    'RED', 'GREEN', 'BLUE', 'PURPLE', 'BROWN', 'YELLOW', 'ORANGE', 'BLACK'
  ];

  // Multiplier for completed 6-number match on ball draw index (from 6th ball to 35th ball)
  private static readonly PAYOUT_TIERS: Record<number, number> = {
    6: 10000, 7: 7500, 8: 5000, 9: 2500, 10: 1000,
    11: 500, 12: 300, 13: 200, 14: 150, 15: 100,
    16: 90, 17: 80, 18: 70, 19: 60, 20: 50,
    21: 40, 22: 30, 23: 25, 24: 20, 25: 15,
    26: 10, 27: 9, 28: 8, 29: 7, 30: 6,
    31: 5, 32: 4, 33: 3, 34: 2, 35: 1,
  };

  public static draw(params: {
    userId: string;
    pickedNumbers: number[]; // 6 distinct numbers [1-48]
    wager: number;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  }): GameRoundResult {
    const roundId = randomUUID();

    if (!Array.isArray(params.pickedNumbers) || params.pickedNumbers.length !== 6) {
      throw new Error('MUST_PICK_EXACTLY_6_NUMBERS');
    }

    const pickedSet = new Set(params.pickedNumbers);

    // Create 48-ball drum
    const drum: LuckyBallItem[] = [];
    for (let i = 1; i <= 48; i++) {
      const colorIndex = (i - 1) % this.COLORS.length;
      drum.push({ number: i, color: this.COLORS[colorIndex] });
    }

    // Shuffle drum with Provably Fair RNG
    const shuffled = ProvablyFairRNG.shuffle(drum, params.serverSeed, params.clientSeed, params.nonce);

    // Draw 35 balls
    const drawnBalls = shuffled.slice(0, 35);
    const matchedNumbers: number[] = [];
    let winningBallIndex: number | null = null;
    let multiplier = 0;

    for (let i = 0; i < drawnBalls.length; i++) {
      const ball = drawnBalls[i];
      if (pickedSet.has(ball.number)) {
        matchedNumbers.push(ball.number);
        if (matchedNumbers.length === 6 && winningBallIndex === null) {
          winningBallIndex = i + 1; // 1-indexed (e.g. 6th ball to 35th ball)
          multiplier = this.PAYOUT_TIERS[winningBallIndex] || 0;
        }
      }
    }

    const payout = parseFloat((params.wager * multiplier).toFixed(2));

    return {
      roundId,
      gameCode: 'lucky_balls_6',
      userId: params.userId,
      wager: params.wager,
      payout,
      profit: parseFloat((payout - params.wager).toFixed(2)),
      isCompleted: true,
      gameState: {
        pickedNumbers: params.pickedNumbers,
        drawnBalls: drawnBalls.map((b) => ({ number: b.number, color: b.color })),
        matchedNumbers,
        matchedCount: matchedNumbers.length,
        winningBallIndex,
        multiplier,
      },
    };
  }
}
