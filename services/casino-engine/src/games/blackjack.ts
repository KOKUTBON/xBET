import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import type { GameRoundResult } from './base-game.ts';
import { randomUUID } from 'crypto';

export interface Card {
  suit: '♠' | '♥' | '♦' | '♣';
  value: string; // '2'-'10', 'J', 'Q', 'K', 'A'
  points: number;
}

export interface BlackjackState {
  playerHand: Card[];
  playerScore: number;
  dealerHand: Card[];
  dealerScore: number;
  dealerHoleCardHidden: boolean;
  canHit: boolean;
  canStand: boolean;
  canDouble: boolean;
  canSplit: boolean;
  gameStatus: 'IN_PROGRESS' | 'PLAYER_BLACKJACK' | 'DEALER_BLACKJACK' | 'PLAYER_BUST' | 'DEALER_BUST' | 'PLAYER_WIN' | 'DEALER_WIN' | 'PUSH';
  message: string;
}

export class BlackjackEngine {
  private static readonly SUITS: Array<'♠' | '♥' | '♦' | '♣'> = ['♠', '♥', '♦', '♣'];
  private static readonly VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  public static createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of this.SUITS) {
      for (const val of this.VALUES) {
        let points = parseInt(val, 10);
        if (['J', 'Q', 'K'].includes(val)) points = 10;
        if (val === 'A') points = 11;
        deck.push({ suit, value: val, points });
      }
    }
    return deck;
  }

  public static calculateHandScore(hand: Card[]): number {
    let score = 0;
    let aces = 0;

    for (const card of hand) {
      score += card.points;
      if (card.value === 'A') aces++;
    }

    // Soft Aces adjustment
    while (score > 21 && aces > 0) {
      score -= 10;
      aces--;
    }

    return score;
  }

  public static isBlackjack(hand: Card[]): boolean {
    return hand.length === 2 && this.calculateHandScore(hand) === 21;
  }

  /**
   * Deal initial 2 cards to Player and Dealer
   */
  public static deal(params: {
    roundId?: string;
    userId: string;
    wager: number;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  }): GameRoundResult {
    const roundId = params.roundId || randomUUID();
    const shoe = ProvablyFairRNG.shuffle(this.createDeck(), params.serverSeed, params.clientSeed, params.nonce);

    const playerHand: Card[] = [shoe.pop()!, shoe.pop()!];
    const dealerHand: Card[] = [shoe.pop()!, shoe.pop()!];

    const playerScore = this.calculateHandScore(playerHand);
    const dealerScore = this.calculateHandScore([dealerHand[0]]); // visible card score

    const playerHasBJ = this.isBlackjack(playerHand);
    const dealerHasBJ = this.isBlackjack(dealerHand);

    let payout = 0;
    let isCompleted = false;
    let gameStatus: BlackjackState['gameStatus'] = 'IN_PROGRESS';
    let message = 'Your turn. Hit or Stand?';

    if (playerHasBJ && dealerHasBJ) {
      // Push: return stake
      payout = params.wager;
      isCompleted = true;
      gameStatus = 'PUSH';
      message = 'Both have Blackjack! Push.';
    } else if (playerHasBJ) {
      // Natural Blackjack pays 3:2 (2.5x total payout)
      payout = parseFloat((params.wager * 2.5).toFixed(2));
      isCompleted = true;
      gameStatus = 'PLAYER_BLACKJACK';
      message = 'Blackjack! You win 3:2!';
    } else if (dealerHasBJ) {
      payout = 0;
      isCompleted = true;
      gameStatus = 'DEALER_BLACKJACK';
      message = 'Dealer has Blackjack! House wins.';
    }

    const state: BlackjackState = {
      playerHand,
      playerScore,
      dealerHand: isCompleted ? dealerHand : [dealerHand[0]],
      dealerScore: isCompleted ? this.calculateHandScore(dealerHand) : dealerScore,
      dealerHoleCardHidden: !isCompleted,
      canHit: !isCompleted,
      canStand: !isCompleted,
      canDouble: !isCompleted && playerHand.length === 2,
      canSplit: !isCompleted && playerHand[0].value === playerHand[1].value,
      gameStatus,
      message,
    };

    return {
      roundId,
      gameCode: 'blackjack_classic',
      userId: params.userId,
      wager: params.wager,
      payout,
      profit: payout - params.wager,
      isCompleted,
      gameState: { ...state, _hiddenDealerHand: dealerHand, _remainingShoe: shoe },
    };
  }

  /**
   * Action: Hit
   */
  public static hit(gameState: Record<string, unknown>, wager: number, userId: string, roundId: string): GameRoundResult {
    const shoe = (gameState._remainingShoe as Card[]) || this.createDeck();
    const playerHand = gameState.playerHand as Card[];
    const dealerHand = gameState._hiddenDealerHand as Card[];

    playerHand.push(shoe.pop()!);
    const playerScore = this.calculateHandScore(playerHand);

    let payout = 0;
    let isCompleted = false;
    let gameStatus: BlackjackState['gameStatus'] = 'IN_PROGRESS';
    let message = 'Hit or Stand?';

    if (playerScore > 21) {
      payout = 0;
      isCompleted = true;
      gameStatus = 'PLAYER_BUST';
      message = `Bust with ${playerScore}! Dealer wins.`;
    } else if (playerScore === 21) {
      // Automatically proceed to stand
      return this.stand({ ...gameState, playerHand }, wager, userId, roundId);
    }

    const state: BlackjackState = {
      playerHand,
      playerScore,
      dealerHand: isCompleted ? dealerHand : [dealerHand[0]],
      dealerScore: isCompleted ? this.calculateHandScore(dealerHand) : this.calculateHandScore([dealerHand[0]]),
      dealerHoleCardHidden: !isCompleted,
      canHit: !isCompleted,
      canStand: !isCompleted,
      canDouble: false,
      canSplit: false,
      gameStatus,
      message,
    };

    return {
      roundId,
      gameCode: 'blackjack_classic',
      userId,
      wager,
      payout,
      profit: payout - wager,
      isCompleted,
      gameState: { ...state, _hiddenDealerHand: dealerHand, _remainingShoe: shoe },
    };
  }

  /**
   * Action: Stand (Dealer plays out hand)
   */
  public static stand(gameState: Record<string, unknown>, wager: number, userId: string, roundId: string): GameRoundResult {
    const shoe = (gameState._remainingShoe as Card[]) || this.createDeck();
    const playerHand = gameState.playerHand as Card[];
    const dealerHand = gameState._hiddenDealerHand as Card[];

    const playerScore = this.calculateHandScore(playerHand);
    let dealerScore = this.calculateHandScore(dealerHand);

    // Dealer must draw until reaching at least 17
    while (dealerScore < 17) {
      dealerHand.push(shoe.pop()!);
      dealerScore = this.calculateHandScore(dealerHand);
    }

    let payout = 0;
    let gameStatus: BlackjackState['gameStatus'] = 'IN_PROGRESS';
    let message = '';

    if (dealerScore > 21) {
      payout = wager * 2.0; // 1:1 win
      gameStatus = 'DEALER_BUST';
      message = `Dealer busts with ${dealerScore}! You win!`;
    } else if (playerScore > dealerScore) {
      payout = wager * 2.0;
      gameStatus = 'PLAYER_WIN';
      message = `You win! (${playerScore} vs ${dealerScore})`;
    } else if (playerScore < dealerScore) {
      payout = 0;
      gameStatus = 'DEALER_WIN';
      message = `Dealer wins (${dealerScore} vs ${playerScore}).`;
    } else {
      payout = wager; // Push
      gameStatus = 'PUSH';
      message = `Push! (${playerScore} vs ${dealerScore})`;
    }

    const state: BlackjackState = {
      playerHand,
      playerScore,
      dealerHand,
      dealerScore,
      dealerHoleCardHidden: false,
      canHit: false,
      canStand: false,
      canDouble: false,
      canSplit: false,
      gameStatus,
      message,
    };

    return {
      roundId,
      gameCode: 'blackjack_classic',
      userId,
      wager,
      payout,
      profit: payout - wager,
      isCompleted: true,
      gameState: state as unknown as Record<string, unknown>,
    };
  }
}
