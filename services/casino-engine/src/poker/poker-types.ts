/**
 * Multiplayer Texas Hold'em Poker Types & Contracts
 */

import type { Card } from '../games/blackjack.ts';

export const PokerGameStage = {
  WAITING_FOR_PLAYERS: 'WAITING_FOR_PLAYERS',
  PREFLOP: 'PREFLOP',
  FLOP: 'FLOP',
  TURN: 'TURN',
  RIVER: 'RIVER',
  SHOWDOWN: 'SHOWDOWN',
} as const;
export type PokerGameStage = (typeof PokerGameStage)[keyof typeof PokerGameStage];

export const PokerPlayerAction = {
  FOLD: 'FOLD',
  CHECK: 'CHECK',
  CALL: 'CALL',
  BET: 'BET',
  RAISE: 'RAISE',
  ALL_IN: 'ALL_IN',
} as const;
export type PokerPlayerAction = (typeof PokerPlayerAction)[keyof typeof PokerPlayerAction];

export const PokerHandRank = {
  HIGH_CARD: 1,
  ONE_PAIR: 2,
  TWO_PAIR: 3,
  THREE_OF_A_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_OF_A_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10,
} as const;
export type PokerHandRank = (typeof PokerHandRank)[keyof typeof PokerHandRank];

export interface HandEvaluation {
  rank: PokerHandRank;
  rankName: string;
  score: number; // Comparative numeric score for tie-breakers
  cards: Card[];
  description: string;
}

export interface PlayerSeat {
  seatNumber: number;
  userId: string;
  username: string;
  chipStack: number;
  currentRoundBet: number;
  totalHandBet: number;
  holeCards: Card[];
  folded: boolean;
  isAllIn: boolean;
  hasActed: boolean;
}

export interface SidePot {
  amount: number;
  eligibleSeats: number[];
}

export interface HandWinner {
  seatNumber: number;
  userId: string;
  username: string;
  handName: string;
  handScore: number;
  winAmount: number;
  potType: 'MAIN_POT' | 'SIDE_POT';
}

export interface PokerTableState {
  tableId: string;
  tableName: string;
  maxSeats: number;
  smallBlind: number;
  bigBlind: number;
  stage: PokerGameStage;
  dealerSeat: number;
  smallBlindSeat: number;
  bigBlindSeat: number;
  activePlayerSeat: number;
  currentHighestBet: number;
  minRaise: number;
  pot: number;
  sidePots: SidePot[];
  communityCards: Card[];
  seats: (PlayerSeat | null)[];
  handWinners?: HandWinner[];
}

export interface PokerTableConfig {
  id: string;
  name: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  maxSeats: number;
}
