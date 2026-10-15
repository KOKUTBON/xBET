/**
 * EnetPulse Sports Feed Adapter
 * Parses EnetPulse XML and JSON sports, tournaments, fixtures, odds, and results feeds
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

export class EnetPulseAdapter implements IFeedAdapter {
  public readonly providerName = 'EnetPulse';

  /**
   * Helper to parse XML tag attributes safely
   */
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
      const sports = (payload.sports || payload.queryResponse?.sports || []) as Array<{ id: string | number; name: string }>;
      return sports.map((s) => ({
        externalId: `enet-sport-${s.id}`,
        name: String(s.name),
        slug: String(s.name).toLowerCase().replace(/\s+/g, '-'),
      }));
    }

    // Parse XML
    const sportsTags = this.extractXmlTags(payload, 'sport');
    return sportsTags.map((tag) => ({
      externalId: `enet-sport-${tag.id}`,
      name: tag.name || 'Unknown Sport',
      slug: (tag.name || 'sport').toLowerCase().replace(/\s+/g, '-'),
    }));
  }

  public parseTournaments(payload: string | Record<string, unknown>): NormalizedTournament[] {
    if (typeof payload === 'object') {
      const tournaments = (payload.tournaments || payload.queryResponse?.tournaments || []) as Array<{
        id: string | number;
        name: string;
        sportId?: string | number;
      }>;
      return tournaments.map((t) => ({
        externalId: `enet-tourn-${t.id}`,
        sportExternalId: `enet-sport-${t.sportId || 1}`,
        name: String(t.name),
        slug: String(t.name).toLowerCase().replace(/\s+/g, '-'),
      }));
    }

    const tags = this.extractXmlTags(payload, 'tournament');
    return tags.map((t) => ({
      externalId: `enet-tourn-${t.id}`,
      sportExternalId: `enet-sport-${t.sport_id || t.sportId || 1}`,
      name: t.name || 'Unknown Tournament',
      slug: (t.name || 'tournament').toLowerCase().replace(/\s+/g, '-'),
    }));
  }

  public parseFixtures(payload: string | Record<string, unknown>): NormalizedFixture[] {
    const results: NormalizedFixture[] = [];

    if (typeof payload === 'object') {
      const events = (payload.events || payload.queryResponse?.events || []) as Array<any>;
      for (const ev of events) {
        const fixId = ev.id;
        const markets: NormalizedMarket[] = (ev.markets || []).map((m: any, mIdx: number) => ({
          externalId: `enet-mkt-${fixId}-${m.id || m.type || mIdx}`,
          marketType: m.type || '1X2',
          name: m.name || m.type || 'Match Winner',
          line: m.line ? String(m.line) : undefined,
          status: m.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
          isInPlay: ev.status === 'LIVE',
          sortOrder: mIdx,
          selections: (m.selections || m.odds || []).map((s: any, sIdx: number) => ({
            externalId: `enet-sel-${fixId}-${s.id || s.name || sIdx}`,
            name: String(s.name),
            odds: Number(s.odds || s.value || 1.0),
            status: s.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
            sortOrder: sIdx,
          })),
        }));

        results.push({
          externalId: `enet-fix-${fixId}`,
          provider: this.providerName,
          sportId: Number(ev.sportId || 1),
          sportName: ev.sportName || 'Soccer',
          tournamentId: Number(ev.tournamentId || 1),
          tournamentName: ev.tournamentName || 'League',
          homeTeam: ev.homeTeam || ev.home_team || ev.home || ev.participants?.[0]?.name || 'Home',
          awayTeam: ev.awayTeam || ev.away_team || ev.away || ev.participants?.[1]?.name || 'Away',
          startTime: ev.startTime ? new Date(ev.startTime) : new Date(),
          status: ev.status || 'NOT_STARTED',
          isInPlay: ev.status === 'LIVE',
          score: ev.score || { home: 0, away: 0 },
          periodScores: ev.periodScores || [],
          matchMinute: Number(ev.minute || 0),
          matchClock: ev.clock || '00:00',
          markets,
        });
      }
      return results;
    }

    // Parse XML Events
    const eventTags = this.extractXmlTags(payload, 'event');
    for (const evTag of eventTags) {
      const fixId = evTag.id;
      const body = evTag._body || '';
      const partTags = this.extractXmlTags(body, 'participant');
      const homeTeam = partTags[0]?.name || 'Home Team';
      const awayTeam = partTags[1]?.name || 'Away Team';

      const marketTags = this.extractXmlTags(body, 'market');
      const markets: NormalizedMarket[] = [];

      for (let mIdx = 0; mIdx < marketTags.length; mIdx++) {
        const mTag = marketTags[mIdx];
        const mBody = mTag._body || '';
        const oddTags = this.extractXmlTags(mBody, 'odd');

        const selections: NormalizedSelection[] = oddTags.map((oTag, oIdx) => ({
          externalId: `enet-sel-${fixId}-${oTag.id || oIdx}`,
          name: oTag.name || 'Selection',
          odds: parseFloat(oTag.value || '1.0'),
          status: oTag.status === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
          sortOrder: oIdx,
        }));

        markets.push({
          externalId: `enet-mkt-${fixId}-${mTag.id || mIdx}`,
          marketType: (mTag.type || mTag.name || '1X2').toUpperCase(),
          name: mTag.name || '1X2',
          line: mTag.line,
          status: mTag.status === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
          isInPlay: evTag.status === 'live',
          sortOrder: mIdx,
          selections,
        });
      }

      const statusMap: Record<string, 'NOT_STARTED' | 'LIVE' | 'HALF_TIME' | 'FINISHED'> = {
        not_started: 'NOT_STARTED',
        live: 'LIVE',
        half_time: 'HALF_TIME',
        finished: 'FINISHED',
      };

      results.push({
        externalId: `enet-fix-${fixId}`,
        provider: this.providerName,
        sportId: parseInt(evTag.sport_id || '1', 10),
        sportName: evTag.sport_name || 'Soccer',
        tournamentId: parseInt(evTag.tournament_id || '1', 10),
        tournamentName: evTag.tournament_name || 'League',
        homeTeam,
        awayTeam,
        startTime: evTag.startdate ? new Date(evTag.startdate) : new Date(),
        status: statusMap[evTag.status?.toLowerCase()] || 'NOT_STARTED',
        isInPlay: evTag.status?.toLowerCase() === 'live',
        score: {
          home: parseInt(evTag.home_score || '0', 10),
          away: parseInt(evTag.away_score || '0', 10),
        },
        periodScores: [],
        matchMinute: parseInt(evTag.minute || '0', 10),
        matchClock: evTag.clock || '00:00',
        markets,
      });
    }

    return results;
  }

  public parseLiveDeltas(payload: string | Record<string, unknown>): NormalizedOddsDelta[] {
    const deltas: NormalizedOddsDelta[] = [];

    if (typeof payload === 'object') {
      const items = (payload.oddsDeltas || payload.deltas || [payload]) as Array<any>;
      for (const item of items) {
        if (!item.fixtureId && !item.eventId) continue;
        const fixId = String(item.fixtureId || item.eventId).replace(/^enet-fix-/, '');
        const mktId = String(item.marketId || 'm1').replace(/^enet-mkt-/, '');
        const selId = String(item.selectionId || item.oddId).replace(/^enet-sel-/, '');

        deltas.push({
          provider: this.providerName,
          fixtureExternalId: `enet-fix-${fixId}`,
          marketExternalId: mktId.includes('-') ? `enet-mkt-${mktId}` : `enet-mkt-${fixId}-${mktId}`,
          selectionExternalId: selId.includes('-') ? `enet-sel-${selId}` : `enet-sel-${fixId}-${selId}`,
          newOdds: Number(item.odds || item.newOdds || item.value || 1.0),
          status: item.status === 'SUSPENDED' || item.isSuspended ? 'SUSPENDED' : 'ACTIVE',
          timestamp: Number(item.timestamp || Date.now()),
        });
      }
      return deltas;
    }

    const deltaTags = this.extractXmlTags(payload, 'odd_delta');
    for (const d of deltaTags) {
      const fixId = String(d.event_id || d.fixture_id).replace(/^enet-fix-/, '');
      const mktId = String(d.market_id || 'm1').replace(/^enet-mkt-/, '');
      const selId = String(d.odd_id || d.selection_id).replace(/^enet-sel-/, '');

      deltas.push({
        provider: this.providerName,
        fixtureExternalId: `enet-fix-${fixId}`,
        marketExternalId: mktId.includes('-') ? `enet-mkt-${mktId}` : `enet-mkt-${fixId}-${mktId}`,
        selectionExternalId: selId.includes('-') ? `enet-sel-${selId}` : `enet-sel-${fixId}-${selId}`,
        newOdds: parseFloat(d.value || '1.0'),
        status: d.status === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
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
        const fixId = String(r.fixtureId || r.eventId).replace(/^enet-fix-/, '');
        scorecards.push({
          provider: this.providerName,
          fixtureExternalId: `enet-fix-${fixId}`,
          homeScore: Number(r.homeScore ?? r.score?.home ?? 0),
          awayScore: Number(r.awayScore ?? r.score?.away ?? 0),
          status: (r.status || 'FINISHED') as any,
          halfTimeScore: r.halfTimeScore,
          periodScores: r.periodScores,
          isVoid: Boolean(r.isVoid),
        });
      }
      return scorecards;
    }

    const resTags = this.extractXmlTags(payload, 'result');
    for (const r of resTags) {
      const fixId = String(r.event_id || r.fixture_id).replace(/^enet-fix-/, '');
      scorecards.push({
        provider: this.providerName,
        fixtureExternalId: `enet-fix-${fixId}`,
        homeScore: parseInt(r.home_score || '0', 10),
        awayScore: parseInt(r.away_score || '0', 10),
        status: (r.status?.toUpperCase() || 'FINISHED') as any,
        isVoid: r.is_void === '1' || r.status === 'cancelled',
      });
    }

    return scorecards;
  }
}
