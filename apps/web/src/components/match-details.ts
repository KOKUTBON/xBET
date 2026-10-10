import { AppStateManager } from '../state/app-state.ts';
import { LiveMatchListComponent } from './live-match-list.ts';
import { icon, sportIcon, crest, esc, jsq, hueOf } from '../ui/icons.ts';

/**
 * Match Details Component
 *
 * Event centre for a single fixture: scoreboard, live tracker, implied win
 * probability (derived from the current prices) and every market the feed
 * publishes, grouped into filterable categories.
 */

const MARKET_LABELS: Record<string, string> = {
  MATCH_WINNER_1X2: '1X2 · Full Time Result',
  MONEYLINE: 'Moneyline',
  MATCH_WINNER: 'Match Winner',
  DOUBLE_CHANCE: 'Double Chance',
  TOTAL_GOALS: 'Total Goals',
  BOTH_TEAMS_TO_SCORE: 'Both Teams to Score',
};

const MARKET_GROUP: Record<string, string> = {
  MATCH_WINNER_1X2: 'MAIN', MONEYLINE: 'MAIN', MATCH_WINNER: 'MAIN', DOUBLE_CHANCE: 'MAIN',
  TOTAL_GOALS: 'GOALS', BOTH_TEAMS_TO_SCORE: 'GOALS',
};

const CORRECT_SCORES = [
  { score: '1:0', odds: 6.50 }, { score: '2:0', odds: 7.80 }, { score: '2:1', odds: 8.50 }, { score: '3:0', odds: 13.00 },
  { score: '0:0', odds: 11.00 }, { score: '1:1', odds: 6.80 }, { score: '2:2', odds: 14.00 }, { score: '3:3', odds: 45.00 },
  { score: '0:1', odds: 11.00 }, { score: '0:2', odds: 18.00 }, { score: '1:2', odds: 12.50 }, { score: '0:3', odds: 40.00 },
];

export class MatchDetailsComponent {
  public static currentCategory: string = 'ALL';

  public static setCategory(category: string): void {
    this.currentCategory = category;
  }

  private static marketLabel(m: any): string {
    return m.displayName || MARKET_LABELS[m.marketType] || m.name || 'Market';
  }

  private static marketGroup(m: any): string {
    return m.group || MARKET_GROUP[m.marketType] || 'MAIN';
  }

  /** Optional feed extras: match statistics, score by period and an event timeline. */
  private static extras(match: any): string {
    const stats: any[] = Array.isArray(match.stats) ? match.stats : [];
    const periods: any[] = Array.isArray(match.periodScores) ? match.periodScores : [];
    const timeline: any[] = Array.isArray(match.timeline) ? match.timeline : [];
    if (!stats.length && !periods.length && !timeline.length) return '';
    const statRows = stats.map((st) => {
      const total = Number(st.home) + Number(st.away) || 1;
      const pct = Math.round((Number(st.home) / total) * 100);
      return `
        <li class="stat-row">
          <b class="mono">${esc(st.home)}</b><span>${esc(st.label)}</span><b class="mono">${esc(st.away)}</b>
          <span class="stat-bar" aria-hidden="true"><i style="width:${pct}%"></i></span>
        </li>`;
    }).join('');
    const periodTable = periods.length ? `
      <div class="period-table" role="table" aria-label="Score by period">
        <div role="row"><span></span>${periods.map((p) => `<span role="columnheader">${esc(p.label)}</span>`).join('')}<b role="columnheader">T</b></div>
        <div role="row"><span>${esc(match.homeTeam)}</span>${periods.map((p) => `<span class="mono">${esc(p.home)}</span>`).join('')}<b class="mono">${esc(match.score?.home ?? 0)}</b></div>
        <div role="row"><span>${esc(match.awayTeam)}</span>${periods.map((p) => `<span class="mono">${esc(p.away)}</span>`).join('')}<b class="mono">${esc(match.score?.away ?? 0)}</b></div>
      </div>` : '';
    return `
      <div class="insight-grid insight-extras">
        <section class="card match-stats">
          <header class="card-h">${icon('chart')}<span>${stats.length ? 'Match stats' : 'Score by period'}</span></header>
          ${stats.length ? `<ul class="stat-list">${statRows}</ul>` : ''}
          ${periodTable}
        </section>
        <section class="card match-timeline">
          <header class="card-h">${icon('clock')}<span>Timeline</span></header>
          <ol class="timeline">
            ${timeline.map((e) => `<li class="tl-${esc(e.kind)} ${e.side === 0 ? 'tl-home' : e.side === 1 ? 'tl-away' : 'tl-neutral'}"><b class="mono">${esc(e.at)}</b><span>${esc(e.text)}</span></li>`).join('') || '<li class="tl-neutral"><span>Waiting for the first event</span></li>'}
          </ol>
        </section>
      </div>`;
  }

