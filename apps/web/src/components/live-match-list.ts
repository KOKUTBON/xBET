/**
 * Live Match List Component
 *
 * The sportsbook board: a featured live match, a sport filter strip (compact
 * layouts), and fixtures grouped by competition with 1X2 / moneyline prices.
 * Supports odds formats, search, drift indicators and flash-on-tick.
 */

import { AppStateManager, formatOddsValue } from '../state/app-state.ts';
import { icon, sportIcon, crest, esc, jsq } from '../ui/icons.ts';

const SPORT_NAMES: Record<number, string> = {
  1: 'Soccer', 2: 'Tennis', 3: 'Basketball', 4: 'Ice Hockey', 5: 'Formula 1', 6: 'Rugby Union',
  7: 'American Football', 8: 'Baseball', 9: 'Handball', 10: 'Volleyball', 11: 'Cricket', 12: 'Golf',
  13: 'Boxing', 14: 'MMA', 15: 'Snooker', 16: 'Darts', 17: 'Cycling', 18: 'Motorcycles',
  19: 'Badminton', 20: 'Table Tennis',
};

export class LiveMatchListComponent {
  public static expandedFixtures: Set<string> = new Set();

  public static toggleExpand(fixtureId: string): void {
    if (this.expandedFixtures.has(fixtureId)) {
      this.expandedFixtures.delete(fixtureId);
    } else {
      this.expandedFixtures.add(fixtureId);
    }
  }

  public static isLive(m: any): boolean {
    return Boolean(m.isLive || m.isInPlay || m.status === 'LIVE');
  }

  public static clockText(m: any): string {
    if (m.status === 'FINISHED') return 'FT';
    if ((m.sportId === 1 || !m.sportId) && typeof m.matchMinute === 'number') return `${m.matchMinute}'`;
    if (m.matchClock) return String(m.matchClock).replace(/\s*In-Play/i, '');
    return this.isLive(m) ? 'Live' : 'Soon';
  }

  /** Resolve the headline market (1X2 / moneyline) and its home / draw / away selections. */
  public static mainMarket(match: any): { market: any; home: any; draw: any; away: any } {
    const market =
      (match.markets && match.markets.find((m: any) => m.marketType === 'MATCH_WINNER_1X2' || m.marketType === 'MONEYLINE' || m.marketType === 'MATCH_WINNER')) ||
      (match.markets && match.markets[0]) || {
        id: `mkt-1x2-${match.id}`,
        marketType: 'MATCH_WINNER_1X2',
        selections: [
          { id: `sel-1-${match.id}`, name: 'Home', odds: 1.95 },
          { id: `sel-x-${match.id}`, name: 'Draw', odds: 3.40 },
          { id: `sel-2-${match.id}`, name: 'Away', odds: 3.80 },
        ],
      };
    const sels = market.selections || [];
    const home = sels.find((s: any) => s.name === 'Home') || sels[0];
    const draw = sels.length === 3 ? (sels.find((s: any) => /^draw/i.test(s.name)) || sels[1]) : null;
    const away = sels.length === 3 ? (sels.find((s: any) => s.name === 'Away') || sels[2]) : sels[1];
    return { market, home, draw, away };
  }

