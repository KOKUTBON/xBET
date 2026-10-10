/**
 * Feed Ingestion Coordinator Service
 * Manages multiple external provider adapters, parses raw XML/JSON streams,
 * updates in-memory live state, and dispatches finished fixtures to betting settlement.
 */

import { EventEmitter } from 'events';
import { EnetPulseAdapter } from './adapters/enetpulse-adapter.ts';
import { OddServiceAdapter } from './adapters/oddservice-adapter.ts';
import { TheOddsApiAdapter } from './adapters/the-odds-api-adapter.ts';
// NOTE: External-provider scraper adapters were removed from the active feed path.
// They attempted to extract another operator's authenticated live feed, which we do not
// redistribute. Real data now comes from a licensed feed provider (see TheOddsApiLivePoller).
import type {
  IFeedAdapter,
  NormalizedFixture,
  NormalizedOddsDelta,
  NormalizedScorecard,
  NormalizedSport,
  NormalizedTournament,
} from './feed-types.ts';
import { LiveStateManager } from '../domain/live-state.ts';
import type { LiveFixtureState, LiveMarketState, LiveSelectionState } from '../domain/live-state.ts';

export interface IngestionStats {
  totalPayloadsIngested: number;
  totalFixturesLoaded: number;
  totalOddsDeltasProcessed: number;
  totalScorecardsProcessed: number;
  lastIngestionTimestamp: number | null;
  activeProviders: string[];
}

export class FeedIngestionService extends EventEmitter {
  private static instance: FeedIngestionService;
  private adapters: Map<string, IFeedAdapter> = new Map();
  private stateManager: LiveStateManager;

  private stats: IngestionStats = {
    totalPayloadsIngested: 0,
    totalFixturesLoaded: 0,
    totalOddsDeltasProcessed: 0,
    totalScorecardsProcessed: 0,
    lastIngestionTimestamp: null,
    activeProviders: [],
  };

  private constructor() {
    super();
    this.stateManager = LiveStateManager.getInstance();

    // Register default feed adapters
    this.registerAdapter(new EnetPulseAdapter());
    this.registerAdapter(new OddServiceAdapter());
    this.registerAdapter(new TheOddsApiAdapter());
  }

  public static getInstance(): FeedIngestionService {
    if (!FeedIngestionService.instance) {
      FeedIngestionService.instance = new FeedIngestionService();
    }
    return FeedIngestionService.instance;
  }

  public registerAdapter(adapter: IFeedAdapter): void {
    this.adapters.set(adapter.providerName.toLowerCase(), adapter);
    if (!this.stats.activeProviders.includes(adapter.providerName)) {
      this.stats.activeProviders.push(adapter.providerName);
    }
    console.log(`[FeedIngestion] Registered feed provider: ${adapter.providerName}`);
  }

  public getAdapter(providerName: string): IFeedAdapter {
    const adapter = this.adapters.get(providerName.toLowerCase());
    if (!adapter) {
      throw new Error(`PROVIDER_NOT_FOUND: No feed adapter registered for '${providerName}'`);
    }
    return adapter;
  }

