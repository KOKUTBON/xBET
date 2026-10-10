import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import { BlackjackEngine } from './blackjack.ts';
import type { Card } from './blackjack.ts';
import type { GameRoundResult } from './base-game.ts';
import { randomUUID } from 'crypto';

export class HighLowEngine {
  private static readonly RANK_VALUES: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };

  /**
   * Calculates dynamic odds for Higher and Lower based on current base card
   */
  public static calculateOdds(currentCard: Card): { higherOdds: number; lowerOdds: number } {
    const currentRank = this.RANK_VALUES[currentCard.value] || 7;
    // Ranks range 2..14 (13 possible ranks)
    const higherCount = 14 - currentRank;
    const lowerCount = currentRank - 2;

    const houseMargin = 0.94; // 6% RTP margin

    const higherOdds = higherCount > 0 ? parseFloat(((12 / higherCount) * houseMargin).toFixed(2)) : 12.0;
    const lowerOdds = lowerCount > 0 ? parseFloat(((12 / lowerCount) * houseMargin).toFixed(2)) : 12.0;

    return {
      higherOdds: Math.max(1.05, higherOdds),
      lowerOdds: Math.max(1.05, lowerOdds),
    };
  }

  public static play(params: {
    userId: string;
    choice: 'HIGHER' | 'LOWER';
    wager: number;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  }): GameRoundResult {
    const roundId = randomUUID();
    const shoe = ProvablyFairRNG.shuffle(BlackjackEngine.createDeck(), params.serverSeed, params.clientSeed, params.nonce);

    const baseCard = shoe.pop()!;
    const nextCard = shoe.pop()!;

    const baseRank = this.RANK_VALUES[baseCard.value] || 7;
    const nextRank = this.RANK_VALUES[nextCard.value] || 7;

    const odds = this.calculateOdds(baseCard);
    const chosenOdd = params.choice === 'HIGHER' ? odds.higherOdds : odds.lowerOdds;

    let won = false;
    let isTie = baseRank === nextRank;

    if (params.choice === 'HIGHER' && nextRank > baseRank) {
      won = true;
    } else if (params.choice === 'LOWER' && nextRank < baseRank) {
      won = true;
    }

    const payout = won ? parseFloat((params.wager * chosenOdd).toFixed(2)) : isTie ? params.wager : 0;

    return {
      roundId,
      gameCode: 'highlow',
      userId: params.userId,
      wager: params.wager,
      payout,
      profit: parseFloat((payout - params.wager).toFixed(2)),
      isCompleted: true,
      gameState: {
        baseCard,
        nextCard,
        baseRank,
        nextRank,
        choice: params.choice,
        chosenOdd,
        won,
        isTie,
        message: won ? `Won with ${params.choice}! (${nextCard.value} vs ${baseCard.value})` : `Lost with ${params.choice}.`,
      },
    };
  }
}
