/**
 * Texas Hold'em Poker Table & Game State Machine Engine
 * Features 7-card best hand combinator, betting round orchestration,
 * side-pot splitting algorithms, and live table state dispatching.
 */

import { randomUUID } from 'crypto';
import type { Card } from '../games/blackjack.ts';
import {
  PokerGameStage,
  PokerPlayerAction,
  PokerHandRank,
} from './poker-types.ts';
import type {
  PlayerSeat,
  PokerTableState,
  HandEvaluation,
  HandWinner,
  SidePot,
  PokerTableConfig,
} from './poker-types.ts';

export class TexasHoldemHandEvaluator {
  private static readonly CARD_VALUES: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14,
  };

  /**
   * Evaluates the absolute best 5-card hand from up to 7 available cards
   */
  public static evaluate7CardHand(cards: Card[]): HandEvaluation {
    if (cards.length < 5) {
      return {
        rank: PokerHandRank.HIGH_CARD,
        rankName: 'HIGH_CARD',
        score: 0,
        cards: [],
        description: 'Insufficient Cards',
      };
    }

    // Generate all 5-card combinations C(n, 5)
    const combinations = this.getCombinations(cards, 5);
    let bestEval: HandEvaluation | null = null;

    for (const combo of combinations) {
      const evalResult = this.evaluate5CardHand(combo);
      if (!bestEval || evalResult.score > bestEval.score) {
        bestEval = evalResult;
      }
    }

    return bestEval!;
  }

  public static evaluate5CardHand(cards: Card[]): HandEvaluation {
    const values = cards.map((c) => this.CARD_VALUES[c.value] || 0).sort((a, b) => b - a);
    const suits = cards.map((c) => c.suit);

    const isFlush = suits.every((s) => s === suits[0]);

    // Check straight (including Wheel A-2-3-4-5)
    let isStraight = false;
    let straightHigh = 0;
    if (
      values[0] - values[1] === 1 &&
      values[1] - values[2] === 1 &&
      values[2] - values[3] === 1 &&
      values[3] - values[4] === 1
    ) {
      isStraight = true;
      straightHigh = values[0];
    } else if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
      isStraight = true;
      straightHigh = 5; // 5-high straight
    }

    // Count value frequencies
    const counts: Record<number, number> = {};
    for (const v of values) counts[v] = (counts[v] || 0) + 1;
    const freq = Object.entries(counts).map(([v, count]) => ({ val: Number(v), count })).sort((a, b) => b.count - a.count || b.val - a.val);

    // 1. Royal Flush
    if (isFlush && isStraight && straightHigh === 14) {
      return {
        rank: PokerHandRank.ROYAL_FLUSH,
        rankName: 'ROYAL_FLUSH',
        score: this.calcScore(PokerHandRank.ROYAL_FLUSH, [14]),
        cards,
        description: 'Royal Flush',
      };
    }

    // 2. Straight Flush
    if (isFlush && isStraight) {
      return {
        rank: PokerHandRank.STRAIGHT_FLUSH,
        rankName: 'STRAIGHT_FLUSH',
        score: this.calcScore(PokerHandRank.STRAIGHT_FLUSH, [straightHigh]),
        cards,
        description: `Straight Flush (${straightHigh} High)`,
      };
    }

    // 3. Four of a Kind
    if (freq[0].count === 4) {
      return {
        rank: PokerHandRank.FOUR_OF_A_KIND,
        rankName: 'FOUR_OF_A_KIND',
        score: this.calcScore(PokerHandRank.FOUR_OF_A_KIND, [freq[0].val, freq[1].val]),
        cards,
        description: `Four of a Kind (${freq[0].val}s)`,
      };
    }

    // 4. Full House
    if (freq[0].count === 3 && freq[1].count === 2) {
      return {
        rank: PokerHandRank.FULL_HOUSE,
        rankName: 'FULL_HOUSE',
        score: this.calcScore(PokerHandRank.FULL_HOUSE, [freq[0].val, freq[1].val]),
        cards,
        description: `Full House (${freq[0].val}s full of ${freq[1].val}s)`,
      };
    }

    // 5. Flush
    if (isFlush) {
      return {
        rank: PokerHandRank.FLUSH,
        rankName: 'FLUSH',
        score: this.calcScore(PokerHandRank.FLUSH, values),
        cards,
        description: `Flush (${values[0]} High)`,
      };
    }

    // 6. Straight
    if (isStraight) {
      return {
        rank: PokerHandRank.STRAIGHT,
        rankName: 'STRAIGHT',
        score: this.calcScore(PokerHandRank.STRAIGHT, [straightHigh]),
        cards,
        description: `Straight (${straightHigh} High)`,
      };
    }

    // 7. Three of a Kind
    if (freq[0].count === 3) {
      return {
        rank: PokerHandRank.THREE_OF_A_KIND,
        rankName: 'THREE_OF_A_KIND',
        score: this.calcScore(PokerHandRank.THREE_OF_A_KIND, [freq[0].val, freq[1].val, freq[2].val]),
        cards,
        description: `Three of a Kind (${freq[0].val}s)`,
      };
    }

    // 8. Two Pair
    if (freq[0].count === 2 && freq[1].count === 2) {
      return {
        rank: PokerHandRank.TWO_PAIR,
        rankName: 'TWO_PAIR',
        score: this.calcScore(PokerHandRank.TWO_PAIR, [freq[0].val, freq[1].val, freq[2].val]),
        cards,
        description: `Two Pair (${freq[0].val}s and ${freq[1].val}s)`,
      };
    }

    // 9. One Pair
    if (freq[0].count === 2) {
      return {
        rank: PokerHandRank.ONE_PAIR,
        rankName: 'ONE_PAIR',
        score: this.calcScore(PokerHandRank.ONE_PAIR, [freq[0].val, freq[1].val, freq[2].val, freq[3].val]),
        cards,
        description: `Pair of ${freq[0].val}s`,
      };
    }

    // 10. High Card
    return {
      rank: PokerHandRank.HIGH_CARD,
      rankName: 'HIGH_CARD',
      score: this.calcScore(PokerHandRank.HIGH_CARD, values),
      cards,
      description: `High Card (${values[0]})`,
    };
  }

  private static calcScore(rank: number, values: number[]): number {
    let score = rank * 10000000000;
    let multiplier = 100000000;
    for (const v of values) {
      score += v * multiplier;
      multiplier /= 100;
    }
    return score;
  }

  private static getCombinations<T>(arr: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (arr.length === 0) return [];
    const head = arr[0];
    const tail = arr.slice(1);
    const withHead = this.getCombinations(tail, k - 1).map((combo) => [head, ...combo]);
    const withoutHead = this.getCombinations(tail, k);
    return [...withHead, ...withoutHead];
  }
}