  /** A price button wired to the bet slip. Shared by the board and the match view. */
  public static oddButton(appState: AppStateManager, match: any, market: any, sel: any, label: string, pickName: string, marketName: string, extra: string = ''): string {
    if (!sel) return '';
    const selected = appState.slipItems.has(sel.id);
    const suspended = sel.status === 'SUSPENDED' || market.status === 'SUSPENDED' || Boolean(match.isSuspended);
    const drift = sel.isDriftUp ? 'drift-up' : sel.isDriftDown ? 'drift-down' : '';
    const fixtureName = `${match.homeTeam} vs ${match.awayTeam}`;
    const qId = sel.quoteId || match.quoteId || '';
    const mVer = Number(sel.marketVersion || match.marketVersion || 0);
    const suspReason = market.suspensionReason || match.suspensionReason || 'Market suspended';

    return `
      <button type="button" id="odd-btn-${esc(sel.id)}" class="odd-btn ${selected ? 'selected' : ''} ${drift} ${extra}" ${suspended ? 'disabled' : ''} aria-pressed="${selected}"
        onclick="window.appState.toggleSelection({ selectionId: '${jsq(sel.id)}', selectionName: '${jsq(pickName)}', marketId: '${jsq(market.id)}', marketName: '${jsq(marketName)}', fixtureId: '${jsq(match.id)}', fixtureName: '${jsq(fixtureName)}', odds: ${Number(sel.odds)}, quoteId: '${jsq(qId)}', marketVersion: ${mVer} })">
        <span class="odd-name">${esc(label)}</span>
        <span class="odd-value mono">${suspended ? `<span class="odd-lock" title="${esc(suspReason)}">${icon('lock')}</span>` : formatOddsValue(sel.odds, appState.oddsFormat)}</span>
        ${drift ? `<span class="odd-drift">${icon(sel.isDriftUp ? 'caret-up' : 'caret-down')}</span>` : ''}
      </button>`;
  }

  private static sportStrip(appState: AppStateManager, all: any[]): string {
    const counts = new Map<number, number>();
    for (const m of all) counts.set(m.sportId || 1, (counts.get(m.sportId || 1) || 0) + 1);
    if (counts.size === 0) return '';
    const ids = Array.from(counts.keys()).sort((a, b) => a - b);
    return `
      <div class="sport-strip" id="sport-strip" data-keep-scroll>
        <button type="button" class="strip-item ${appState.selectedSportId === null && !appState.selectedLeagueName ? 'is-active' : ''}" onclick="window.appState.selectSport(null)">
          ${icon('grid')}<span>All</span>
        </button>
        ${ids.map((id) => `
          <button type="button" class="strip-item ${appState.selectedSportId === id ? 'is-active' : ''}" onclick="window.appState.selectSport(${id})">
            ${icon(sportIcon(id))}<span>${esc(SPORT_NAMES[id] || 'Sport')}</span><b class="mono">${counts.get(id)}</b>
          </button>`).join('')}
      </div>`;
  }

  private static featured(appState: AppStateManager, match: any): string {
    const { market, home, draw, away } = this.mainMarket(match);
    const marketName = draw ? '1X2 Full Time Result' : 'Match Winner';
    const minute = typeof match.matchMinute === 'number' ? match.matchMinute : null;
    const isSoccer = match.sportId === 1 || !match.sportId;
    const progress = minute !== null && isSoccer ? Math.min(100, Math.round((minute / 90) * 100)) : null;
    const hs = match.score?.home ?? 0;
    const as = match.score?.away ?? 0;

    return `
      <section class="feature" aria-label="Featured live match">
        <div class="feature-pitch" aria-hidden="true">
          <svg viewBox="0 0 400 200" preserveAspectRatio="none"><rect x="6" y="6" width="388" height="188" rx="6"/><path d="M200 6v188"/><circle cx="200" cy="100" r="34"/><rect x="6" y="52" width="58" height="96"/><rect x="336" y="52" width="58" height="96"/><rect x="6" y="78" width="22" height="44"/><rect x="372" y="78" width="22" height="44"/></svg>
        </div>
        <div class="feature-top">
          <span class="feature-comp">${icon(sportIcon(match.sportId))}${esc(match.tournamentName || 'Featured')}</span>
          <span class="pill pill-live"><span class="live-dot"></span>Live · <b class="mono">${esc(this.clockText(match))}</b></span>
          ${match.isSuspended ? `<span class="pill pill-warning">${esc(match.suspensionReason || 'SUSPENDED')}</span>` : ''}
        </div>
        <button type="button" class="feature-board" onclick="window.appState.openMatchDetails('${jsq(match.id)}')">
          <span class="feature-team">
            ${crest(match.homeTeam, match.sportId, 'crest-xl')}
            <span class="feature-name">${esc(match.homeTeam)}</span>
          </span>
          <span class="feature-score">
            <span class="score-digits"><b class="${hs > as ? 'lead' : ''}">${hs}</b><i>:</i><b class="${as > hs ? 'lead' : ''}">${as}</b></span>
            ${progress !== null ? `<span class="progress" title="${minute}' of 90'"><span style="width:${progress}%"></span></span>` : ''}
          </span>
          <span class="feature-team">
            ${crest(match.awayTeam, match.sportId, 'crest-xl')}
            <span class="feature-name">${esc(match.awayTeam)}</span>
          </span>
        </button>
        ${match.lastEvent ? `<div class="feature-event">${icon('bolt')}<span>${esc(match.lastEvent)}</span></div>` : ''}
        <div class="feature-odds cols-${draw ? 3 : 2}">
          ${this.oddButton(appState, match, market, home, draw ? '1' : '1', match.homeTeam, marketName, 'odd-lg')}
          ${draw ? this.oddButton(appState, match, market, draw, 'X', 'Draw', marketName, 'odd-lg') : ''}
          ${this.oddButton(appState, match, market, away, '2', match.awayTeam, marketName, 'odd-lg')}
        </div>
        <button type="button" class="feature-more" onclick="window.appState.openMatchDetails('${jsq(match.id)}')">
          All ${(match.markets && match.markets.length) || 4} markets ${icon('arrow-right')}
        </button>
      </section>`;
  }

