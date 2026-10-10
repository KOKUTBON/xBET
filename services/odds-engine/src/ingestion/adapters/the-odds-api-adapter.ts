/**
 * The Odds API & xBET Relay Ingestion Adapter
 * Ingests live real-world sports fixtures, 1X2, spreads, totals, and in-play live scores
 * formatted from The-Odds-API (the-odds-api.com) and xBET JSON relay proxies.
 */

import type {
  IFeedAdapter,
  NormalizedSport,
  NormalizedTournament,
  NormalizedFixture,
  NormalizedMarket,
  NormalizedSelection,
  NormalizedOddsDelta,
  NormalizedScorecard,
} from '../feed-types.ts';

export class TheOddsApiAdapter implements IFeedAdapter {
  public readonly providerName = 'TheOddsAPI';

  public parseSports(payload: string | Record<string, unknown> | Array<any>): NormalizedSport[] {
    const rawList = Array.isArray(payload) ? payload : (payload as any).data || (payload as any).sports || [];
    const results: NormalizedSport[] = [];

    for (const item of rawList) {
      results.push({
        externalId: `toa-sport-${item.key || item.id || item.group}`,
        name: item.title || item.group || item.name || 'Soccer',
        slug: String(item.key || item.title || 'soccer').toLowerCase().replace(/\s+/g, '-'),
      });
    }
    return results;
  }

  public parseTournaments(payload: string | Record<string, unknown> | Array<any>): NormalizedTournament[] {
    const rawList = Array.isArray(payload) ? payload : (payload as any).data || [];
    const results: NormalizedTournament[] = [];

    for (const item of rawList) {
      results.push({
        externalId: `toa-tourn-${item.key || item.id}`,
        sportExternalId: `toa-sport-${item.group || 'soccer'}`,
        name: item.title || item.description || 'League',
        slug: String(item.key || item.title || 'league').toLowerCase().replace(/\s+/g, '-'),
      });
    }
    return results;
  }

  public parseFixtures(payload: string | Record<string, unknown> | Array<any>): NormalizedFixture[] {
    const rawList = Array.isArray(payload) ? payload : (payload as any).data || (payload as any).events || [payload];
    const results: NormalizedFixture[] = [];

    for (const item of rawList) {
      if (!item.id && !item.home_team && !item.homeTeam) continue;

      const fixId = item.id || `toa-${Date.now()}`;
      const homeTeam = item.home_team || item.homeTeam || item.teams?.[0] || 'Home';
      const awayTeam = item.away_team || item.awayTeam || item.teams?.[1] || 'Away';
      const sportKey = item.sport_key || item.sportKey || 'soccer_epl';
      const sportTitle = item.sport_title || item.sportTitle || 'Soccer';

      // Parse bookmaker markets (Prefer xBET or Pinnacle if available)
      const bookmakers = item.bookmakers || item.sites || [];
      const primaryBookmaker = bookmakers.find((b: any) => b.key === 'xbet' || b.key === 'pinnacle') || bookmakers[0];

      const markets: NormalizedMarket[] = [];

      if (primaryBookmaker && primaryBookmaker.markets) {
        for (let mIdx = 0; mIdx < primaryBookmaker.markets.length; mIdx++) {
          const mkt = primaryBookmaker.markets[mIdx];
          const mktType = this.normalizeMarketKey(mkt.key);

          const selections: NormalizedSelection[] = (mkt.outcomes || []).map((out: any, oIdx: number) => ({
            externalId: `toa-sel-${fixId}-${mkt.key}-${out.name || oIdx}`,
            name: out.name === homeTeam ? 'Home' : out.name === awayTeam ? 'Away' : out.name,
            odds: Number(out.price || out.odds || 1.0),
            status: 'ACTIVE',
            sortOrder: oIdx + 1,
          }));

          markets.push({
            externalId: `toa-mkt-${fixId}-${mkt.key}`,
            marketType: mktType,
            name: this.getMarketDisplayName(mkt.key),
            line: mkt.line ? String(mkt.line) : undefined,
            status: 'ACTIVE',
            isInPlay: Boolean(item.completed === false && (item.scores || item.clock)),
            sortOrder: mIdx + 1,
            selections,
          });
        }
      }

      // Parse live scores if available
      let score = { home: 0, away: 0 };
      if (item.scores && Array.isArray(item.scores)) {
        const homeScoreObj = item.scores.find((s: any) => s.name === homeTeam);
        const awayScoreObj = item.scores.find((s: any) => s.name === awayTeam);
        score = {
          home: Number(homeScoreObj?.score || 0),
          away: Number(awayScoreObj?.score || 0),
        };
      }

      results.push({
        externalId: `toa-fix-${fixId}`,
        provider: this.providerName,
        sportId: 1,
        sportName: sportTitle,
        tournamentId: 1,
        tournamentName: sportKey.replace(/_/g, ' ').toUpperCase(),
        homeTeam,
        awayTeam,
        startTime: item.commence_time ? new Date(item.commence_time) : new Date(),
        status: item.completed ? 'FINISHED' : (item.scores || item.clock) ? 'LIVE' : 'NOT_STARTED',
        isInPlay: Boolean(item.completed === false && (item.scores || item.clock)),
        score,
        periodScores: [],
        matchMinute: Number(item.minute || 0),
        matchClock: item.clock || '00:00',
        markets,
      });
    }

    return results;
  }