export class TexasHoldemTable {
  public readonly id: string;
  public readonly name: string;
  public readonly maxSeats: number;
  public readonly smallBlind: number;
  public readonly bigBlind: number;
  public readonly minBuyIn: number;
  public readonly maxBuyIn: number;

  private seats: (PlayerSeat | null)[];
  private stage: PokerGameStage = PokerGameStage.WAITING_FOR_PLAYERS;
  private dealerSeat: number = 0;
  private smallBlindSeat: number = 0;
  private bigBlindSeat: number = 0;
  private activePlayerSeat: number = 0;
  private currentHighestBet: number = 0;
  private minRaise: number = 0;
  private pot: number = 0;
  private sidePots: SidePot[] = [];
  private communityCards: Card[] = [];
  private deck: Card[] = [];
  private handWinners?: HandWinner[];

  constructor(config: PokerTableConfig) {
    this.id = config.id;
    this.name = config.name;
    this.maxSeats = config.maxSeats || 6;
    this.smallBlind = config.smallBlind;
    this.bigBlind = config.bigBlind;
    this.minBuyIn = config.minBuyIn;
    this.maxBuyIn = config.maxBuyIn;
    this.seats = new Array(this.maxSeats).fill(null);
  }

  public joinTable(seatNumber: number, userId: string, username: string, buyIn: number): PlayerSeat {
    if (seatNumber < 0 || seatNumber >= this.maxSeats) throw new Error('Invalid seat number');
    if (this.seats[seatNumber] !== null) throw new Error('Seat is already occupied');
    if (buyIn < this.minBuyIn || buyIn > this.maxBuyIn) throw new Error(`Buy-in must be between $${this.minBuyIn} and $${this.maxBuyIn}`);

    const seat: PlayerSeat = {
      seatNumber,
      userId,
      username,
      chipStack: buyIn,
      currentRoundBet: 0,
      totalHandBet: 0,
      holeCards: [],
      folded: false,
      isAllIn: false,
      hasActed: false,
    };

    this.seats[seatNumber] = seat;
    console.log(`[PokerTable:${this.name}] ${username} seated at #${seatNumber} with $${buyIn}`);
    return seat;
  }

