import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import type { GameRoundResult } from './base-game.ts';
import { randomUUID } from 'crypto';

export class ScratchCardEngine {
  private static readonly PRIZE_TIERS = [1, 2, 5, 10, 25, 50, 100, 500, 1000, 5000];

  public static play(params: {
    userId: string;
    wager: number;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  }): GameRoundResult {
    const roundId = randomUUID();

    // Determine if this ticket is a winning ticket based on RNG float
    const winRoll = ProvablyFairRNG.generateFloat(params.serverSeed, params.clientSeed, params.nonce, 0);

    let isWinner = false;
    let winMultiplier = 0;

    if (winRoll < 0.0001) winMultiplier = 1000;
    else if (winRoll < 0.001) winMultiplier = 100;
    else if (winRoll < 0.01) winMultiplier = 20;
    else if (winRoll < 0.05) winMultiplier = 5;
    else if (winRoll < 0.15) winMultiplier = 2;
    else if (winRoll < 0.35) winMultiplier = 1;

    isWinner = winMultiplier > 0;
    const winAmount = parseFloat((params.wager * winMultiplier).toFixed(2));

    // Generate 3x3 grid (9 spots)
    const grid: number[] = [];
    if (isWinner) {
      // Put 3 winning symbols in random positions
      grid.push(winAmount, winAmount, winAmount);
      // Fill remaining 6 with distinct non-matching prizes
      for (let i = 0; i < 6; i++) {
        const dummyPrize = this.PRIZE_TIERS[(i + 2) % this.PRIZE_TIERS.length] * params.wager;
        grid.push(dummyPrize);
      }
    } else {
      // Ensure no 3 matching symbols
      for (let i = 0; i < 9; i++) {
        const tier = this.PRIZE_TIERS[i % this.PRIZE_TIERS.length] * params.wager;
        grid.push(tier);
      }
    }

    // Shuffle grid positions
    const finalGrid = ProvablyFairRNG.shuffle(grid, params.serverSeed, params.clientSeed, params.nonce + 1);

    return {
      roundId,
      gameCode: 'scratch',
      userId: params.userId,
      wager: params.wager,
      payout: winAmount,
      profit: parseFloat((winAmount - params.wager).toFixed(2)),
      isCompleted: true,
      gameState: {
        grid: [
          [finalGrid[0], finalGrid[1], finalGrid[2]],
          [finalGrid[3], finalGrid[4], finalGrid[5]],
          [finalGrid[6], finalGrid[7], finalGrid[8]],
        ],
        isWinner,
        winAmount,
        winMultiplier,
      },
    };
  }
}
