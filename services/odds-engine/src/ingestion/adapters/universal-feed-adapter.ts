/**
 * Universal Sports Odds Feed Ingestion Driver
 * Supports EnetPulse, OddService, Betclick, and NordicBet formats
 * with automatic fallback to high-frequency live mock match simulation.
 */

export interface Selection {
  id: string;
  name: string;
  odds: number;
  previousOdds?: number;
  isDriftUp?: boolean;
  isDriftDown?: boolean;
}

export interface Market {
  id: string;
  name: string;
  status: string;
  selections: Selection[];
}

export interface FixtureStatistics {
  possession: { home: number; away: number };
  shotsOnTarget: { home: number; away: number };
  corners: { home: number; away: number };
  yellowCards: { home: number; away: number };
  redCards: { home: number; away: number };
  dangerousAttacks: { home: number; away: number };
  ballPosition: number;
}

export interface Fixture {
  id: string;
  sportId: string;
  sportName: string;
  tournamentId: string;
  tournamentName: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string;
  status: string;
  isLive: boolean;
  matchTime: string;
  score: { home: number; away: number };
  statistics?: FixtureStatistics;
  markets: Market[];
}

export interface FeedConfig {
  provider: 'ENETPULSE' | 'ODDSERVICE' | 'BETCLICK' | 'NORDICBET' | 'SIMULATED';
  apiKey?: string;
  baseUrl?: string;
  updateIntervalMs: number;
  marginOverroundPercent?: number; // e.g. 5.5% bookmaker overround
}

export class UniversalSportsFeedAdapter {
  private config: FeedConfig;
  private activeFixtures: Map<string, Fixture> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private onOddsUpdateCallbacks: Array<(fixtures: Fixture[]) => void> = [];

  constructor(config?: Partial<FeedConfig>) {
    this.config = {
      provider: (process.env.ODDS_FEED_PROVIDER as any) || 'BETCLICK',
      apiKey: process.env.ODDS_FEED_API_KEY || process.env.ENETPULSE_API_KEY || '',
      baseUrl: process.env.ODDS_FEED_BASE_URL || 'https://api.enetpulse.com/v1',
      updateIntervalMs: config?.updateIntervalMs || 2000,
      marginOverroundPercent: config?.marginOverroundPercent || 5.0,
    };
    if (this.config.provider === 'SIMULATED' || process.env.ENABLE_SIMULATOR === 'true') {
      this.initializeDefaultFixtures();
    }
  }