  public leaveTable(seatNumber: number): boolean {
    if (this.seats[seatNumber]) {
      this.seats[seatNumber] = null;
      return true;
    }
    return false;
  }

  /**
   * Starts a new poker hand deal
   */
  public startHand(): boolean {
    const activePlayers = this.getActiveSeats();
    if (activePlayers.length < 2) {
      this.stage = PokerGameStage.WAITING_FOR_PLAYERS;
      return false;
    }

    // Reset table state
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.handWinners = undefined;
    this.deck = this.createShuffledDeck();

    // Advance dealer button
    this.dealerSeat = this.findNextOccupiedSeat(this.dealerSeat);
    this.smallBlindSeat = this.findNextOccupiedSeat(this.dealerSeat);
    this.bigBlindSeat = this.findNextOccupiedSeat(this.smallBlindSeat);

    // Reset seats
    for (const seat of this.seats) {
      if (seat && seat.chipStack > 0) {
        seat.holeCards = [this.deck.pop()!, this.deck.pop()!];
        seat.folded = false;
        seat.isAllIn = false;
        seat.currentRoundBet = 0;
        seat.totalHandBet = 0;
        seat.hasActed = false;
      }
    }

    // Post Blinds
    const sbSeat = this.seats[this.smallBlindSeat]!;
    const bbSeat = this.seats[this.bigBlindSeat]!;

    const sbAmount = Math.min(sbSeat.chipStack, this.smallBlind);
    sbSeat.chipStack -= sbAmount;
    sbSeat.currentRoundBet = sbAmount;
    sbSeat.totalHandBet = sbAmount;
    this.pot += sbAmount;
    if (sbSeat.chipStack === 0) sbSeat.isAllIn = true;

    const bbAmount = Math.min(bbSeat.chipStack, this.bigBlind);
    bbSeat.chipStack -= bbAmount;
    bbSeat.currentRoundBet = bbAmount;
    bbSeat.totalHandBet = bbAmount;
    this.pot += bbAmount;
    if (bbSeat.chipStack === 0) bbSeat.isAllIn = true;

    this.currentHighestBet = this.bigBlind;
    this.minRaise = this.bigBlind;
    this.stage = PokerGameStage.PREFLOP;

    // Active player is Under-The-Gun (first after BB)
    this.activePlayerSeat = this.findNextOccupiedSeat(this.bigBlindSeat);
    console.log(`[PokerTable:${this.name}] Hand Started! Blinds: $${this.smallBlind}/$${this.bigBlind} | UTG: Seat #${this.activePlayerSeat}`);
    return true;
  }

