/**
 * Canonical Sports Event Contracts & Types
 * Defined as part of Phase 1: Feed & Canonical Event Log
 */

export const CanonicalEventType = {
  PERIOD_START: 'PERIOD_START',
  PERIOD_END: 'PERIOD_END',
  CLOCK_TICK: 'CLOCK_TICK',
  GOAL: 'GOAL',
  VAR_DECISION: 'VAR_DECISION',
  CARD: 'CARD',
  CORNER: 'CORNER',
  FOUL: 'FOUL',
  OFFSIDE: 'OFFSIDE',
  SUBSTITUTION: 'SUBSTITUTION',
  PENALTY: 'PENALTY',
  FIXTURE_STATUS: 'FIXTURE_STATUS',
  FEED_HEARTBEAT: 'FEED_HEARTBEAT',
  MARKET_SUSPEND: 'MARKET_SUSPEND',
  MARKET_UNSUSPEND: 'MARKET_UNSUSPEND',
  ODDS_UPDATE: 'ODDS_UPDATE',
  CORRECTION: 'CORRECTION',
} as const;

export type CanonicalEventType = (typeof CanonicalEventType)[keyof typeof CanonicalEventType];

export interface EventTimestamps {
  occurred: number;   // Epoch ms: when event occurred in real world / match
  published: number;  // Epoch ms: when provider published event
  received: number;   // Epoch ms: when xBET ingest adapter received payload
  processed: number;  // Epoch ms: when reducer recorded event in canonical log
}

export interface EventCorrectionReference {
  supersedesEventId: string;
  reason: string;
  originalEventType?: CanonicalEventType;
}

/**
 * Data-Mode Classification for Fixtures & Sports Feeds:
 * - SIMULATED: In-process synthetic Monte-Carlo / Poisson engine (tests, local sandbox, dry-runs)
 * - REFERENCE_ONLY: Delayed / public educational feeds (scraped/public data, strictly not licensed for real-money trade)
 * - LICENSED_LIVE: Contracted commercial B2B supplier (Betgenius, Sportradar, Enetpulse official low-latency feed)
 */
export const DataMode = {
  SIMULATED: 'SIMULATED',
  REFERENCE_ONLY: 'REFERENCE_ONLY',
  LICENSED_LIVE: 'LICENSED_LIVE',
} as const;

export type DataMode = (typeof DataMode)[keyof typeof DataMode];

export interface EventProvenance {
  source: string;
  feedLatencyMs: number;
  confidence: number; // 0.0 to 1.0
  dataMode?: DataMode;
}

export interface CanonicalSportsEvent<TPayload = Record<string, any>> {
  eventId: string;             // Globally unique UUID / idempotency key
  provider: string;            // e.g. 'Simulator', 'TheOddsAPI', 'EnetPulse'
  providerEventId: string;     // External event sequence or ID from provider
  fixtureId: string;           // Internal canonical fixture ID
  sport: string;               // e.g. 'football'
  eventType: CanonicalEventType;
  schemaVersion: string;       // e.g. '1.0.0'
  providerSequence: number;    // Monotonically increasing sequence number per fixture from provider
  timestamps: EventTimestamps;
  payload: TPayload;
  correctionRef?: EventCorrectionReference;
  rawPayloadRef?: string;      // Hash or storage key of the raw provider payload
  provenance: EventProvenance;
}

export interface FootballCard {
  id: string;
  minute: number;
  team: 'HOME' | 'AWAY';
  player?: string;
  cardType: 'YELLOW' | 'RED';
}

export interface FootballGoal {
  id: string;
  eventId: string;
  minute: number;
  team: 'HOME' | 'AWAY';
  player?: string;
  scoreAfter: { home: number; away: number };
  isCancelled?: boolean;
  cancellationReason?: string;
}

export interface FootballState {
  fixtureId: string;
  status:
    | 'NOT_STARTED'
    | 'FIRST_HALF'
    | 'HALF_TIME'
    | 'SECOND_HALF'
    | 'EXTRA_TIME'
    | 'PENALTIES'
    | 'FINISHED'
    | 'SUSPENDED'
    | 'ABANDONED';
  score: { home: number; away: number };
  period: string; // 'PRE', '1H', 'HT', '2H', 'ET1', 'ET2', 'PEN', 'FT'
  minute: number;
  matchClock: string;
  cards: FootballCard[];
  goals: FootballGoal[];
  corners: { home: number; away: number };
  lastEventSequence: number;
  lastEventId: string | null;
  lastEventTimestamp: number;
  isFeedConnected: boolean;
  isStale: boolean;
  hasSequenceGap: boolean;
  expectedNextSequence: number;
  missingSequences: number[];
  marketsSuspended: boolean;
  suspensionReason?: string;
  homeTeam?: string;
  awayTeam?: string;
  sequence?: number;
  marketSuspended?: boolean;
  redCards?: { home: number; away: number };
}
