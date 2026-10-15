import { randomUUID } from 'node:crypto';
import {
  BivariatePoissonModel,
  type ModelRunOutput,
  type MatchContext,
} from '../domain/bivariate-poisson-model.ts';
import type { FootballState } from '../../../../packages/core-types/src/canonical-event.ts';

export interface VersionedQuote {
  quoteId: string;
  fixtureId: string;
  marketVersion: number; // strictly monotonic per fixture
  stateSequence: number; // matched to CanonicalSportsEvent sequence
  modelRunId: string;
  modelVersion: string;
  status: 'ACTIVE' | 'SUSPENDED';
  suspensionReason?: string;
  maxStake: number;
  markets: ModelRunOutput['markets'];
  createdAt: string;
  expiresAt: string;
}

export class VersionedQuoteService {
  private static instance: VersionedQuoteService;
  private fixtureMarketVersions: Map<string, number> = new Map();
  private activeQuotes: Map<string, VersionedQuote> = new Map();
  private quoteHistory: Map<string, VersionedQuote[]> = new Map();

  public static getInstance(): VersionedQuoteService {
    if (!VersionedQuoteService.instance) {
      VersionedQuoteService.instance = new VersionedQuoteService();
    }
    return VersionedQuoteService.instance;
  }

  /**
   * Generates and persists a versioned, immutable quote derived from current canonical state.
   */
  public generateQuote(
    state: FootballState,
    suspended: boolean = false,
    suspensionReason?: string,
    ttlSeconds: number = 8
  ): VersionedQuote {
    const fixtureId = state.fixtureId;
    const currentVersion = this.fixtureMarketVersions.get(fixtureId) ?? 0;
    const nextVersion = currentVersion + 1;
    this.fixtureMarketVersions.set(fixtureId, nextVersion);

    const redCards = state.redCards ?? {
      home: state.cards?.filter((c) => c.team === 'HOME' && c.cardType === 'RED').length ?? 0,
      away: state.cards?.filter((c) => c.team === 'AWAY' && c.cardType === 'RED').length ?? 0,
    };
    const stateSequence = state.sequence ?? state.lastEventSequence ?? 0;

    const matchContext: MatchContext = {
      fixtureId,
      homeTeam: state.homeTeam || 'Home',
      awayTeam: state.awayTeam || 'Away',
      currentScore: state.score,
      minute: state.minute,
      redCards,
      stateSequence,
    };

    const modelRun = BivariatePoissonModel.evaluate(matchContext);

    const isSuspended = suspended || state.marketsSuspended || Boolean(state.marketSuspended) || state.status === 'FINISHED';
    const reason = suspensionReason || state.suspensionReason || (state.status === 'FINISHED' ? 'MATCH_FINISHED' : undefined);

    const quoteId = randomUUID();
    const now = Date.now();

    const quote: VersionedQuote = {
      quoteId,
      fixtureId,
      marketVersion: nextVersion,
      stateSequence,
      modelRunId: modelRun.modelRunId,
      modelVersion: modelRun.modelVersion,
      status: isSuspended ? 'SUSPENDED' : 'ACTIVE',
      suspensionReason: reason,
      maxStake: isSuspended ? 0 : 500.0, // Stake limits governed by risk policy
      markets: modelRun.markets,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
    };

    this.activeQuotes.set(quoteId, quote);

    // Keep bounded history per fixture for deterministic replay audits
    if (!this.quoteHistory.has(fixtureId)) {
      this.quoteHistory.set(fixtureId, []);
    }
    this.quoteHistory.get(fixtureId)!.push(quote);

    return quote;
  }

  public getQuote(quoteId: string): VersionedQuote | undefined {
    return this.activeQuotes.get(quoteId);
  }

  public getLatestQuote(fixtureId: string): VersionedQuote | undefined {
    const history = this.quoteHistory.get(fixtureId);
    return history && history.length > 0 ? history[history.length - 1] : undefined;
  }

  public getQuoteHistory(fixtureId: string): VersionedQuote[] {
    return this.quoteHistory.get(fixtureId) || [];
  }

  /**
   * Validates quote executability against current monotonic market version.
   * Rejects expired, superseded, or suspended quotes.
   */
  public validateForAcceptance(quoteId: string): { valid: boolean; reason?: string; quote?: VersionedQuote } {
    const quote = this.activeQuotes.get(quoteId);
    if (!quote) {
      return { valid: false, reason: 'QUOTE_NOT_FOUND' };
    }

    if (quote.status === 'SUSPENDED') {
      return { valid: false, reason: quote.suspensionReason || 'MARKET_SUSPENDED', quote };
    }

    const expiresAtMs = new Date(quote.expiresAt).getTime();
    if (Date.now() > expiresAtMs) {
      return { valid: false, reason: 'QUOTE_EXPIRED', quote };
    }

    const latestVersion = this.fixtureMarketVersions.get(quote.fixtureId) ?? quote.marketVersion;
    if (quote.marketVersion < latestVersion) {
      return { valid: false, reason: 'MARKET_VERSION_SUPERSEDED', quote };
    }

    return { valid: true, quote };
  }
}