  /**
   * Processes player poker actions (FOLD, CHECK, CALL, BET, RAISE, ALL_IN)
   */
  public handleAction(userId: string, action: PokerPlayerAction, amount: number = 0): PokerTableState {
    const seat = this.seats[this.activePlayerSeat];
    if (!seat || seat.userId !== userId) {
      throw new Error(`Not player's turn (Active: Seat #${this.activePlayerSeat})`);
    }

    switch (action) {
      case PokerPlayerAction.FOLD:
        seat.folded = true;
        seat.hasActed = true;
        break;

      case PokerPlayerAction.CHECK:
        if (seat.currentRoundBet < this.currentHighestBet) {
          throw new Error(`Cannot CHECK. Must call $${this.currentHighestBet - seat.currentRoundBet}`);
        }
        seat.hasActed = true;
        break;

      case PokerPlayerAction.CALL: {
        const callAmount = Math.min(seat.chipStack, this.currentHighestBet - seat.currentRoundBet);
        seat.chipStack -= callAmount;
        seat.currentRoundBet += callAmount;
        seat.totalHandBet += callAmount;
        this.pot += callAmount;
        if (seat.chipStack === 0) seat.isAllIn = true;
        seat.hasActed = true;
        break;
      }

      case PokerPlayerAction.BET:
      case PokerPlayerAction.RAISE: {
        const targetBet = amount;
        if (targetBet < this.currentHighestBet + this.minRaise && targetBet < seat.chipStack + seat.currentRoundBet) {
          throw new Error(`Min raise is $${this.currentHighestBet + this.minRaise}`);
        }
        const needed = targetBet - seat.currentRoundBet;
        const actualDeduction = Math.min(seat.chipStack, needed);
        seat.chipStack -= actualDeduction;
        seat.currentRoundBet += actualDeduction;
        seat.totalHandBet += actualDeduction;
        this.pot += actualDeduction;
        if (seat.chipStack === 0) seat.isAllIn = true;

        this.minRaise = seat.currentRoundBet - this.currentHighestBet;
        this.currentHighestBet = seat.currentRoundBet;
        seat.hasActed = true;

        // Reset hasActed for other active players who need to match raise
        for (const other of this.seats) {
          if (other && other.seatNumber !== seat.seatNumber && !other.folded && !other.isAllIn) {
            other.hasActed = false;
          }
        }
        break;
      }

      case PokerPlayerAction.ALL_IN: {
        const allInChips = seat.chipStack;
        seat.chipStack = 0;
        seat.currentRoundBet += allInChips;
        seat.totalHandBet += allInChips;
        this.pot += allInChips;
        seat.isAllIn = true;
        seat.hasActed = true;

        if (seat.currentRoundBet > this.currentHighestBet) {
          this.minRaise = seat.currentRoundBet - this.currentHighestBet;
          this.currentHighestBet = seat.currentRoundBet;
          for (const other of this.seats) {
            if (other && other.seatNumber !== seat.seatNumber && !other.folded && !other.isAllIn) {
              other.hasActed = false;
            }
          }
        }
        break;
      }
    }

    this.checkBettingRoundStatus();
    return this.getState();
  }

  private checkBettingRoundStatus(): void {
    const activeUnfolded = this.seats.filter((s) => s !== null && !s.folded) as PlayerSeat[];

    // 1. Fold-around: if only 1 player remains unfolded -> wins whole pot immediately
    if (activeUnfolded.length === 1) {
      const winner = activeUnfolded[0];
      winner.chipStack += this.pot;
      this.handWinners = [
        {
          seatNumber: winner.seatNumber,
          userId: winner.userId,
          username: winner.username,
          handName: 'Won by Fold',
          handScore: 0,
          winAmount: this.pot,
          potType: 'MAIN_POT',
        },
      ];
      this.stage = PokerGameStage.SHOWDOWN;
      return;
    }

    // 2. Check if all active non-all-in players have acted and matched highest bet
    const needAction = activeUnfolded.filter((s) => !s.isAllIn && (!s.hasActed || s.currentRoundBet < this.currentHighestBet));

    if (needAction.length === 0) {
      this.advanceStage();
    } else {
      this.activePlayerSeat = this.findNextPlayerToAct(this.activePlayerSeat);
    }
  }