  public parseLiveDeltas(payload: string | Record<string, unknown> | Array<any>): NormalizedOddsDelta[] {
    const rawList = Array.isArray(payload) ? payload : (payload as any).deltas || [payload];
    const deltas: NormalizedOddsDelta[] = [];

    for (const item of rawList) {
      if (!item.fixtureId && !item.id) continue;
      const fixId = String(item.fixtureId || item.id).replace(/^toa-fix-/, '');
      const mktKey = item.marketKey || item.marketId || 'h2h';
      const selName = item.name || item.selectionName || '1';

      deltas.push({
        provider: this.providerName,
        fixtureExternalId: `toa-fix-${fixId}`,
        marketExternalId: `toa-mkt-${fixId}-${mktKey}`,
        selectionExternalId: `toa-sel-${fixId}-${mktKey}-${selName}`,
        newOdds: Number(item.price || item.odds || item.newOdds || 1.0),
        status: item.suspended ? 'SUSPENDED' : 'ACTIVE',
        timestamp: Number(item.timestamp || Date.now()),
      });
    }

    return deltas;
  }

  public parseScorecards(payload: string | Record<string, unknown> | Array<any>): NormalizedScorecard[] {
    const rawList = Array.isArray(payload) ? payload : (payload as any).scores || [payload];
    const scorecards: NormalizedScorecard[] = [];

    for (const item of rawList) {
      const fixId = String(item.fixtureId || item.id).replace(/^toa-fix-/, '');
      scorecards.push({
        provider: this.providerName,
        fixtureExternalId: `toa-fix-${fixId}`,
        homeScore: Number(item.homeScore ?? item.score?.home ?? 0),
        awayScore: Number(item.awayScore ?? item.score?.away ?? 0),
        status: (item.status || 'FINISHED') as any,
        isVoid: Boolean(item.isVoid),
      });
    }

    return scorecards;
  }

  private normalizeMarketKey(key: string): string {
    const k = (key || '').toLowerCase();
    if (k.includes('h2h') || k.includes('1x2') || k.includes('moneyline')) return '1X2';
    if (k.includes('totals') || k.includes('over_under')) return 'OVER_UNDER';
    if (k.includes('spreads') || k.includes('handicap')) return 'ASIAN_HANDICAP';
    if (k.includes('btts')) return 'BTTS';
    return '1X2';
  }

  private getMarketDisplayName(key: string): string {
    const k = (key || '').toLowerCase();
    if (k.includes('h2h')) return 'Full Time Result (1X2)';
    if (k.includes('totals')) return 'Total Goals Over / Under';
    if (k.includes('spreads')) return 'Asian Handicap / Spread';
    if (k.includes('btts')) return 'Both Teams To Score';
    return 'Match Result';
  }
}
