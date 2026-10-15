import { randomUUID } from 'node:crypto';

export class QuoteError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, statusCode: number) {
    super(code);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface SelectionSnapshot {
  fixtureId: string;
  fixtureName: string;
  fixtureStatus: string;
  score: { home: number; away: number };
  lastUpdatedAt: number;
  marketId: string;
  marketName: string;
  marketLine?: string | null;
  marketStatus: string;
  selectionId: string;
  selectionName: string;
  selectionStatus: string;
  odds: number;
  fixtureVersion?: number;
  marketType?: string;
  modelVersion?: string;
  dataMode?: string;
}

export interface SelectionSource {
  resolve(fixtureId: string, marketId: string, selectionId: string): Promise<SelectionSnapshot>;
}

export class OddsEngineSelectionSource implements SelectionSource {
  private readonly baseUrl: string;

  constructor(baseUrl = process.env.ODDS_ENGINE_URL || 'http://127.0.0.1:4000') {
    this.baseUrl = baseUrl;
  }

  public async resolve(fixtureId: string, marketId: string, selectionId: string): Promise<SelectionSnapshot> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/v1/fixtures/${encodeURIComponent(fixtureId)}`, {
        signal: AbortSignal.timeout(1500),
      });
    } catch {
      throw new QuoteError('ODDS_SOURCE_UNAVAILABLE', 503);
    }
    if (!response.ok) throw new QuoteError('FIXTURE_UNAVAILABLE', 409);

    let payload: { data?: any };
    try {
      payload = await response.json() as { data?: any };
    } catch {
      throw new QuoteError('ODDS_SOURCE_UNAVAILABLE', 503);
    }
    const fixture = payload.data;
    const market = fixture?.markets?.find((item: any) => item.id === marketId);
    const selection = market?.selections?.find((item: any) => item.id === selectionId);
    if (!fixture || !market || !selection) throw new QuoteError('SELECTION_UNAVAILABLE', 409);

    return {
      fixtureId: String(fixture.id),
      fixtureName: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
      fixtureStatus: String(fixture.status),
      score: { home: Number(fixture.score?.home), away: Number(fixture.score?.away) },
      lastUpdatedAt: Number(fixture.lastUpdatedAt),
      marketId: String(market.id),
      marketName: String(market.name),
      marketLine: market.line == null ? null : String(market.line),
      marketStatus: String(market.status),
      selectionId: String(selection.id),
      selectionName: String(selection.name),
      selectionStatus: String(selection.status),
      odds: Number(selection.odds),
    };
  }
}

export interface ServerQuote {
  quoteId: string;
  userId: string;
  expiresAt: number;
  selection: SelectionSnapshot;
}

export class QuoteService {
  private readonly quotes = new Map<string, ServerQuote>();
  private readonly source: SelectionSource;
  private readonly ttlMs: number;

  constructor(source: SelectionSource = new OddsEngineSelectionSource(), ttlMs = 5000) {
    this.source = source;
    this.ttlMs = ttlMs;
  }

  private assertOpen(selection: SelectionSnapshot): void {
    if (!['LIVE', 'NOT_STARTED'].includes(selection.fixtureStatus)
      || selection.marketStatus !== 'ACTIVE'
      || selection.selectionStatus !== 'ACTIVE'
      || !Number.isFinite(selection.odds)
      || selection.odds <= 1
      || !Number.isFinite(selection.score.home)
      || !Number.isFinite(selection.score.away)) {
      throw new QuoteError('MARKET_NOT_QUOTABLE', 409);
    }
    const maxAgeMs = selection.fixtureStatus === 'LIVE' ? 10000 : 120000;
    if (!Number.isFinite(selection.lastUpdatedAt)
      || selection.lastUpdatedAt > Date.now() + 1000
      || Date.now() - selection.lastUpdatedAt > maxAgeMs) {
      throw new QuoteError('MARKET_STALE', 409);
    }
  }

  public async issue(userId: string, fixtureId: string, marketId: string, selectionId: string): Promise<ServerQuote> {
    if (!fixtureId || !marketId || !selectionId) throw new QuoteError('SELECTION_REQUIRED', 400);
    const selection = await this.source.resolve(fixtureId, marketId, selectionId);
    if (selection.fixtureId !== fixtureId || selection.marketId !== marketId || selection.selectionId !== selectionId) {
      throw new QuoteError('SELECTION_UNAVAILABLE', 409);
    }
    this.assertOpen(selection);

    const now = Date.now();
    for (const [id, quote] of this.quotes) {
      if (quote.expiresAt <= now) this.quotes.delete(id);
    }
    if (this.quotes.size >= 10000) throw new QuoteError('QUOTE_CAPACITY_REACHED', 503);

    const quote: ServerQuote = { quoteId: randomUUID(), userId, expiresAt: now + this.ttlMs, selection };
    this.quotes.set(quote.quoteId, quote);
    return quote;
  }

  public async consume(userId: string, quoteId: string): Promise<SelectionSnapshot> {
    const quote = this.quotes.get(quoteId);
    if (!quote) throw new QuoteError('QUOTE_NOT_FOUND', 409);
    if (quote.userId !== userId) throw new QuoteError('QUOTE_NOT_OWNED', 403);
    // Remove before awaiting the live source so concurrent requests cannot accept the same quote.
    this.quotes.delete(quoteId);
    if (quote.expiresAt <= Date.now()) throw new QuoteError('QUOTE_EXPIRED', 409);

    return this.revalidate(quote.selection);
  }

  public async revalidate(previous: SelectionSnapshot): Promise<SelectionSnapshot> {
    const current = await this.source.resolve(previous.fixtureId, previous.marketId, previous.selectionId);
    this.assertOpen(current);
    if (current.odds !== previous.odds
      || current.fixtureName !== previous.fixtureName
      || current.marketName !== previous.marketName
      || current.marketLine !== previous.marketLine
      || current.selectionName !== previous.selectionName
      || current.fixtureStatus !== previous.fixtureStatus
      || current.score.home !== previous.score.home
      || current.score.away !== previous.score.away) {
      throw new QuoteError('QUOTE_CHANGED', 409);
    }
    return current;
  }
}