  private static row(appState: AppStateManager, match: any): string {
    const { market, home, draw, away } = this.mainMarket(match);
    const marketName = draw ? '1X2 Full Time Result' : 'Match Winner';
    const live = this.isLive(match);
    const hs = match.score?.home ?? 0;
    const as = match.score?.away ?? 0;
    const marketsCount = (match.markets && match.markets.length) || 4;

    return `
      <article class="fx-row match-card">
        <div class="fx-status">
          ${live ? `<span class="pill pill-live pill-xs"><span class="live-dot"></span>Live</span>` : `<span class="pill pill-xs">${match.status === 'FINISHED' ? 'Ended' : 'Pre'}</span>`}
          <span class="fx-clock mono">${esc(this.clockText(match))}</span>
          ${match.isSuspended ? `<span class="pill pill-warning pill-xs">${esc(match.suspensionReason || 'SUSPENDED')}</span>` : ''}
        </div>
        <button type="button" class="fx-teams" onclick="window.appState.openMatchDetails('${jsq(match.id)}')">
          <span class="fx-team ${hs > as ? 'lead' : ''}">${crest(match.homeTeam, match.sportId, 'crest-sm')}<span class="fx-name">${esc(match.homeTeam)}</span><b class="fx-score mono">${hs}</b></span>
          <span class="fx-team ${as > hs ? 'lead' : ''}">${crest(match.awayTeam, match.sportId, 'crest-sm')}<span class="fx-name">${esc(match.awayTeam)}</span><b class="fx-score mono">${as}</b></span>
          ${match.lastEvent ? `<span class="fx-event">${icon('bolt')}${esc(match.lastEvent)}</span>` : ''}
        </button>
        <div class="fx-odds cols-${draw ? 3 : 2}">
          ${this.oddButton(appState, match, market, home, '1', match.homeTeam, marketName)}
          ${draw ? this.oddButton(appState, match, market, draw, 'X', 'Draw', marketName) : ''}
          ${this.oddButton(appState, match, market, away, '2', match.awayTeam, marketName)}
        </div>
        <button type="button" class="fx-more" onclick="window.appState.openMatchDetails('${jsq(match.id)}')" aria-label="All markets">
          <span class="mono">+${marketsCount}</span>${icon('chevron-right')}
        </button>
      </article>`;
  }