  /** Implied probability for home / draw / away from the headline prices, normalised to 100%. */
  private static probabilities(match: any): Array<{ label: string; pct: number; tone: string }> {
    const { home, draw, away } = LiveMatchListComponent.mainMarket(match);
    const rows = [
      { label: match.homeTeam, odds: Number(home?.odds), tone: 'home' },
      ...(draw ? [{ label: 'Draw', odds: Number(draw.odds), tone: 'draw' }] : []),
      { label: match.awayTeam, odds: Number(away?.odds), tone: 'away' },
    ].filter((r) => r.odds > 1);
    const total = rows.reduce((acc, r) => acc + 1 / r.odds, 0) || 1;
    return rows.map((r) => ({ label: r.label, pct: Math.round(((1 / r.odds) / total) * 100), tone: r.tone }));
  }

  private static tracker(match: any): string {
    const isSoccer = match.sportId === 1 || !match.sportId;
    if (!isSoccer) {
      return `
        <div class="tracker tracker-generic">
          <span class="tracker-ico">${icon(sportIcon(match.sportId))}</span>
          <div><strong>${esc(LiveMatchListComponent.clockText(match))}</strong><small>${esc(match.lastEvent || 'Awaiting next event')}</small></div>
        </div>`;
    }
    // Position the ball marker deterministically from the latest event so it moves with the feed.
    const seed = hueOf(`${match.lastEvent || ''}${match.matchMinute ?? ''}`);
    const x = 40 + (seed % 320);
    const y = 30 + ((seed * 7) % 140);
    return `
      <div class="tracker">
        <svg class="pitch" viewBox="0 0 400 200" role="img" aria-label="Match tracker">
          <rect class="pitch-bg" x="0" y="0" width="400" height="200" rx="10"/>
          ${Array.from({ length: 8 }, (_, i) => `<rect class="pitch-stripe" x="${i * 50}" y="0" width="25" height="200"/>`).join('')}
          <g class="pitch-lines">
            <rect x="8" y="8" width="384" height="184" rx="4"/><path d="M200 8v184"/><circle cx="200" cy="100" r="30"/>
            <rect x="8" y="50" width="60" height="100"/><rect x="332" y="50" width="60" height="100"/>
            <rect x="8" y="76" width="22" height="48"/><rect x="370" y="76" width="22" height="48"/>
            <circle cx="200" cy="100" r="2" fill="currentColor"/>
          </g>
          <circle class="ball-ring" cx="${x}" cy="${y}" r="16"/>
          <circle class="ball" cx="${x}" cy="${y}" r="5"/>
        </svg>
        <div class="tracker-caption">${icon('bolt')}<span>${esc(match.lastEvent || 'Kick-off — awaiting first event')}</span></div>
      </div>`;
  }

