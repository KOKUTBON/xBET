export const CasinoGameType = {
  TABLE_GAME: 'TABLE_GAME',
  SLOT: 'SLOT',
  ROULETTE: 'ROULETTE',
  BLACKJACK: 'BLACKJACK',
  BACCARAT: 'BACCARAT',
  POKER: 'POKER',
  VIRTUAL_SPORTS: 'VIRTUAL_SPORTS',
  LIVE_CASINO: 'LIVE_CASINO',
  SCRATCH_CARD: 'SCRATCH_CARD',
  KENO: 'KENO',
  BINGO: 'BINGO',
} as const;
export type CasinoGameType = (typeof CasinoGameType)[keyof typeof CasinoGameType];

export interface CasinoProvider {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  apiEndpoint?: string | null;
}

export interface CasinoGame {
  id: string;
  providerId: number;
  gameCode: string;
  slug: string;
  title: string;
  category: CasinoGameType;
  thumbnailUrl?: string | null;
  bannerUrl?: string | null;
  rtpPercentage: number;
  minBet: number;
  maxBet: number;
  hasDemo: boolean;
  isActive: boolean;
  isFeatured: boolean;
}

export interface CasinoSession {
  id: string;
  userId: string;
  gameId: string;
  sessionToken: string;
  currencyCode: string;
  ipAddress?: string | null;
  isActive: boolean;
  startedAt: Date;
  endedAt?: Date | null;
}

export interface CasinoRound {
  id: string;
  sessionId: string;
  roundNumber: string;
  serverSeedHash?: string | null;
  serverSeed?: string | null;
  clientSeed?: string | null;
  nonce?: bigint | null;
  totalWager: number;
  totalPayout: number;
  gameState: Record<string, unknown>;
  isCompleted: boolean;
  createdAt: Date;
  completedAt?: Date | null;
}

export interface VirtualEvent {
  id: string;
  gameId: string;
  eventNumber: bigint;
  name: string;
  startTime: Date;
  durationSeconds: number;
  status: string;
  resultData: Record<string, unknown>;
}

// Seamless Wallet Standard API Protocol
export interface SeamlessWalletAuthRequest {
  sessionToken: string;
}

export interface SeamlessWalletBalanceRequest {
  userId: string;
  currencyCode: string;
}

export interface SeamlessWalletBalanceResponse {
  userId: string;
  currencyCode: string;
  balance: number;
  bonusBalance: number;
}

export interface SeamlessWalletWagerRequest {
  transactionId: string;
  roundId: string;
  userId: string;
  gameCode: string;
  amount: number;
  currencyCode: string;
}

export interface SeamlessWalletPayoutRequest {
  transactionId: string;
  roundId: string;
  userId: string;
  gameCode: string;
  amount: number;
  currencyCode: string;
  isRoundComplete: boolean;
}
