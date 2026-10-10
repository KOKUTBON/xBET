export const CasinoGameType = {
  TABLE_GAME: 'TABLE_GAME',
  SLOT: 'SLOT',
  ROULETTE: 'ROULETTE',
  BLACKJACK: 'BLACKJACK',
  BACCARAT: 'BACCARAT',
  POKER: 'POKER',
  VIRTUAL_SPORTS: 'VIRTUAL_SPORTS',
  LIVE_CASINO: 'LIVE_CASINO',
} as const;
export type CasinoGameType = (typeof CasinoGameType)[keyof typeof CasinoGameType];

export interface GameCatalogItem {
  id: string;
  gameCode: string;
  slug: string;
  title: string;
  category: CasinoGameType;
  rtpPercentage: number;
  minBet: number;
  maxBet: number;
  thumbnailUrl: string;
  isFeatured: boolean;
}

export interface GameRoundResult {
  roundId: string;
  gameCode: string;
  userId: string;
  wager: number;
  payout: number;
  profit: number;
  isCompleted: boolean;
  gameState: Record<string, unknown>;
  serverSeedHash?: string;
  serverSeed?: string;
  clientSeed?: string;
  nonce?: number;
}
