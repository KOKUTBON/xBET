import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import type { GameRoundResult } from './base-game.ts';
import { randomUUID } from 'crypto';

export class BingoEngine {
  public static play(params: {
    userId: string;
    wager: number;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  }): GameRoundResult {
    const roundId = randomUUID();

    // Generate 5x5 card (numbers 1-75, column B:1-15, I:16-30, N:31-45, G:46-60, O:61-75)
    const card: number[][] = [];
    for (let col = 0; col < 5; col++) {
      const min = col * 15 + 1;
      const max = (col + 1) * 15;
      const colPool = Array.from({ length: 15 }, (_, i) => min + i);
      const shuffledCol = ProvablyFairRNG.shuffle(colPool, params.serverSeed, params.clientSeed, params.nonce + col);
      card.push(shuffledCol.slice(0, 5));
    }

    // Free center spot
    card[2][2] = 0;

    // Draw 35 balls out of 75
    const ballPool = Array.from({ length: 75 }, (_, i) => i + 1);
    const drawnBalls = ProvablyFairRNG.shuffle(ballPool, params.serverSeed, params.clientSeed, params.nonce + 10).slice(0, 35);
    const drawnSet = new Set([...drawnBalls, 0]);

    // Check completed lines (5 rows, 5 cols, 2 diagonals)
    let completedLines = 0;

    // Rows
    for (let r = 0; r < 5; r++) {
      if (card.every((col) => drawnSet.has(col[r]))) completedLines++;
    }

    // Cols
    for (let c = 0; c < 5; c++) {
      if (card[c].every((num) => drawnSet.has(num))) completedLines++;
    }

    let multiplier = 0;
    if (completedLines >= 5) multiplier = 500; // Full house
    else if (completedLines >= 2) multiplier = 20;
    else if (completedLines >= 1) multiplier = 3;

    const payout = parseFloat((params.wager * multiplier).toFixed(2));

    return {
      roundId,
      gameCode: 'bingo',
      userId: params.userId,
      wager: params.wager,
      payout,
      profit: parseFloat((payout - params.wager).toFixed(2)),
      isCompleted: true,
      gameState: {
        card,
        drawnBalls,
        completedLines,
        multiplier,
        won: payout > 0,
      },
    };
  }
}
