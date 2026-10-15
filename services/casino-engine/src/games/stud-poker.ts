import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import { BlackjackEngine } from './blackjack.ts';
import type { Card } from './blackjack.ts';
import type { GameRoundResult } from './base-game.ts';
import { randomUUID } from 'crypto';

export type PokerHandRank =
  | 'HIGH_CARD'
  | 'ACE_KING'
  | 'ONE_PAIR'
  | 'TWO_PAIR'
  | 'THREE_OF_A_KIND'
  | 'STRAIGHT'
  | 'FLUSH'
  | 'FULL_HOUSE'
  | 'FOUR_OF_A_KIND'
  | 'STRAIGHT_FLUSH'
  | 'ROYAL_FLUSH';

export interface PokerHandEvaluation {
  rank: PokerHandRank;
  rankValue: number; // 0 to 9 for sorting
  qualifies: boolean; // Dealer qualifies on Ace-King or better
  description: string;
}

export class CaribbeanStudPokerEngine {
  private static readonly CARD_VALUES_MAP: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };

  private static readonly PAYTABLE: Record<PokerHandRank, number> = {
    ROYAL_FLUSH: 100,
    STRAIGHT_FLUSH: 50,
    FOUR_OF_A_KIND: 20,
    FULL_HOUSE: 7,
    FLUSH: 5,
    STRAIGHT: 4,
    THREE_OF_A_KIND: 3,
    TWO_PAIR: 2,
    ONE_PAIR: 1,
    ACE_KING: 1,
    HIGH_CARD: 1,
  };

  public static evaluateHand(cards: Card[]): PokerHandEvaluation {
    if (cards.length !== 5) {
      return { rank: 'HIGH_CARD', rankValue: 0, qualifies: false, description: 'High Card' };
    }

    const values = cards.map((c) => this.CARD_VALUES_MAP[c.value] || 0).sort((a, b) => b - a);
    const suits = cards.map((c) => c.suit);

    const isFlush = suits.every((s) => s === suits[0]);
    const isStraight =
      (values[0] - values[4] === 4 && new Set(values).size === 5) ||
      (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2); // Ace-low straight

    const valueCounts: Record<number, number> = {};
    for (const v of values) {
      valueCounts[v] = (valueCounts[v] || 0) + 1;
    }

    const counts = Object.values(valueCounts).sort((a, b) => b - a);

    if (isFlush && isStraight && values[0] === 14 && values[1] === 13) {
      return { rank: 'ROYAL_FLUSH', rankValue: 9, qualifies: true, description: 'Royal Flush' };
    }
    if (isFlush && isStraight) {
      return { rank: 'STRAIGHT_FLUSH', rankValue: 8, qualifies: true, description: 'Straight Flush' };
    }
    if (counts[0] === 4) {
      return { rank: 'FOUR_OF_A_KIND', rankValue: 7, qualifies: true, description: 'Four of a Kind' };
    }
    if (counts[0] === 3 && counts[1] === 2) {
      return { rank: 'FULL_HOUSE', rankValue: 6, qualifies: true, description: 'Full House' };
    }
    if (isFlush) {
      return { rank: 'FLUSH', rankValue: 5, qualifies: true, description: 'Flush' };
    }
    if (isStraight) {
      return { rank: 'STRAIGHT', rankValue: 4, qualifies: true, description: 'Straight' };
    }
    if (counts[0] === 3) {
      return { rank: 'THREE_OF_A_KIND', rankValue: 3, qualifies: true, description: 'Three of a Kind' };
    }
    if (counts[0] === 2 && counts[1] === 2) {
      return { rank: 'TWO_PAIR', rankValue: 2, qualifies: true, description: 'Two Pair' };
    }
    if (counts[0] === 2) {
      return { rank: 'ONE_PAIR', rankValue: 1, qualifies: true, description: 'One Pair' };
    }

    const hasAceKing = values.includes(14) && values.includes(13);
    if (hasAceKing) {
      return { rank: 'ACE_KING', rankValue: 0.5, qualifies: true, description: 'Ace-King High' };
    }

    return { rank: 'HIGH_CARD', rankValue: 0, qualifies: false, description: 'High Card' };
  }

  /**
   * Deal initial 5 cards to Player and Dealer
   */
  public static deal(params: {
    userId: string;
    anteWager: number;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  }): GameRoundResult {
    const roundId = randomUUID();
    const shoe = ProvablyFairRNG.shuffle(BlackjackEngine.createDeck(), params.serverSeed, params.clientSeed, params.nonce);

    const playerHand: Card[] = [shoe.pop()!, shoe.pop()!, shoe.pop()!, shoe.pop()!, shoe.pop()!];
    const dealerHand: Card[] = [shoe.pop()!, shoe.pop()!, shoe.pop()!, shoe.pop()!, shoe.pop()!];

    const playerEval = this.evaluateHand(playerHand);

    return {
      roundId,
      gameCode: 'stud',
      userId: params.userId,
      wager: params.anteWager,
      payout: 0,
      profit: -params.anteWager,
      isCompleted: false,
      gameState: {
        playerHand,
        playerEval,
        dealerVisibleCard: dealerHand[0],
        _hiddenDealerHand: dealerHand,
        anteWager: params.anteWager,
        status: 'AWAITING_CALL_OR_FOLD',
      },
    };
  }

  /**
   * Action: Call (Places 2x Ante bet and compares hands)
   */
  public static call(gameState: Record<string, unknown>, userId: string, roundId: string): GameRoundResult {
    const playerHand = gameState.playerHand as Card[];
    const dealerHand = gameState._hiddenDealerHand as Card[];
    const anteWager = Number(gameState.anteWager || 10);
    const callWager = anteWager * 2;
    const totalWager = anteWager + callWager;

    const playerEval = this.evaluateHand(playerHand);
    const dealerEval = this.evaluateHand(dealerHand);

    let payout = 0;
    let message = '';

    if (!dealerEval.qualifies) {
      // Dealer does not qualify: Ante pays 1:1, Call bet pushes (returned)
      payout = anteWager * 2.0 + callWager;
      message = `Dealer does not qualify (${dealerEval.description}). Ante pays 1:1 and Call pushes!`;
    } else {
      // Dealer qualifies: Compare hand rank values
      if (playerEval.rankValue > dealerEval.rankValue) {
        // Player wins: Ante pays 1:1, Call bet pays per paytable
        const callMultiplier = this.PAYTABLE[playerEval.rank] || 1;
        const antePayout = anteWager * 2.0;
        const callPayout = callWager + callWager * callMultiplier;
        payout = antePayout + callPayout;
        message = `You win! ${playerEval.description} beats Dealer ${dealerEval.description}.`;
      } else if (playerEval.rankValue < dealerEval.rankValue) {
        payout = 0;
        message = `Dealer wins! Dealer ${dealerEval.description} beats ${playerEval.description}.`;
      } else {
        // Tie / Push
        payout = totalWager;
        message = `Push! Both hold ${playerEval.description}.`;
      }
    }

    return {
      roundId,
      gameCode: 'stud',
      userId,
      wager: totalWager,
      payout: parseFloat(payout.toFixed(2)),
      profit: parseFloat((payout - totalWager).toFixed(2)),
      isCompleted: true,
      gameState: {
        playerHand,
        playerEval,
        dealerHand,
        dealerEval,
        anteWager,
        callWager,
        message,
        status: payout > totalWager ? 'PLAYER_WIN' : payout === totalWager ? 'PUSH' : 'DEALER_WIN',
      },
    };
  }

  /**
   * Action: Fold (Player forfeits Ante)
   */
  public static fold(gameState: Record<string, unknown>, userId: string, roundId: string): GameRoundResult {
    const anteWager = Number(gameState.anteWager || 10);
    return {
      roundId,
      gameCode: 'stud',
      userId,
      wager: anteWager,
      payout: 0,
      profit: -anteWager,
      isCompleted: true,
      gameState: {
        ...gameState,
        message: 'You folded. Ante forfeited.',
        status: 'PLAYER_FOLD',
      },
    };
  }
}