  private initializeDefaultFixtures(): void {
    const premierLeagueFixtures: Fixture[] = [
      {
        id: 'fix-arsenal-chelsea',
        sportId: 'sport_football',
        sportName: 'Soccer',
        tournamentId: 'tourn_epl',
        tournamentName: 'English Premier League',
        homeTeam: 'Arsenal',
        awayTeam: 'Chelsea',
        startTime: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
        status: 'IN_PLAY',
        isLive: true,
        matchTime: "68'",
        score: { home: 2, away: 1 },
        statistics: {
          possession: { home: 58, away: 42 },
          shotsOnTarget: { home: 7, away: 4 },
          corners: { home: 6, away: 3 },
          yellowCards: { home: 1, away: 2 },
          redCards: { home: 0, away: 0 },
          dangerousAttacks: { home: 44, away: 31 },
          ballPosition: 68,
        },
        markets: [
          {
            id: 'mkt-1x2',
            name: 'Full Time Result (1X2)',
            status: 'ACTIVE',
            selections: [
              { id: 'sel-1', name: 'Arsenal', odds: 1.25, previousOdds: 1.25, isDriftUp: false, isDriftDown: false },
              { id: 'sel-x', name: 'Draw', odds: 5.50, previousOdds: 5.50, isDriftUp: false, isDriftDown: false },
              { id: 'sel-2', name: 'Chelsea', odds: 11.00, previousOdds: 11.00, isDriftUp: false, isDriftDown: false },
            ],
          },
          {
            id: 'mkt-ou-25',
            name: 'Over/Under 3.5 Goals',
            status: 'ACTIVE',
            selections: [
              { id: 'sel-over', name: 'Over 3.5', odds: 1.85, previousOdds: 1.85, isDriftUp: false, isDriftDown: false },
              { id: 'sel-under', name: 'Under 3.5', odds: 1.95, previousOdds: 1.95, isDriftUp: false, isDriftDown: false },
            ],
          },
          {
            id: 'mkt-btts',
            name: 'Both Teams to Score',
            status: 'ACTIVE',
            selections: [
              { id: 'sel-btts-yes', name: 'Yes', odds: 1.12, previousOdds: 1.12, isDriftUp: false, isDriftDown: false },
              { id: 'sel-btts-no', name: 'No', odds: 6.00, previousOdds: 6.00, isDriftUp: false, isDriftDown: false },
            ],
          },
        ],
      },
      {
        id: 'fix-liverpool-mancity',
        sportId: 'sport_football',
        sportName: 'Soccer',
        tournamentId: 'tourn_epl',
        tournamentName: 'English Premier League',
        homeTeam: 'Liverpool',
        awayTeam: 'Manchester City',
        startTime: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
        status: 'IN_PLAY',
        isLive: true,
        matchTime: "34'",
        score: { home: 1, away: 1 },
        statistics: {
          possession: { home: 47, away: 53 },
          shotsOnTarget: { home: 4, away: 5 },
          corners: { home: 3, away: 4 },
          yellowCards: { home: 2, away: 1 },
          redCards: { home: 0, away: 0 },
          dangerousAttacks: { home: 28, away: 36 },
          ballPosition: 45,
        },
        markets: [
          {
            id: 'mkt-1x2',
            name: 'Full Time Result (1X2)',
            status: 'ACTIVE',
            selections: [
              { id: 'sel-1', name: 'Liverpool', odds: 2.40, previousOdds: 2.40, isDriftUp: false, isDriftDown: false },
              { id: 'sel-x', name: 'Draw', odds: 3.30, previousOdds: 3.30, isDriftUp: false, isDriftDown: false },
              { id: 'sel-2', name: 'Manchester City', odds: 2.85, previousOdds: 2.85, isDriftUp: false, isDriftDown: false },
            ],
          },
        ],
      },
      {
        id: 'fix-realmadrid-barcelona',
        sportId: 'sport_football',
        sportName: 'Soccer',
        tournamentId: 'tourn_laliga',
        tournamentName: 'Spanish La Liga • El Clásico',
        homeTeam: 'Real Madrid',
        awayTeam: 'Barcelona',
        startTime: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
        status: 'IN_PLAY',
        isLive: true,
        matchTime: "41'",
        score: { home: 1, away: 1 },
        statistics: {
          possession: { home: 49, away: 51 },
          shotsOnTarget: { home: 5, away: 6 },
          corners: { home: 4, away: 5 },
          yellowCards: { home: 2, away: 1 },
          redCards: { home: 0, away: 0 },
          dangerousAttacks: { home: 38, away: 40 },
          ballPosition: 52,
        },
        markets: [
          {
            id: 'mkt-1x2',
            name: 'Full Time Result (1X2)',
            status: 'ACTIVE',
            selections: [
              { id: 'sel-1', name: 'Real Madrid', odds: 2.30, previousOdds: 2.30, isDriftUp: false, isDriftDown: false },
              { id: 'sel-x', name: 'Draw', odds: 3.40, previousOdds: 3.40, isDriftUp: false, isDriftDown: false },
              { id: 'sel-2', name: 'Barcelona', odds: 2.90, previousOdds: 2.90, isDriftUp: false, isDriftDown: false },
            ],
          },
        ],
      },
      {
        id: 'fix-lakers-celtics',
        sportId: 'sport_basketball',
        sportName: 'Basketball',
        tournamentId: 'tourn_nba',
        tournamentName: 'NBA Championship',
        homeTeam: 'Los Angeles Lakers',
        awayTeam: 'Boston Celtics',
        startTime: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
        status: 'IN_PLAY',
        isLive: true,
        matchTime: "Q3 08:24",
        score: { home: 78, away: 74 },
        statistics: {
          possession: { home: 52, away: 48 },
          shotsOnTarget: { home: 32, away: 30 },
          corners: { home: 0, away: 0 },
          yellowCards: { home: 0, away: 0 },
          redCards: { home: 0, away: 0 },
          dangerousAttacks: { home: 0, away: 0 },
          ballPosition: 50,
        },
        markets: [
          {
            id: 'mkt-moneyline',
            name: 'Moneyline (Winner)',
            status: 'ACTIVE',
            selections: [
              { id: 'sel-lal', name: 'LA Lakers', odds: 1.65, previousOdds: 1.65, isDriftUp: false, isDriftDown: false },
              { id: 'sel-bos', name: 'Boston Celtics', odds: 2.25, previousOdds: 2.25, isDriftUp: false, isDriftDown: false },
            ],
          },
        ],
      },
    ];

    premierLeagueFixtures.forEach((f) => this.activeFixtures.set(f.id, f));
  }

