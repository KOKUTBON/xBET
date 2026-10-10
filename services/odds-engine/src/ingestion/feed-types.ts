/**
 * Normalized Sports Feed Types and Provider Adapter Contracts
 */

export interface NormalizedSport {
  externalId: string;
  name: string;
  slug: string;
}

export interface NormalizedCountry {
  externalId: string;
  name: string;
  countryCode?: string;
}

export interface NormalizedTournament {
  externalId: string;
  sportExternalId: string;
  countryExternalId?: string;
  name: string;
  slug: string;
}

export interface NormalizedSelection {
  externalId: string;
  name: string;
  odds: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'WON' | 'LOST' | 'VOID';
  probability?: number;
  sortOrder: number;
}

export interface NormalizedMarket {
  externalId: string;
  marketType: string; // '1X2', 'OVER_UNDER', 'BTTS', 'DOUBLE_CHANCE', 'DRAW_NO_BET', 'ASIAN_HANDICAP', 'CORRECT_SCORE'
  name: string;
  line?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'SETTLED' | 'VOID';
  isInPlay: boolean;
  sortOrder: number;
  selections: NormalizedSelection[];
}

export interface NormalizedFixture {
  externalId: string;
  provider: string;
  sportId: number;
  sportName: string;
  tournamentId: number;
  tournamentName: string;
  homeTeam: string;
  awayTeam: string;
  startTime: Date;
  status: 'NOT_STARTED' | 'LIVE' | 'HALF_TIME' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  isInPlay: boolean;
  score: { home: number; away: number };
  periodScores: Array<{ period: string; home: number; away: number }>;
  matchMinute: number;
  matchClock: string;
  markets: NormalizedMarket[];
}

export interface NormalizedOddsDelta {
  provider: string;
  fixtureExternalId: string;
  marketExternalId: string;
  selectionExternalId: string;
  newOdds: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'WON' | 'LOST' | 'VOID';
  timestamp: number;
}

export interface NormalizedScorecard {
  provider: string;
  fixtureExternalId: string;
  homeScore: number;
  awayScore: number;
  status: 'FINISHED' | 'POSTPONED' | 'CANCELLED' | 'ABANDONED';
  halfTimeScore?: { home: number; away: number };
  periodScores?: Array<{ period: string; home: number; away: number }>;
  isVoid?: boolean;
}

export interface IFeedAdapter {
  readonly providerName: string;
  parseSports(payload: string | Record<string, unknown>): NormalizedSport[];
  parseTournaments(payload: string | Record<string, unknown>): NormalizedTournament[];
  parseFixtures(payload: string | Record<string, unknown>): NormalizedFixture[];
  parseLiveDeltas(payload: string | Record<string, unknown>): NormalizedOddsDelta[];
  parseScorecards(payload: string | Record<string, unknown>): NormalizedScorecard[];
}
