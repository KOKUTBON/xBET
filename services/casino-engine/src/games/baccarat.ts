import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import type { GameRoundResult } from './base-game.ts';
import { randomUUID } from 'crypto';
import { BlackjackEngine } from './blackjack.ts';
import type { Card } from './blackjack.ts';

export class BaccaratEngine {
  public static calculateBaccaratScore(hand: Card[]): number {
    let total = 0;
    for (const card of hand) {
      if (['10', 'J', 'Q', 'K'].includes(card.value)) {
        total += 0;
      } else if (card.value === 'A') {
        total += 1;
      } else {
        total += parseInt(card.value, 10);
      }
    }
    return total % 10;
  }

  public static play(params: {
    userId: string;
    betSide: 'PLAYER' | 'BANKER' | 'TIE';
    wager: number;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  }): GameRoundResult {
    const roundId = randomUUID();
    const shoe = ProvablyFairRNG.shuffle(BlackjackEngine.createDeck(), params.serverSeed, params.clientSeed, params.nonce);

    const playerHand: Card[] = [shoe.pop()!, shoe.pop()!];
    const bankerHand: Card[] = [shoe.pop()!, shoe.pop()!];

    let playerScore = this.calculateBaccaratScore(playerHand);
    let bankerScore = this.calculateBaccaratScore(bankerHand);

    // Natural 8 or 9 check
    const isNatural = playerScore >= 8 || bankerScore >= 8;

    if (!isNatural) {
      // Player drawing rule
      let playerThirdCard: Card | null = null;
      if (playerScore <= 5) {
        playerThirdCard = shoe.pop()!;
        playerHand.push(playerThirdCard);
        playerScore = this.calculateBaccaratScore(playerHand);
      }

      // Banker drawing rule
      if (!playerThirdCard) {
        // Player stood with 6 or 7: Banker draws on 0-5, stands on 6-7
        if (bankerScore <= 5) {
          bankerHand.push(shoe.pop()!);
          bankerScore = this.calculateBaccaratScore(bankerHand);
        }
      } else {
        // Player drew third card: Banker acts based on player's third card value
        const p3Val = ['10', 'J', 'Q', 'K'].includes(playerThirdCard.value)
          ? 0
          : playerThirdCard.value === 'A'
          ? 1
          : parseInt(playerThirdCard.value, 10);

        let bankerDraws = false;
        if (bankerScore <= 2) bankerDraws = true;
        else if (bankerScore === 3 && p3Val !== 8) bankerDraws = true;
        else if (bankerScore === 4 && [2, 3, 4, 5, 6, 7].includes(p3Val)) bankerDraws = true;
        else if (bankerScore === 5 && [4, 5, 6, 7].includes(p3Val)) bankerDraws = true;
        else if (bankerScore === 6 && [6, 7].includes(p3Val)) bankerDraws = true;

        if (bankerDraws) {
          bankerHand.push(shoe.pop()!);
          bankerScore = this.calculateBaccaratScore(bankerHand);
        }
      }
    }

    let winner: 'PLAYER' | 'BANKER' | 'TIE';
    if (playerScore > bankerScore) winner = 'PLAYER';
    else if (bankerScore > playerScore) winner = 'BANKER';
    else winner = 'TIE';

    let payout = 0;
    if (params.betSide === winner) {
      if (winner === 'PLAYER') {
        payout = params.wager * 2.0; // 1:1 payout
      } else if (winner === 'BANKER') {
        payout = parseFloat((params.wager * 1.95).toFixed(2)); // 5% house commission (0.95:1)
      } else if (winner === 'TIE') {
        payout = params.wager * 9.0; // 8:1 payout + stake returned
      }
    } else if (winner === 'TIE' && (params.betSide === 'PLAYER' || params.betSide === 'BANKER')) {
      payout = params.wager; // Push on Tie for main bets
    }

    return {
      roundId,
      gameCode: 'baccarat_pro',
      userId: params.userId,
      wager: params.wager,
      payout,
      profit: parseFloat((payout - params.wager).toFixed(2)),
      isCompleted: true,
      gameState: {
        playerHand,
        playerScore,
        bankerHand,
        bankerScore,
        winner,
        betSide: params.betSide,
        isNatural,
      },
    };
  }
}
