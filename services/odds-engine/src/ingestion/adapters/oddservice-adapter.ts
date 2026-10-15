/**
 * OddService & Betradar Unified Odds Feed (UOF) Adapter
 * Parses multi-bookmaker XML and JSON feeds with category/tournament hierarchies,
 * live market offer types, and real-time score updates.
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

export class OddServiceAdapter implements IFeedAdapter {
  public readonly providerName = 'OddService';

  private extractXmlTags(xml: string, tagName: string): Array<Record<string, string>> {
    const regex = new RegExp(`<${tagName}\\s+([^>]+)(?:>(.*?)</${tagName}>|/>)`, 'gis');
    const matches: Array<Record<string, string>> = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(xml)) !== null) {
      const attrsStr = match[1] || '';
      const body = match[2] || '';
      const attrs: Record<string, string> = { _body: body };

      const attrRegex = /([a-zA-Z0-9_-]+)=["']([^"']*)["']/g;
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2];
      }
      matches.push(attrs);
    }
    return matches;
  }

  public parseSports(payload: string | Record<string, unknown>): NormalizedSport[] {
    if (typeof payload === 'object') {
      const sports = (payload.sports || payload.Sports || []) as Array<any>;
      return sports.map((s: any) => ({
        externalId: `odds-sport-${s.id || s.ID}`,
        name: String(s.name || s.Name),
        slug: String(s.name || s.Name).toLowerCase().replace(/\s+/g, '-'),
      }));
    }

    const tags = this.extractXmlTags(payload, 'Sport');
    return tags.map((t) => ({
      externalId: `odds-sport-${t.ID || t.id}`,
      name: t.Name || t.name || 'Unknown Sport',
      slug: (t.Name || t.name || 'sport').toLowerCase().replace(/\s+/g, '-'),
    }));
  }

  public parseTournaments(payload: string | Record<string, unknown>): NormalizedTournament[] {
    if (typeof payload === 'object') {
      const tournaments = (payload.tournaments || payload.Tournaments || []) as Array<any>;
      return tournaments.map((t: any) => ({
        externalId: `odds-tourn-${t.id || t.ID}`,
        sportExternalId: `odds-sport-${t.sportId || t.SportID || 1}`,
        countryExternalId: t.categoryId ? `odds-cat-${t.categoryId}` : undefined,
        name: String(t.name || t.Name),
        slug: String(t.name || t.Name).toLowerCase().replace(/\s+/g, '-'),
      }));
    }

    const tags = this.extractXmlTags(payload, 'Tournament');
    return tags.map((t) => ({
      externalId: `odds-tourn-${t.ID || t.id}`,
      sportExternalId: `odds-sport-${t.SportID || t.sport_id || 1}`,
      countryExternalId: t.CategoryID ? `odds-cat-${t.CategoryID}` : undefined,
      name: t.Name || t.name || 'Unknown Tournament',
      slug: (t.Name || t.name || 'tournament').toLowerCase().replace(/\s+/g, '-'),
    }));
  }

  public parseFixtures(payload: string | Record<string, unknown>): NormalizedFixture[] {
    const results: NormalizedFixture[] = [];

    if (typeof payload === 'object') {
      const matches = (payload.matches || payload.events || payload.Matches || []) as Array<any>;
      for (const m of matches) {
        const fixId = m.id || m.ID;
        const markets: NormalizedMarket[] = (m.markets || m.offerTypes || []).map((mkt: any, idx: number) => ({
          externalId: `odds-mkt-${fixId}-${mkt.id || mkt.ID || idx}`,
          marketType: this.mapOfferTypeToMarketType(mkt.name || mkt.Name || mkt.type),
          name: mkt.name || mkt.Name || '1X2',
          line: mkt.line || mkt.Line,
          status: mkt.isSuspended ? 'SUSPENDED' : 'ACTIVE',
          isInPlay: m.isLive || m.status === 'LIVE',
          sortOrder: idx,
          selections: (mkt.odds || mkt.Odds || []).map((o: any, oIdx: number) => ({
            externalId: `odds-sel-${fixId}-${o.id || o.ID || oIdx}`,
            name: String(o.name || o.Name),
            odds: parseFloat(String(o.value || o.odds || o.Odds || 1.0)),
            status: o.isSuspended ? 'SUSPENDED' : 'ACTIVE',
            sortOrder: oIdx,
          })),
        }));

        results.push({
          externalId: `odds-fix-${fixId}`,
          provider: this.providerName,
          sportId: Number(m.sportId || m.SportID || 1),
          sportName: m.sportName || m.SportName || 'Soccer',
          tournamentId: Number(m.tournamentId || m.TournamentID || 1),
          tournamentName: m.tournamentName || m.TournamentName || 'Premier League',
          homeTeam: m.homeTeam || m.HomeTeam,
          awayTeam: m.awayTeam || m.AwayTeam,
          startTime: m.date || m.Date ? new Date(m.date || m.Date) : new Date(),
          status: this.mapStatus(m.status || m.Status),
          isInPlay: m.status === 'Live' || m.isLive === true,
          score: {
            home: Number(m.homeScore ?? m.HomeScore ?? 0),
            away: Number(m.awayScore ?? m.AwayScore ?? 0),
          },
          periodScores: [],
          matchMinute: Number(m.minute || m.Minute || 0),
          matchClock: m.clock || m.Clock || '00:00',
          markets,
        });
      }
      return results;
    }

    // Parse XML Match tags
    const matchTags = this.extractXmlTags(payload, 'Match');
    for (const mTag of matchTags) {
      const fixId = mTag.ID || mTag.id;
      const body = mTag._body || '';
      const offerTags = this.extractXmlTags(body, 'OfferType');
      const markets: NormalizedMarket[] = [];

      for (let mIdx = 0; mIdx < offerTags.length; mIdx++) {
        const oTag = offerTags[mIdx];
        const oddTags = this.extractXmlTags(oTag._body || '', 'Odd');

        const selections: NormalizedSelection[] = oddTags.map((odd, idx) => ({
          externalId: `odds-sel-${fixId}-${odd.ID || odd.id || idx}`,
          name: odd.Name || odd.name || 'Selection',
          odds: parseFloat(odd.Value || odd.value || '1.0'),
          status: odd.Status === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
          sortOrder: idx,
        }));

        markets.push({
          externalId: `odds-mkt-${fixId}-${oTag.ID || oTag.id || mIdx}`,
          marketType: this.mapOfferTypeToMarketType(oTag.Name || oTag.name || '1X2'),
          name: oTag.Name || oTag.name || '1X2',
          line: oTag.Line || oTag.line,
          status: oTag.Status === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
          isInPlay: mTag.Status === 'Live',
          sortOrder: mIdx,
          selections,
        });
      }

      results.push({
        externalId: `odds-fix-${fixId}`,
        provider: this.providerName,
        sportId: parseInt(mTag.SportID || '1', 10),
        sportName: mTag.SportName || 'Soccer',
        tournamentId: parseInt(mTag.TournamentID || '1', 10),
        tournamentName: mTag.TournamentName || 'League',
        homeTeam: mTag.HomeTeam || mTag.homeTeam || 'Home',
        awayTeam: mTag.AwayTeam || mTag.awayTeam || 'Away',
        startTime: mTag.Date ? new Date(mTag.Date) : new Date(),
        status: this.mapStatus(mTag.Status),
        isInPlay: mTag.Status?.toLowerCase() === 'live',
        score: {
          home: parseInt(mTag.HomeScore || '0', 10),
          away: parseInt(mTag.AwayScore || '0', 10),
        },
        periodScores: [],
        matchMinute: parseInt(mTag.Minute || '0', 10),
        matchClock: mTag.Clock || '00:00',
        markets,
      });
    }

    return results;
  }

  public parseLiveDeltas(payload: string | Record<string, unknown>): NormalizedOddsDelta[] {
    const deltas: NormalizedOddsDelta[] = [];

    if (typeof payload === 'object') {
      const items = (payload.deltas || [payload]) as Array<any>;
      for (const d of items) {
        if (!d.matchId && !d.fixtureId) continue;
        const fixId = String(d.matchId || d.fixtureId).replace(/^odds-fix-/, '');
        const mktId = String(d.marketId || d.offerTypeId || '1').replace(/^odds-mkt-/, '');
        const selId = String(d.oddId || d.selectionId).replace(/^odds-sel-/, '');

        deltas.push({
          provider: this.providerName,
          fixtureExternalId: `odds-fix-${fixId}`,
          marketExternalId: mktId.includes('-') ? `odds-mkt-${mktId}` : `odds-mkt-${fixId}-${mktId}`,
          selectionExternalId: selId.includes('-') ? `odds-sel-${selId}` : `odds-sel-${fixId}-${selId}`,
          newOdds: Number(d.odds || d.value || 1.0),
          status: d.isSuspended ? 'SUSPENDED' : 'ACTIVE',
          timestamp: Number(d.timestamp || Date.now()),
        });
      }
      return deltas;
    }

    const tags = this.extractXmlTags(payload, 'LiveOddDelta');
    for (const t of tags) {
      const fixId = String(t.MatchID || t.matchId).replace(/^odds-fix-/, '');
      const mktId = String(t.OfferTypeID || t.marketId || '1').replace(/^odds-mkt-/, '');
      const selId = String(t.OddID || t.oddId).replace(/^odds-sel-/, '');

      deltas.push({
        provider: this.providerName,
        fixtureExternalId: `odds-fix-${fixId}`,
        marketExternalId: mktId.includes('-') ? `odds-mkt-${mktId}` : `odds-mkt-${fixId}-${mktId}`,
        selectionExternalId: selId.includes('-') ? `odds-sel-${selId}` : `odds-sel-${fixId}-${selId}`,
        newOdds: parseFloat(t.Value || t.value || '1.0'),
        status: t.Status === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
        timestamp: Date.now(),
      });
    }

    return deltas;
  }

  public parseScorecards(payload: string | Record<string, unknown>): NormalizedScorecard[] {
    const scorecards: NormalizedScorecard[] = [];

    if (typeof payload === 'object') {
      const results = (payload.results || payload.scorecards || [payload]) as Array<any>;
      for (const r of results) {
        const fixId = String(r.matchId || r.fixtureId).replace(/^odds-fix-/, '');
        scorecards.push({
          provider: this.providerName,
          fixtureExternalId: `odds-fix-${fixId}`,
          homeScore: Number(r.homeScore ?? 0),
          awayScore: Number(r.awayScore ?? 0),
          status: (r.status || 'FINISHED') as any,
          halfTimeScore: r.halfTimeScore,
          periodScores: r.periodScores,
          isVoid: Boolean(r.isVoid),
        });
      }
      return scorecards;
    }

    const tags = this.extractXmlTags(payload, 'MatchResult');
    for (const t of tags) {
      const fixId = String(t.MatchID || t.matchId).replace(/^odds-fix-/, '');
      scorecards.push({
        provider: this.providerName,
        fixtureExternalId: `odds-fix-${fixId}`,
        homeScore: parseInt(t.HomeScore || '0', 10),
        awayScore: parseInt(t.AwayScore || '0', 10),
        status: 'FINISHED',
        isVoid: t.Status === 'Cancelled' || t.Status === 'Postponed',
      });
    }

    return scorecards;
  }

  private mapOfferTypeToMarketType(name: string): string {
    const n = (name || '').toUpperCase();
    if (n.includes('1X2') || n.includes('MATCH WINNER') || n.includes('3WAY')) return '1X2';
    if (n.includes('OVER') || n.includes('UNDER') || n.includes('TOTAL')) return 'OVER_UNDER';
    if (n.includes('BTTS') || n.includes('BOTH TEAMS') || n.includes('GG')) return 'BTTS';
    if (n.includes('DOUBLE CHANCE') || n.includes('DC')) return 'DOUBLE_CHANCE';
    if (n.includes('DRAW NO BET') || n.includes('DNB')) return 'DRAW_NO_BET';
    if (n.includes('HANDICAP') || n.includes('ASIAN')) return 'ASIAN_HANDICAP';
    if (n.includes('CORRECT SCORE')) return 'CORRECT_SCORE';
    return '1X2';
  }

  private mapStatus(status: string): 'NOT_STARTED' | 'LIVE' | 'HALF_TIME' | 'FINISHED' {
    const s = (status || '').toLowerCase();
    if (s === 'live' || s === 'inplay') return 'LIVE';
    if (s === 'half_time' || s === 'halftime' || s === 'ht') return 'HALF_TIME';
    if (s === 'finished' || s === 'ft' || s === 'ended') return 'FINISHED';
    return 'NOT_STARTED';
  }
}