  public static render(appState: AppStateManager): string {
    const all = Array.from(appState.liveFixtures.values());
    let matches = all;

    let title = 'Sportsbook';
    let titleIcon = 'soccer';
    let subtitle = 'Live and upcoming events, priced in real time';
    const q = appState.searchQuery;

    if (q) {
      matches = matches.filter((m) =>
        m.homeTeam.toLowerCase().includes(q) ||
        m.awayTeam.toLowerCase().includes(q) ||
        (m.tournamentName && m.tournamentName.toLowerCase().includes(q)) ||
        m.id.toLowerCase().includes(q)
      );
      title = `Results for “${esc(q)}”`;
      titleIcon = 'search';
      subtitle = `${matches.length} matching event${matches.length === 1 ? '' : 's'}`;
    } else if (appState.activeTab === 'inplay') {
      matches = matches.filter((m) => this.isLive(m));
      title = 'In-Play';
      titleIcon = 'live';
      subtitle = 'Streaming odds — prices move with every event';
    } else if (appState.selectedLeagueName) {
      matches = matches.filter((m) => m.tournamentName === appState.selectedLeagueName);
      title = esc(appState.selectedLeagueName);
      titleIcon = 'trophy';
      subtitle = 'Competition';
    } else if (appState.selectedSportId !== null) {
      matches = matches.filter((m) => m.sportId === appState.selectedSportId || (!m.sportId && appState.selectedSportId === 1));
      title = SPORT_NAMES[appState.selectedSportId] || 'Sports';
      titleIcon = sportIcon(appState.selectedSportId);
      subtitle = 'All competitions';
    }

    const filtered = Boolean(q || appState.selectedLeagueName || appState.selectedSportId !== null);
    const featuredMatch = !filtered ? (matches.find((m) => this.isLive(m) && this.mainMarket(m).draw && (m.sportId === 1 || !m.sportId)) || matches.find((m) => this.isLive(m))) : null;
    const liveTotal = matches.filter((m) => this.isLive(m)).length;

    const header = `
      <header class="view-head">
        <div class="view-title">
          <span class="view-ico ${appState.activeTab === 'inplay' ? 'tone-live' : ''}">${icon(titleIcon)}</span>
          <div><h1>${title}</h1><p>${subtitle}</p></div>
        </div>
        <div class="view-meta">
          ${liveTotal ? `<span class="stat-chip"><span class="live-dot"></span><b class="mono">${liveTotal}</b> live</span>` : ''}
          <span class="stat-chip"><b class="mono">${matches.length}</b> events</span>
          ${filtered ? `<button type="button" class="btn btn-ghost btn-sm" onclick="window.appState.selectSport(null)">${icon('x')}Clear</button>` : ''}
        </div>
      </header>`;

    if (matches.length === 0) {
      return `
        ${this.sportStrip(appState, all)}
        ${header}
        <div class="empty-state">
          <span class="empty-ico">${icon(all.length === 0 ? 'signal' : 'search')}</span>
          <h3>${all.length === 0 ? 'Waiting for the live feed' : 'No events match this selection'}</h3>
          <p>${all.length === 0 ? 'Fixtures stream in over WebSocket from the odds engine. They will appear here as soon as the feed connects.' : 'Try another sport or competition, or clear your filters to see the full board.'}</p>
          ${all.length ? `<button type="button" class="btn btn-volt" onclick="window.appState.selectSport(null)">View all events</button>` : ''}
        </div>`;
    }

    // Group by competition (preserving feed order)
    const groups = new Map<string, any[]>();
    for (const m of matches) {
      const key = m.tournamentName || 'Other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }

    return `
      ${this.sportStrip(appState, all)}
      ${featuredMatch ? this.featured(appState, featuredMatch) : ''}
      ${header}
      <div class="fx-board">
        ${Array.from(groups.entries()).map(([name, list]) => {
          const threeWay = Boolean(this.mainMarket(list[0]).draw);
          return `
            <section class="fx-group">
              <header class="fx-group-h">
                <span class="fx-group-name">${icon(sportIcon(list[0].sportId))}<span>${esc(name)}</span><b class="mono">${list.length}</b></span>
                <span class="fx-cols cols-${threeWay ? 3 : 2}"><span>1</span>${threeWay ? '<span>X</span>' : ''}<span>2</span></span>
              </header>
              ${list.map((m) => this.row(appState, m)).join('')}
            </section>`;
        }).join('')}
      </div>`;
  }
}
