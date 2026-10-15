import { EventEmitter } from 'events';

export interface LiveSelectionState {
  id: string;
  name: string;
  odds: number;
  previousOdds: number | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'WON' | 'LOST' | 'VOID';
  probability: number;
  sortOrder: number;
}

export interface LiveMarketState {
  id: string;
  marketType: string;
  name: string;
  line?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'SETTLED' | 'VOID';
  isInPlay: boolean;
  sortOrder: number;
  selections: Map<string, LiveSelectionState>;
}

export interface LiveFixtureState {
  id: string;
  tournamentId: number;
  tournamentName: string;
  sportId: number;
  sportName: string;
  homeTeam: string;
  awayTeam: string;
  startTime: Date;
  status: 'NOT_STARTED' | 'LIVE' | 'HALF_TIME' | 'FINISHED';
  isInPlay: boolean;
  score: { home: number; away: number };
  periodScores: Array<{ period: string; home: number; away: number }>;
  matchMinute: number;
  matchClock: string;
  lastEvent: string;
  lastUpdatedAt?: number;
  markets: Map<string, LiveMarketState>;
}

export interface LiveOddsDelta {
  fixtureId: string;
  marketId: string;
  selectionId: string;
  selectionName: string;
  newOdds: number;
  oldOdds: number | null;
  status: string;
  timestamp: number;
}

export interface LiveScoreDelta {
  fixtureId: string;
  score: { home: number; away: number };
  matchMinute: number;
  matchClock: string;
  status: string;
  lastEvent: string;
  timestamp: number;
}

export class LiveStateManager extends EventEmitter {
  private static instance: LiveStateManager;
  private fixtures: Map<string, LiveFixtureState> = new Map();

  private constructor() {
    super();
  }

  public static getInstance(): LiveStateManager {
    if (!LiveStateManager.instance) {
      LiveStateManager.instance = new LiveStateManager();
    }
    return LiveStateManager.instance;
  }

  public setFixture(fixture: LiveFixtureState): void {
    fixture.lastUpdatedAt = Date.now();
    this.fixtures.set(fixture.id, fixture);
    this.emit('fixture:updated', fixture);
  }

  public getFixture(id: string): LiveFixtureState | undefined {
    return this.fixtures.get(id);
  }

  public getAllInPlayFixtures(): LiveFixtureState[] {
    return Array.from(this.fixtures.values()).filter((f) => f.isInPlay || f.status === 'LIVE');
  }

  public getAllFixtures(): LiveFixtureState[] {
    return Array.from(this.fixtures.values());
  }

  public updateOdds(
    fixtureId: string,
    marketId: string,
    selectionId: string,
    newOdds: number,
    status: 'ACTIVE' | 'SUSPENDED' | 'WON' | 'LOST' | 'VOID' = 'ACTIVE'
  ): LiveOddsDelta | null {
    const fixture = this.fixtures.get(fixtureId);
    if (!fixture) return null;

    const market = fixture.markets.get(marketId);
    if (!market) return null;

    const selection = market.selections.get(selectionId);
    if (!selection) return null;

    const oldOdds = selection.odds;
    if (oldOdds === newOdds && selection.status === status) {
      return null; // No change
    }

    selection.previousOdds = oldOdds;
    selection.odds = newOdds;
    selection.status = status;
    fixture.lastUpdatedAt = Date.now();

    const delta: LiveOddsDelta = {
      fixtureId,
      marketId,
      selectionId,
      selectionName: selection.name,
      newOdds,
      oldOdds,
      status,
      timestamp: Date.now(),
    };

    this.emit('odds:tick', delta);
    return delta;
  }

  public updateMatchState(
    fixtureId: string,
    score: { home: number; away: number },
    minute: number,
    clock: string,
    status: 'NOT_STARTED' | 'LIVE' | 'HALF_TIME' | 'FINISHED',
    lastEvent: string
  ): LiveScoreDelta | null {
    const fixture = this.fixtures.get(fixtureId);
    if (!fixture) return null;

    fixture.score = score;
    fixture.matchMinute = minute;
    fixture.matchClock = clock;
    fixture.status = status;
    fixture.lastEvent = lastEvent;
    fixture.lastUpdatedAt = Date.now();

    const delta: LiveScoreDelta = {
      fixtureId,
      score,
      matchMinute: minute,
      matchClock: clock,
      status,
      lastEvent,
      timestamp: Date.now(),
    };

    this.emit('score:change', delta);
    return delta;
  }

  public suspendMarket(fixtureId: string, marketId: string, isSuspended: boolean): void {
    const fixture = this.fixtures.get(fixtureId);
    if (!fixture) return;

    const market = fixture.markets.get(marketId);
    if (!market) return;

    market.status = isSuspended ? 'SUSPENDED' : 'ACTIVE';
    fixture.lastUpdatedAt = Date.now();
    for (const selection of market.selections.values()) {
      selection.status = isSuspended ? 'SUSPENDED' : 'ACTIVE';
      this.emit('odds:tick', {
        fixtureId,
        marketId,
        selectionId: selection.id,
        selectionName: selection.name,
        newOdds: selection.odds,
        oldOdds: selection.previousOdds,
        status: selection.status,
        timestamp: Date.now(),
      });
    }
  }

  public suspendAllFixtureMarkets(fixtureId: string, isSuspended: boolean): void {
    const fixture = this.fixtures.get(fixtureId);
    if (!fixture) return;

    fixture.lastUpdatedAt = Date.now();
    for (const market of fixture.markets.values()) {
      market.status = isSuspended ? 'SUSPENDED' : 'ACTIVE';
      for (const selection of market.selections.values()) {
        selection.status = isSuspended ? 'SUSPENDED' : 'ACTIVE';
        this.emit('odds:tick', {
          fixtureId,
          marketId: market.id,
          selectionId: selection.id,
          selectionName: selection.name,
          newOdds: selection.odds,
          oldOdds: selection.previousOdds,
          status: selection.status,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Serializes fixture into JSON-safe format for REST & WebSockets
   */
  public serializeFixture(fixture: LiveFixtureState): Record<string, unknown> {
    const serializedMarkets = Array.from(fixture.markets.values()).map((m) => ({
      id: m.id,
      marketType: m.marketType,
      name: m.name,
      line: m.line,
      status: m.status,
      isInPlay: m.isInPlay,
      sortOrder: m.sortOrder,
      selections: Array.from(m.selections.values()),
    }));

    return {
      id: fixture.id,
      tournamentId: fixture.tournamentId,
      tournamentName: fixture.tournamentName,
      sportId: fixture.sportId,
      sportName: fixture.sportName,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      startTime: fixture.startTime.toISOString(),
      status: fixture.status,
      isInPlay: fixture.isInPlay,
      score: fixture.score,
      periodScores: fixture.periodScores,
      matchMinute: fixture.matchMinute,
      matchClock: fixture.matchClock,
      lastEvent: fixture.lastEvent,
      lastUpdatedAt: fixture.lastUpdatedAt,
      markets: serializedMarkets,
    };
  }
}
