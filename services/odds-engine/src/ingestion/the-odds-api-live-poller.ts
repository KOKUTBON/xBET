/**
 * The Odds API — Real Live Feed Poller
 * ------------------------------------
 * Connects the platform to REAL sports data the way licensed sportsbooks do:
 * through a licensed data-feed provider. This uses The Odds API (the-odds-api.com),
 * which exposes a FREE tier — genuine bookmaker odds and real live match scores/results —
 * so an education/points project can run on real data without scraping anyone.
 *
 * How it maps to the existing engine:
 *   /v4/sports/{sport}/odds    -> real fixtures + 1X2 / totals / spreads  -> ingestFixtures()
 *   /v4/sports/{sport}/scores  -> real live scores + finished results     -> ingestScorecards()
 *
 * ingestFixtures() pushes to live state -> WebSocket -> your site.
 * ingestScorecards() emits 'fixture:resulted' -> settlement engine -> points ledger (win/lose).
 *
 * No API key? The poller does NOT fabricate data. It logs a clear notice and the engine
 * falls back to the local LiveSportsSimulator so the site is never empty.
 */

import { FeedIngestionService } from './feed-ingestion-service.ts';

export interface LivePollerConfig {
  apiKey: string;
  /** Sport keys to track, e.g. ['soccer_epl', 'soccer_uefa_champs_league', 'basketball_nba']. */
  sports: string[];
  /** Regions for bookmaker odds (uk, us, eu, au). */
  regions: string;
  /** Markets to request. h2h = 1X2/moneyline, totals = over/under, spreads = handicap. */
  markets: string;
  /** How often to refresh odds (ms). Keep modest on the free tier (500 req/month). */
  oddsPollIntervalMs: number;
  /** How often to refresh live scores/results (ms). */
  scoresPollIntervalMs: number;
}

const API_BASE = 'https://api.the-odds-api.com/v4';

export class TheOddsApiLivePoller {
  private readonly cfg: LivePollerConfig;
  private readonly ingestion: FeedIngestionService;
  private oddsTimer: NodeJS.Timeout | null = null;
  private scoresTimer: NodeJS.Timeout | null = null;
  private running = false;
  private requestsUsed = 0;
  private requestsRemaining: number | null = null;

  constructor(cfg: LivePollerConfig, ingestion?: FeedIngestionService) {
    this.cfg = cfg;
    this.ingestion = ingestion ?? FeedIngestionService.getInstance();
  }

  /** Returns true if the poller started (a real key is present), false if it declined. */
  public start(): boolean {
    if (!this.cfg.apiKey || this.cfg.apiKey.includes('demo') || this.cfg.apiKey.length < 8) {
      console.warn(
        '[LiveFeed] No valid THE_ODDS_API_KEY set. Real feed disabled — falling back to the local simulator.\n' +
        '           Get a free key at https://the-odds-api.com and set THE_ODDS_API_KEY to stream real matches.'
      );
      return false;
    }

    this.running = true;
    console.log(`[LiveFeed] Real feed ACTIVE (The Odds API). Sports: ${this.cfg.sports.join(', ')}`);

    // Immediate first pull, then intervals.
    void this.pollOdds();
    void this.pollScores();

    this.oddsTimer = setInterval(() => void this.pollOdds(), this.cfg.oddsPollIntervalMs);
    this.scoresTimer = setInterval(() => void this.pollScores(), this.cfg.scoresPollIntervalMs);
    return true;
  }

  public stop(): void {
    this.running = false;
    if (this.oddsTimer) clearInterval(this.oddsTimer);
    if (this.scoresTimer) clearInterval(this.scoresTimer);
    this.oddsTimer = null;
    this.scoresTimer = null;
  }

  public getUsage(): { used: number; remaining: number | null } {
    return { used: this.requestsUsed, remaining: this.requestsRemaining };
  }

  /** Fetch real odds for each tracked sport and ingest as fixtures + markets. */
  private async pollOdds(): Promise<void> {
    if (!this.running) return;
    for (const sport of this.cfg.sports) {
      const url =
        `${API_BASE}/sports/${sport}/odds` +
        `?apiKey=${this.cfg.apiKey}&regions=${this.cfg.regions}` +
        `&markets=${this.cfg.markets}&oddsFormat=decimal&dateFormat=iso`;
      try {
        const events = await this.fetchJson(url);
        if (Array.isArray(events) && events.length > 0) {
          // The adapter parses The-Odds-API's native event shape directly.
          this.ingestion.ingestFixtures('TheOddsAPI', events as unknown as Record<string, unknown>);
        }
      } catch (err) {
        console.warn(`[LiveFeed] odds fetch failed for ${sport}:`, (err as Error).message);
      }
    }
  }

  /**
   * Fetch real live scores and final results. `daysFrom=1` includes recently completed
   * matches so bets settle automatically once the real fixture finishes.
   */
  private async pollScores(): Promise<void> {
    if (!this.running) return;
    for (const sport of this.cfg.sports) {
      const url =
        `${API_BASE}/sports/${sport}/scores` +
        `?apiKey=${this.cfg.apiKey}&daysFrom=1&dateFormat=iso`;
      try {
        const games = await this.fetchJson(url);
        if (!Array.isArray(games)) continue;

        for (const g of games as any[]) {
          const home = g.home_team;
          const away = g.away_team;
          const homeScoreObj = (g.scores || []).find((s: any) => s.name === home);
          const awayScoreObj = (g.scores || []).find((s: any) => s.name === away);

          // Live in-play score update (keeps the site's scoreboard real-time).
          this.ingestion.ingestScorecards('TheOddsAPI', {
            scores: [
              {
                id: g.id,
                fixtureId: g.id,
                homeScore: Number(homeScoreObj?.score ?? 0),
                awayScore: Number(awayScoreObj?.score ?? 0),
                // Only a completed game triggers final settlement -> points move.
                status: g.completed ? 'FINISHED' : 'NOT_STARTED',
                isVoid: false,
              },
            ],
          });
        }
      } catch (err) {
        console.warn(`[LiveFeed] scores fetch failed for ${sport}:`, (err as Error).message);
      }
    }
  }

  private async fetchJson(url: string): Promise<unknown> {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    // The Odds API returns quota headers on every response.
    const remaining = res.headers.get('x-requests-remaining');
    const used = res.headers.get('x-requests-used');
    if (remaining !== null) this.requestsRemaining = Number(remaining);
    if (used !== null) this.requestsUsed = Number(used);

    if (res.status === 401) throw new Error('unauthorized (check THE_ODDS_API_KEY)');
    if (res.status === 429) throw new Error('rate limited / monthly quota exhausted');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

/** Build a poller from environment variables. */
export function createLivePollerFromEnv(): TheOddsApiLivePoller {
  return new TheOddsApiLivePoller({
    apiKey: process.env.THE_ODDS_API_KEY || '',
    sports: (process.env.LIVE_FEED_SPORTS ||
      'soccer_epl,soccer_uefa_champs_league,basketball_nba').split(',').map((s) => s.trim()).filter(Boolean),
    regions: process.env.LIVE_FEED_REGIONS || 'uk,eu',
    markets: process.env.LIVE_FEED_MARKETS || 'h2h,totals',
    oddsPollIntervalMs: parseInt(process.env.LIVE_FEED_ODDS_INTERVAL_MS || '60000', 10),
    scoresPollIntervalMs: parseInt(process.env.LIVE_FEED_SCORES_INTERVAL_MS || '30000', 10),
  });
}