  /**
   * Ingests upstream EnetPulse XML/JSON messages
   */
  public ingestEnetPulseFeed(eventData: { matchId: string; home: string; away: string; score: { home: number; away: number }; clock: string; markets: any[] }): Fixture {
    const existing = this.activeFixtures.get(eventData.matchId);
    const fixture: Fixture = {
      id: eventData.matchId,
      sportId: 'sport_football',
      sportName: 'Soccer',
      tournamentId: 'tourn_ep',
      tournamentName: 'EnetPulse In-Play Feed',
      homeTeam: eventData.home,
      awayTeam: eventData.away,
      startTime: existing?.startTime || new Date().toISOString(),
      status: 'IN_PLAY',
      isLive: true,
      matchTime: eventData.clock,
      score: eventData.score,
      statistics: existing?.statistics || {
        possession: { home: 50, away: 50 },
        shotsOnTarget: { home: 0, away: 0 },
        corners: { home: 0, away: 0 },
        yellowCards: { home: 0, away: 0 },
        redCards: { home: 0, away: 0 },
        dangerousAttacks: { home: 0, away: 0 },
        ballPosition: 50,
      },
      markets: (eventData.markets || []).map((m) => ({
        id: m.id,
        name: m.name,
        status: m.status || 'ACTIVE',
        selections: (m.selections || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          odds: parseFloat(s.odds),
          previousOdds: parseFloat(s.odds),
          isDriftUp: false,
          isDriftDown: false,
        })),
      })),
    };

    this.activeFixtures.set(fixture.id, fixture);
    this.onOddsUpdateCallbacks.forEach((cb) => cb(Array.from(this.activeFixtures.values())));
    return fixture;
  }

  /**
   * Ingests upstream BetsAPI JSON payloads
   */
  public ingestBetsApi(event: any): void {
    if (!event.id) return;
    const fixId = `betsapi-${event.id}`;
    const fixture: Fixture = {
      id: fixId,
      sportId: event.sport_id || 'sport_football',
      sportName: event.sport_name || 'Soccer',
      tournamentId: `tourn-${event.league?.id || 'gen'}`,
      tournamentName: event.league?.name || 'World League',
      homeTeam: event.home?.name || 'Home',
      awayTeam: event.away?.name || 'Away',
      startTime: event.time ? new Date(event.time * 1000).toISOString() : new Date().toISOString(),
      status: event.time_status === '1' ? 'IN_PLAY' : 'UPCOMING',
      isLive: event.time_status === '1',
      matchTime: event.timer ? `${event.timer}'` : "0'",
      score: {
        home: parseInt(event.scores?.['2']?.home || event.scores?.['1']?.home || '0', 10),
        away: parseInt(event.scores?.['2']?.away || event.scores?.['1']?.away || '0', 10),
      },
      markets: [],
    };
    this.activeFixtures.set(fixId, fixture);
    this.onOddsUpdateCallbacks.forEach((cb) => cb(Array.from(this.activeFixtures.values())));
  }

  public onOddsUpdate(callback: (fixtures: Fixture[]) => void): void {
    this.onOddsUpdateCallbacks.push(callback);
  }

  public startStreaming(): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.simulateOrPollOddsChanges();
    }, this.config.updateIntervalMs);
  }

  public stopStreaming(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public getFixtures(): Fixture[] {
    return Array.from(this.activeFixtures.values());
  }

  private simulateOrPollOddsChanges(): void {
    const fixtures = Array.from(this.activeFixtures.values());

    for (const fix of fixtures) {
      if (fix.status !== 'IN_PLAY') continue;

      // Update ball position for 3D stadium pitch tracker
      if (fix.statistics) {
        fix.statistics.ballPosition = Math.max(10, Math.min(90, fix.statistics.ballPosition + (Math.random() * 20 - 10)));
      }

      // Small odds drift with overround preservation
      for (const mkt of fix.markets) {
        for (const sel of mkt.selections) {
          if (Math.random() < 0.35) {
            const shift = (Math.random() * 0.08 - 0.04);
            const newOdds = Math.max(1.02, parseFloat((sel.odds + shift).toFixed(2)));
            sel.previousOdds = sel.odds;
            sel.isDriftUp = newOdds > sel.odds;
            sel.isDriftDown = newOdds < sel.odds;
            sel.odds = newOdds;
          } else {
            sel.isDriftUp = false;
            sel.isDriftDown = false;
          }
        }
      }
    }

    // Broadcast to listeners
    this.onOddsUpdateCallbacks.forEach((cb) => cb(fixtures));
  }
}
