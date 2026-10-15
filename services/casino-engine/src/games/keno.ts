import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import type { GameRoundResult } from './base-game.ts';
import { randomUUID } from 'crypto';

export class KenoEngine {
  // Paytable multiplier matrix: Map<pickedCount, Map<matchedCount, multiplier>>
  private static readonly PAYTABLE: Record<number, Record<number, number>> = {
    1: { 1: 3.5 },
    2: { 1: 1.0, 2: 9.0 },
    3: { 2: 2.5, 3: 45.0 },
    4: { 2: 1.5, 3: 5.0, 4: 120.0 },
    5: { 3: 3.0, 4: 15.0, 5: 500.0 },
    6: { 3: 2.0, 4: 6.0, 5: 60.0, 6: 1500.0 },
    7: { 4: 4.0, 5: 20.0, 6: 150.0, 7: 4000.0 },
    8: { 4: 2.0, 5: 10.0, 6: 50.0, 7: 400.0, 8: 10000.0 },
    9: { 5: 5.0, 6: 25.0, 7: 150.0, 8: 1000.0, 9: 25000.0 },
    10: { 5: 3.0, 6: 15.0, 7: 80.0, 8: 500.0, 9: 2500.0, 10: 100000.0 },
  };

  public static play(params: {
    userId: string;
    pickedNumbers: number[];
    wager: number;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  }): GameRoundResult {
    const roundId = randomUUID();
    const pickedCount = params.pickedNumbers.length;

    if (pickedCount < 1 || pickedCount > 10) {
      throw new Error('KENO_INVALID_PICKS: Must pick between 1 and 10 numbers');
    }

    // Generate 20 drawn numbers out of 80 using Provably Fair RNG
    const pool = Array.from({ length: 80 }, (_, i) => i + 1);
    const shuffled = ProvablyFairRNG.shuffle(pool, params.serverSeed, params.clientSeed, params.nonce);
    const drawnNumbers = shuffled.slice(0, 20).sort((a, b) => a - b);

    // Count hits
    const pickedSet = new Set(params.pickedNumbers);
    const hitNumbers = drawnNumbers.filter((n) => pickedSet.has(n));
    const matchedCount = hitNumbers.length;

    // Determine multiplier
    const multiplier = this.PAYTABLE[pickedCount]?.[matchedCount] || 0;
    const payout = parseFloat((params.wager * multiplier).toFixed(2));

    return {
      roundId,
      gameCode: 'keno',
      userId: params.userId,
      wager: params.wager,
      payout,
      profit: parseFloat((payout - params.wager).toFixed(2)),
      isCompleted: true,
      gameState: {
        pickedNumbers: params.pickedNumbers,
        drawnNumbers,
        hitNumbers,
        matchedCount,
        multiplier,
        won: payout > 0,
      },
    };
  }
}