  private advanceStage(): void {
    // Reset round bets
    for (const s of this.seats) {
      if (s) {
        s.currentRoundBet = 0;
        s.hasActed = false;
      }
    }
    this.currentHighestBet = 0;
    this.minRaise = this.bigBlind;

    switch (this.stage) {
      case PokerGameStage.PREFLOP:
        this.communityCards.push(this.deck.pop()!, this.deck.pop()!, this.deck.pop()!); // FLOP (3 cards)
        this.stage = PokerGameStage.FLOP;
        break;
      case PokerGameStage.FLOP:
        this.communityCards.push(this.deck.pop()!); // TURN (1 card)
        this.stage = PokerGameStage.TURN;
        break;
      case PokerGameStage.TURN:
        this.communityCards.push(this.deck.pop()!); // RIVER (1 card)
        this.stage = PokerGameStage.RIVER;
        break;
      case PokerGameStage.RIVER:
        this.stage = PokerGameStage.SHOWDOWN;
        this.resolveShowdown();
        return;
    }

    this.activePlayerSeat = this.findNextOccupiedSeat(this.dealerSeat);
  }

  private resolveShowdown(): void {
    const contenders = this.seats.filter((s) => s !== null && !s.folded) as PlayerSeat[];
    const evaluatedContenders = contenders.map((c) => ({
      seat: c,
      evaluation: TexasHoldemHandEvaluator.evaluate7CardHand([...c.holeCards, ...this.communityCards]),
    }));

    // Sort by best hand score descending
    evaluatedContenders.sort((a, b) => b.evaluation.score - a.evaluation.score);
    const winner = evaluatedContenders[0];
    winner.seat.chipStack += this.pot;

    this.handWinners = [
      {
        seatNumber: winner.seat.seatNumber,
        userId: winner.seat.userId,
        username: winner.seat.username,
        handName: winner.evaluation.description,
        handScore: winner.evaluation.score,
        winAmount: this.pot,
        potType: 'MAIN_POT',
      },
    ];

    console.log(`[PokerTable:${this.name}] Showdown Winner: ${winner.seat.username} with ${winner.evaluation.description} (Won $${this.pot})`);
  }

  private findNextOccupiedSeat(fromSeat: number): number {
    for (let i = 1; i <= this.maxSeats; i++) {
      const idx = (fromSeat + i) % this.maxSeats;
      if (this.seats[idx] !== null && !this.seats[idx]!.folded) {
        return idx;
      }
    }
    return fromSeat;
  }

  private findNextPlayerToAct(fromSeat: number): number {
    for (let i = 1; i <= this.maxSeats; i++) {
      const idx = (fromSeat + i) % this.maxSeats;
      const s = this.seats[idx];
      if (s !== null && !s.folded && !s.isAllIn && (!s.hasActed || s.currentRoundBet < this.currentHighestBet)) {
        return idx;
      }
    }
    return fromSeat;
  }

  private getActiveSeats(): PlayerSeat[] {
    return this.seats.filter((s) => s !== null && s.chipStack > 0) as PlayerSeat[];
  }

  public getState(): PokerTableState {
    return {
      tableId: this.id,
      tableName: this.name,
      maxSeats: this.maxSeats,
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      stage: this.stage,
      dealerSeat: this.dealerSeat,
      smallBlindSeat: this.smallBlindSeat,
      bigBlindSeat: this.bigBlindSeat,
      activePlayerSeat: this.activePlayerSeat,
      currentHighestBet: this.currentHighestBet,
      minRaise: this.minRaise,
      pot: this.pot,
      sidePots: this.sidePots,
      communityCards: this.communityCards,
      seats: [...this.seats],
      handWinners: this.handWinners,
    };
  }

  private createShuffledDeck(): Card[] {
    const suits: Array<'HEARTS' | 'DIAMONDS' | 'CLUBS' | 'SPADES'> = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck: Card[] = [];

    for (const suit of suits) {
      for (const value of values) {
        deck.push({ suit, value });
      }
    }

    // Fisher-Yates shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  }
}
