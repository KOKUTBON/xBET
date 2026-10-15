export const FixtureStatus = {
  NOT_STARTED: 'NOT_STARTED',
  LIVE: 'LIVE',
  HALF_TIME: 'HALF_TIME',
  EXTRA_TIME: 'EXTRA_TIME',
  PENALTIES: 'PENALTIES',
  FINISHED: 'FINISHED',
  POSTPONED: 'POSTPONED',
  CANCELLED: 'CANCELLED',
  INTERRUPTED: 'INTERRUPTED',
  ABANDONED: 'ABANDONED',
} as const;
export type FixtureStatus = (typeof FixtureStatus)[keyof typeof FixtureStatus];

export const MarketStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  SETTLED: 'SETTLED',
  CANCELLED: 'CANCELLED',
  VOID: 'VOID',
} as const;
export type MarketStatus = (typeof MarketStatus)[keyof typeof MarketStatus];

export const SelectionStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  WON: 'WON',
  LOST: 'LOST',
  HALF_WON: 'HALF_WON',
  HALF_LOST: 'HALF_LOST',
  VOID: 'VOID',
  CANCELLED: 'CANCELLED',
} as const;
export type SelectionStatus = (typeof SelectionStatus)[keyof typeof SelectionStatus];

export const BetSlipType = {
  SINGLE: 'SINGLE',
  COMBI: 'COMBI',
  SYSTEM: 'SYSTEM',
} as const;
export type BetSlipType = (typeof BetSlipType)[keyof typeof BetSlipType];

export const BetSlipStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  WON: 'WON',
  LOST: 'LOST',
  HALF_WON: 'HALF_WON',
  HALF_LOST: 'HALF_LOST',
  CASHED_OUT: 'CASHED_OUT',
  VOID: 'VOID',
  CANCELLED: 'CANCELLED',
} as const;
export type BetSlipStatus = (typeof BetSlipStatus)[keyof typeof BetSlipStatus];

export interface Sport {
  id: number;
  externalId?: string | null;
  slug: string;
  name: string;
  iconName?: string | null;
  sortOrder: number;
  isActive: boolean;
  i18nNames?: Record<string, string>;
}

export interface Category {
  id: number;
  externalId?: string | null;
  slug: string;
  name: string;
  countryCode?: string | null;
  flagUrl?: string | null;
  sportId: number;
  sortOrder: number;
  isActive: boolean;
}

export interface Tournament {
  id: number;
  externalId?: string | null;
  categoryId: number;
  slug: string;
  name: string;
  isActive: boolean;
  isFeatured: boolean;
  minStake: number;
  maxStake: number;
  sortOrder: number;
}

export interface FixtureScore {
  home: number;
  away: number;
}

export interface PeriodScore {
  period: string; // e.g. '1H', '2H', 'Q1', 'Q2', 'Set1'
  home: number;
  away: number;
}

export interface Fixture {
  id: string;
  externalId?: string | null;
  tournamentId: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  startTime: Date;
  status: FixtureStatus;
  isInPlay: boolean;
  currentScore: FixtureScore;
  periodScores: PeriodScore[];
  matchClock?: string | null;
  feedProvider: string;
  lastFeedUpdate?: Date | null;
}

export interface Market {
  id: string;
  externalId?: string | null;
  fixtureId: string;
  marketType: string;
  name: string;
  line?: string | null;
  status: MarketStatus;
  isInPlay: boolean;
  sortOrder: number;
  settledAt?: Date | null;
  selections?: Selection[];
}

export interface Selection {
  id: string;
  externalId?: string | null;
  marketId: string;
  name: string;
  odds: number;
  previousOdds?: number | null;
  status: SelectionStatus;
  probability?: number | null;
  sortOrder: number;
  settledAt?: Date | null;
}

export interface BetSlip {
  id: string;
  slipNumber: string;
  userId: string;
  betType: BetSlipType;
  status: BetSlipStatus;
  currencyCode: string;
  stakeAmount: number;
  totalOdds: number;
  potentialPayout: number;
  actualPayout: number;
  cashoutAmount?: number | null;
  isInPlay: boolean;
  placedIp?: string | null;
  settledAt?: Date | null;
  createdAt: Date;
  legs?: BetLeg[];
}

export interface BetLeg {
  id: string;
  betSlipId: string;
  selectionId: string;
  fixtureId: string;
  marketId: string;
  lockedOdds: number;
  status: SelectionStatus;
  fixtureNameSnapshot: string;
  marketNameSnapshot: string;
  selectionNameSnapshot: string;
  settledAt?: Date | null;
}

// Live Odds Stream Delta Packet (for WebSockets)
export interface OddsTickDelta {
  fixtureId: string;
  marketId: string;
  selectionId: string;
  newOdds: number;
  oldOdds: number;
  status: SelectionStatus;
  timestamp: number;
}