  /**
   * Ingests external fixture feed payload (XML or JSON)
   */
  public ingestFixtures(providerName: string, rawPayload: string | Record<string, unknown>): NormalizedFixture[] {
    const adapter = this.getAdapter(providerName);
    const normalized = adapter.parseFixtures(rawPayload);

    for (const nFix of normalized) {
      const marketsMap = new Map<string, LiveMarketState>();

      for (const nMkt of nFix.markets) {
        const selectionsMap = new Map<string, LiveSelectionState>();

        for (const nSel of nMkt.selections) {
          selectionsMap.set(nSel.externalId, {
            id: nSel.externalId,
            name: nSel.name,
            odds: nSel.odds,
            previousOdds: null,
            status: nSel.status,
            probability: nSel.odds > 1 ? parseFloat((1 / nSel.odds).toFixed(4)) : 0,
            sortOrder: nSel.sortOrder,
          });
        }

        marketsMap.set(nMkt.externalId, {
          id: nMkt.externalId,
          marketType: nMkt.marketType,
          name: nMkt.name,
          line: nMkt.line,
          status: nMkt.status,
          isInPlay: nMkt.isInPlay,
          sortOrder: nMkt.sortOrder,
          selections: selectionsMap,
        });
      }

      const liveFixture: LiveFixtureState = {
        id: nFix.externalId,
        tournamentId: nFix.tournamentId,
        tournamentName: nFix.tournamentName,
        sportId: nFix.sportId,
        sportName: nFix.sportName,
        homeTeam: nFix.homeTeam,
        awayTeam: nFix.awayTeam,
        startTime: nFix.startTime,
        status: nFix.status as any,
        isInPlay: nFix.isInPlay,
        score: nFix.score,
        periodScores: nFix.periodScores,
        matchMinute: nFix.matchMinute,
        matchClock: nFix.matchClock,
        lastEvent: `Feed update from ${providerName}`,
        markets: marketsMap,
      };

      this.stateManager.setFixture(liveFixture);
      this.stats.totalFixturesLoaded++;
    }

    this.stats.totalPayloadsIngested++;
    this.stats.lastIngestionTimestamp = Date.now();

    console.log(`[FeedIngestion] Ingested ${normalized.length} fixtures from ${providerName}`);
    return normalized;
  }

  /**
   * Ingests real-time live odds deltas and propagates to WebSocket subscribers
   */
  public ingestLiveDeltas(providerName: string, rawPayload: string | Record<string, unknown>): NormalizedOddsDelta[] {
    const adapter = this.getAdapter(providerName);
    const deltas = adapter.parseLiveDeltas(rawPayload);

    for (const d of deltas) {
      this.stateManager.updateOdds(
        d.fixtureExternalId,
        d.marketExternalId,
        d.selectionExternalId,
        d.newOdds,
        d.status
      );
      this.stats.totalOddsDeltasProcessed++;
    }

    this.stats.totalPayloadsIngested++;
    this.stats.lastIngestionTimestamp = Date.now();
    return deltas;
  }

  /**
   * Ingests official match results / scorecards and emits resulting event
   */
  public ingestScorecards(providerName: string, rawPayload: string | Record<string, unknown>): NormalizedScorecard[] {
    const adapter = this.getAdapter(providerName);
    const scorecards = adapter.parseScorecards(rawPayload);

    for (const sc of scorecards) {
      // 1. Update in-memory state
      this.stateManager.updateMatchState(
        sc.fixtureExternalId,
        { home: sc.homeScore, away: sc.awayScore },
        90,
        'FT',
        sc.status === 'FINISHED' ? 'FINISHED' : 'NOT_STARTED',
        `Official Result: ${sc.homeScore} - ${sc.awayScore}`
      );

      // 2. Emit resulting event for settlement engine
      this.emit('fixture:resulted', sc);
      this.stats.totalScorecardsProcessed++;
    }

    this.stats.totalPayloadsIngested++;
    this.stats.lastIngestionTimestamp = Date.now();
    return scorecards;
  }

  /**
   * Universal raw ingest method routing to fixtures, deltas, or scorecards
   */
  public ingestRaw(providerName: string, rawPayload: string | Record<string, unknown>): void {
    const data = typeof rawPayload === 'string' ? (rawPayload.startsWith('{') ? JSON.parse(rawPayload) : null) : rawPayload;
    if (data && (data.message_type === 'bet_settlement' || data.settlement || data.scorecard)) {
      this.ingestScorecards(providerName, rawPayload);
    } else if (data && (data.message_type === 'bet_stop' || data.odds_change || data.odds_deltas)) {
      this.ingestLiveDeltas(providerName, rawPayload);
    } else {
      this.ingestFixtures(providerName, rawPayload);
    }
  }

  public getStats(): IngestionStats {
    return { ...this.stats };
  }

  public getRegisteredProviders(): string[] {
    return Array.from(this.adapters.keys());
  }
}