  public static render(appState: AppStateManager, fixtureId: string): string {
    const match = appState.liveFixtures.get(fixtureId) || {
      id: fixtureId,
      homeTeam: 'Arsenal',
      awayTeam: 'Chelsea',
      tournamentName: 'English Premier League',
      matchClock: "68' In-Play",
      score: { home: 2, away: 1 },
    };

    const isSoccer = match.sportId === 1 || !match.sportId;
    const live = LiveMatchListComponent.isLive(match);
    const hs = match.score?.home ?? 0;
    const as = match.score?.away ?? 0;
    const markets: any[] = match.markets && match.markets.length ? match.markets : [LiveMatchListComponent.mainMarket(match).market];
    let cat = this.currentCategory;
    const probs = this.probabilities(match);

    const hasOwnScoreMarket = markets.some((m) => this.marketGroup(m) === 'SCORE');
    const groups = new Set(markets.map((m) => this.marketGroup(m)));
    const categories = [
      { id: 'ALL', label: 'All markets', ico: 'layers' },
      { id: 'MAIN', label: 'Main', ico: 'star' },
      ...(groups.has('GOALS') ? [{ id: 'GOALS', label: 'Goals', ico: 'soccer' }] : []),
      ...(groups.has('TOTALS') ? [{ id: 'TOTALS', label: 'Totals', ico: 'hash' }] : []),
      ...(groups.has('LINES') ? [{ id: 'LINES', label: 'Handicaps', ico: 'layers' }] : []),
      ...(groups.has('SETS') ? [{ id: 'SETS', label: 'Sets', ico: 'tennis' }] : []),
      ...(isSoccer || groups.has('SCORE') ? [{ id: 'SCORE', label: 'Correct score', ico: 'hash' }] : []),
    ];
    if (!categories.some((c) => c.id === cat)) cat = 'ALL';

    const renderMarket = (m: any) => {
      const sels: any[] = m.selections || [];
      const isHeadline = m.marketType === 'MATCH_WINNER_1X2' || m.marketType === 'MONEYLINE' || m.marketType === 'MATCH_WINNER';
      const slipMarketName = m.marketType === 'MATCH_WINNER_1X2' && !m.displayName ? '1X2 Full Time Result' : this.marketLabel(m);
      const buttons = sels.map((s, i) => {
        let label = s.name;
        let pick = s.name;
        if (isHeadline) {
          const last = i === sels.length - 1;
          if (s.name === 'Home' || (i === 0 && s.name !== 'Draw')) { label = match.homeTeam; pick = match.homeTeam; }
          else if (/^draw/i.test(s.name)) { label = 'Draw'; pick = 'Draw'; }
          else if (s.name === 'Away' || last) { label = match.awayTeam; pick = match.awayTeam; }
        }
        return LiveMatchListComponent.oddButton(appState, match, m, s, label, pick, slipMarketName, 'odd-wide');
      }).join('');
      return `
        <section class="market">
          <header class="market-h">
            <span>${esc(this.marketLabel(m))}</span>
            <span class="market-meta">${m.isInPlay || live ? `<span class="pill pill-xs pill-live">In-play</span>` : ''}<b class="mono">${sels.length}</b></span>
          </header>
          <div class="market-grid cols-${sels.length > 6 ? 4 : Math.min(sels.length, 3)}">${buttons}</div>
        </section>`;
    };

    const shown = markets.filter((m) => cat === 'ALL' || this.marketGroup(m) === cat);

    const correctScore = isSoccer && !hasOwnScoreMarket && (cat === 'ALL' || cat === 'SCORE') ? `
      <section class="market">
        <header class="market-h"><span>Correct Score</span><span class="market-meta"><b class="mono">${CORRECT_SCORES.length}</b></span></header>
        <div class="market-grid cols-4">
          ${CORRECT_SCORES.map((item) => {
            const selId = `sel-cs-${item.score}-${match.id}`;
            return LiveMatchListComponent.oddButton(appState, match, { id: `mkt-cs-${match.id}` }, { id: selId, odds: item.odds }, item.score, `Score ${item.score}`, 'Correct Score');
          }).join('')}
        </div>
      </section>` : '';

    return `
      <nav class="crumbs" aria-label="Breadcrumb">
        <button type="button" class="btn btn-ghost btn-sm" onclick="window.appState.closeMatchDetails()">${icon('arrow-left')}Back</button>
        <span class="crumb">${icon(sportIcon(match.sportId))}<a href="javascript:void(0)" onclick="window.appState.selectLeague('${jsq(match.tournamentName || '')}')">${esc(match.tournamentName || 'Competition')}</a></span>
        ${icon('chevron-right', 'crumb-sep')}
        <span class="crumb crumb-current">${esc(match.homeTeam)} v ${esc(match.awayTeam)}</span>
      </nav>

      <section class="scoreboard">
        <div class="scoreboard-top">
          <span class="feature-comp">${icon('trophy')}${esc(match.tournamentName || 'Competition')}</span>
          ${live ? `<span class="pill pill-live"><span class="live-dot"></span>Live · <b class="mono">${esc(LiveMatchListComponent.clockText(match))}</b></span>` : `<span class="pill">${icon('clock')}${esc(LiveMatchListComponent.clockText(match))}</span>`}
        </div>
        <div class="scoreboard-main">
          <div class="sb-team">${crest(match.homeTeam, match.sportId, 'crest-xxl')}<strong>${esc(match.homeTeam)}</strong><small>Home</small></div>
          <div class="sb-score">
            <div class="score-digits score-xl"><b class="${hs > as ? 'lead' : ''}">${hs}</b><i>:</i><b class="${as > hs ? 'lead' : ''}">${as}</b></div>
            ${isSoccer && typeof match.matchMinute === 'number' ? `<span class="progress"><span style="width:${Math.min(100, Math.round((match.matchMinute / 90) * 100))}%"></span></span>` : ''}
          </div>
          <div class="sb-team">${crest(match.awayTeam, match.sportId, 'crest-xxl')}<strong>${esc(match.awayTeam)}</strong><small>Away</small></div>
        </div>
      </section>

      <div class="insight-grid">
        ${this.tracker(match)}
        <div class="prob-card">
          <header class="card-h">${icon('chart')}<span>Implied win probability</span></header>
          <div class="prob-bar">${probs.map((p) => `<span class="prob-${p.tone}" style="flex:${Math.max(p.pct, 4)}" title="${esc(p.label)} ${p.pct}%"></span>`).join('')}</div>
          <ul class="prob-legend">
            ${probs.map((p) => `<li><i class="prob-${p.tone}"></i><span>${esc(p.label)}</span><b class="mono">${p.pct}%</b></li>`).join('')}
          </ul>
          <p class="card-note">Derived from current prices with the bookmaker margin removed.</p>
        </div>
      </div>

      ${this.extras(match)}

      <div class="market-tabs" role="tablist">
        ${categories.map((c) => `
          <button type="button" role="tab" aria-selected="${cat === c.id}" class="seg ${cat === c.id ? 'is-active' : ''}" onclick="window.MatchDetailsComponent.setCategory('${c.id}'); window.renderApp();">${icon(c.ico)}${c.label}</button>
        `).join('')}
      </div>

      <div class="markets">
        ${shown.map(renderMarket).join('')}
        ${correctScore}
      </div>`;
  }
}
