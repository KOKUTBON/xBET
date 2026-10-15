/**
 * Static demo UI panels (GitHub Pages build only): onboarding strip, simulation
 * controls, "My bets" with cash out, and the local wallet / account modals.
 */

import { formatOddsValue } from '../state/app-state.ts';
import { DemoStateManager, DEMO_START_BALANCE, DEMO_GAME_CATALOG } from './demo-state.ts';
import { icon, esc, jsq, fmtPts, sportIcon } from '../ui/icons.ts';

const DEMO_TX_FILTERS: Record<string, { label: string; kinds: string[] }> = {
  ALL: { label: 'All', kinds: [] },
  SPORTS: { label: 'Sports', kinds: ['bet', 'win', 'refund', 'cashout'] },
  CASINO: { label: 'Casino', kinds: ['casino', 'casino-win'] },
  WALLET: { label: 'Wallet', kinds: ['deposit', 'reset'] },
};

const DEMO_TX_ICON: Record<string, string> = {
  bet: 'ticket', win: 'trophy', refund: 'refresh', cashout: 'coins', casino: 'casino', 'casino-win': 'sparkle', deposit: 'plus', reset: 'refresh',
};

function demoTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function demoSigned(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtPts(Math.abs(n))}`;
}

export class DemoPanels {
  public static txFilter = 'ALL';

  public static setTxFilter(filter: string): void {
    this.txFilter = DEMO_TX_FILTERS[filter] ? filter : 'ALL';
  }

  private static counts(state: DemoStateManager) {
    const fixtures = [...state.liveFixtures.values()];
    return {
      events: fixtures.length,
      live: fixtures.filter((f) => f.status === 'LIVE').length,
      markets: fixtures.reduce((acc, f) => acc + (f.markets?.length || 0), 0),
      sports: new Set(fixtures.map((f) => f.sportId)).size,
      next: fixtures.filter((f) => f.status === 'PRE').sort((a, b) => a.startTime - b.startTime)[0],
    };
  }

  // ---- Sports board onboarding ----------------------------------------------
  public static welcome(state: DemoStateManager): string {
    if (state.welcomeDismissed) return '';
    const c = this.counts(state);
    return `
      <section class="demo-welcome" aria-label="About this demo">
        <div class="demo-welcome-copy">
          <span class="eyebrow">${icon('sparkle')}Interactive demo · no sign-up</span>
          <h2>Simulated live sport with ${fmtPts(DEMO_START_BALANCE).replace('.00', '')} free points</h2>
          <p>Everything runs in your browser. Matches kick off, score and reprice every few seconds; bets settle at full time against the simulated result. Try a combi, cash out mid-game, or spin the casino.</p>
        </div>
        <ul class="demo-facts">
          <li><b class="mono">${c.events}</b><span>events</span></li>
          <li><b class="mono">${c.live}</b><span>live now</span></li>
          <li><b class="mono">${c.markets}</b><span>markets</span></li>
          <li><b class="mono">${DEMO_GAME_CATALOG.length}</b><span>casino games</span></li>
        </ul>
        <div class="demo-welcome-actions">
          <button type="button" class="btn btn-volt btn-sm" onclick="window.appState.setActiveTab('inplay')">${icon('live')}Go in-play</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="window.appState.dismissWelcome()">${icon('check')}Got it</button>
        </div>
      </section>`;
  }

  // ---- Right rail: controls ---------------------------------------------------
  public static controls(state: DemoStateManager): string {
    const c = this.counts(state);
    const openLegs = state.myTickets.filter((t) => t.status === 'OPEN').length;
    return `
      <div class="card demo-controls">
        <header class="card-h">${icon('signal')}<span>Simulation</span>
          <span class="demo-state ${state.demoPaused ? 'is-paused' : ''}"><i></i>${state.demoPaused ? 'Paused' : 'Running'}</span>
        </header>
        <p class="demo-line"><b class="mono">${c.live}</b> live · <b class="mono">${c.events - c.live}</b> upcoming${c.next ? ` · next ${esc(c.next.matchClock || 'soon')}` : ''}</p>
        <div class="demo-row">
          <div class="seg-group" role="group" aria-label="Simulation speed">
            ${[1, 2, 4].map((s) => `<button type="button" class="seg ${state.demoSpeed === s ? 'is-active' : ''}" onclick="window.appState.setDemoSpeed(${s})">${s}×</button>`).join('')}
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="window.appState.toggleDemoFeed()">${icon(state.demoPaused ? 'play' : 'clock')}${state.demoPaused ? 'Resume' : 'Pause'}</button>
        </div>
        <button type="button" class="btn btn-ghost btn-block btn-sm" ${openLegs ? '' : 'disabled'} onclick="window.appState.finishMyMatches()">${icon('flag')}Play my matches to full time${openLegs ? ` <b class="mono">${openLegs}</b>` : ''}</button>
      </div>`;
  }

  // ---- Right rail: my bets ----------------------------------------------------
  private static legLive(state: DemoStateManager, leg: any): string {
    if (leg.status !== 'OPEN') return leg.result ? `<small class="leg-res">${esc(leg.result)}</small>` : '';
    const f = state.liveFixtures.get(leg.fixtureId);
    if (!f) return '';
    if (f.status === 'LIVE') return `<small class="leg-live"><span class="live-dot"></span>${esc(f.matchClock)} · <b class="mono">${f.score.home}-${f.score.away}</b></small>`;
    if (f.status === 'PRE') return `<small class="leg-res">${icon('clock')}Starts ${esc(f.matchClock)}</small>`;
    return `<small class="leg-res">${esc(f.matchClock)} ${f.score.home}-${f.score.away}</small>`;
  }

  private static tone(status: string): string {
    return status === 'WON' ? 'won' : status === 'LOST' ? 'lost' : status === 'CASHED OUT' ? 'cashed' : 'open';
  }

  private static ticket(state: DemoStateManager, t: any): string {
    const cash = state.cashOutValue(t);
    const returned = Number(t.returned) || 0;
    return `
      <article class="bet-card bet-${this.tone(t.status)}">
        <header class="bet-card-h">
          <button type="button" class="link-btn mono" onclick="window.appState.openPrintTicket(window.appState.myTickets.find(function (x) { return x.id === '${jsq(t.id)}'; }))">${icon('receipt')}${esc(t.slipNumber)}</button>
          <span class="bet-type">${t.betType === 'COMBI' ? `${t.legs.length}-fold` : 'Single'} · <b class="mono">${formatOddsValue(t.totalOdds, state.oddsFormat)}</b></span>
          <span class="status status-${this.tone(t.status)}">${esc(t.status)}</span>
        </header>
        <ul class="bet-legs">
          ${t.legs.map((l: any) => `
            <li class="bet-leg leg-${this.tone(l.status)}">
              <i class="leg-dot" aria-hidden="true"></i>
              <div class="bet-leg-body">
                <b>${esc(l.selectionName)}</b>
                <small>${esc(l.marketName || l.marketType || '')} · ${esc(l.fixtureName)}</small>
                ${this.legLive(state, l)}
              </div>
              <span class="mono bet-leg-odds">${formatOddsValue(l.lockedOdds, state.oddsFormat)}</span>
            </li>`).join('')}
        </ul>
        <footer class="bet-card-f">
          <span>Stake <b class="mono">${fmtPts(t.stake)}</b></span>
          ${t.status === 'OPEN'
            ? `<span>To return <b class="mono">${fmtPts(t.potentialPayout)}</b></span>`
            : `<span>Returned <b class="mono ${returned > 0 ? 'is-up' : ''}">${fmtPts(returned)}</b></span>`}
        </footer>
        ${t.status === 'OPEN' ? `
          <button type="button" class="btn btn-sm btn-block btn-cashout" ${cash === null ? 'disabled' : ''} onclick="window.appState.cashOut('${jsq(t.id)}')">
            ${icon('coins')}${cash === null ? 'Cash out suspended' : `Cash out <b class="mono">${fmtPts(cash)}</b>`}
          </button>` : ''}
      </article>`;
  }

  public static myBets(state: DemoStateManager): string {
    const open = state.myTickets.filter((t) => t.status === 'OPEN');
    const settled = state.myTickets.filter((t) => t.status !== 'OPEN');
    const list = state.betsTab === 'OPEN' ? open : settled;
    return `
      <div class="card demo-bets" id="ticketsHistory-block">
        <header class="card-h">${icon('layers')}<span>My bets</span><b class="count-badge mono">${state.myTickets.length}</b></header>
        <div class="seg-group demo-tabs" role="tablist">
          <button type="button" role="tab" class="seg ${state.betsTab === 'OPEN' ? 'is-active' : ''}" onclick="window.appState.setBetsTab('OPEN')">Open <b class="mono">${open.length}</b></button>
          <button type="button" role="tab" class="seg ${state.betsTab === 'SETTLED' ? 'is-active' : ''}" onclick="window.appState.setBetsTab('SETTLED')">Settled <b class="mono">${settled.length}</b></button>
        </div>
        <div class="bet-list">
          ${list.slice(0, 8).map((t) => this.ticket(state, t)).join('') || `<p class="demo-empty">${state.betsTab === 'OPEN' ? 'No open bets. Pick a price on the board to start.' : 'Settled tickets appear here after full time or cash out.'}</p>`}
          ${list.length > 8 ? `<p class="demo-empty">${list.length - 8} older ticket${list.length - 8 > 1 ? 's' : ''} in the wallet history.</p>` : ''}
        </div>
      </div>`;
  }

  // ---- Wallet modal -------------------------------------------------------------
  private static sparkline(state: DemoStateManager): string {
    const recent = state.demoTransactions.slice(0, 60).reverse();
    // Start from the balance before the oldest movement shown, so the first bet draws a line.
    const points = recent.length ? [recent[0].balance - recent[0].amount, ...recent.map((t) => t.balance)] : [];
    if (points.length < 2) return '<div class="spark-empty">Your balance chart appears after a few bets.</div>';
    const w = 600, h = 90;
    const min = Math.min(...points), max = Math.max(...points);
    const span = max - min || 1;
    const xy = points.map((v, i) => `${((i / (points.length - 1)) * w).toFixed(1)},${(h - 6 - ((v - min) / span) * (h - 12)).toFixed(1)}`);
    const up = points[points.length - 1] >= points[0];
    return `
      <svg class="spark ${up ? 'is-up' : 'is-down'}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Balance over the last ${points.length} transactions">
        <polygon class="spark-fill" points="0,${h} ${xy.join(' ')} ${w},${h}"/>
        <polyline class="spark-line" points="${xy.join(' ')}"/>
      </svg>
      <div class="spark-axis"><span class="mono">${fmtPts(min)}</span><span>last ${points.length - 1} movements</span><span class="mono">${fmtPts(max)}</span></div>`;
  }

  public static wallet(state: DemoStateManager): string {
    const s = state.summary();
    const filter = DEMO_TX_FILTERS[this.txFilter] || DEMO_TX_FILTERS.ALL;
    const rows = state.demoTransactions.filter((t) => !filter.kinds.length || filter.kinds.includes(t.kind)).slice(0, 40);
    const kpi = (tone: string, ico: string, label: string, value: string) =>
      `<div class="kpi tone-${tone}"><span class="kpi-ico">${icon(ico)}</span><small>${label}</small><strong class="mono">${value}</strong></div>`;
    return `
      <div class="modal-backdrop" onclick="if (event.target === this) window.appState.toggleCashierModal(false)">
        <div class="modal modal-lg demo-wallet" role="dialog" aria-modal="true" aria-label="Demo wallet">
          <header class="modal-h">
            <span class="modal-ico tone-volt">${icon('wallet')}</span>
            <div><h2>Demo wallet</h2><p>Sample player · stored only in this browser · no cash value</p></div>
            <button type="button" class="icon-btn" aria-label="Close" onclick="window.appState.toggleCashierModal(false)">${icon('x')}</button>
          </header>
          <div class="balance-banner"><span>${icon('coins')}Points balance</span><strong class="mono">${fmtPts(state.userBalance)} pts</strong></div>
          <div class="kpi-grid">
            ${kpi(s.netResult >= 0 ? 'up' : 'down', 'chart', 'Net result', demoSigned(s.netResult))}
            ${kpi('cyan', 'ticket', `Open stakes · ${s.open}`, fmtPts(s.openStake))}
            ${kpi(s.sportsNet >= 0 ? 'up' : 'down', 'soccer', 'Sports P/L', demoSigned(s.sportsNet))}
            ${kpi(s.casinoNet >= 0 ? 'up' : 'down', 'casino', 'Casino P/L', demoSigned(s.casinoNet))}
          </div>
          <section class="panel">
            <h3>${icon('chart')}Balance history</h3>
            ${this.sparkline(state)}
          </section>
          <section class="panel">
            <h3>${icon('receipt')}Transactions <b class="mono muted">${state.demoTransactions.length}</b></h3>
            <div class="seg-group" role="tablist">
              ${Object.entries(DEMO_TX_FILTERS).map(([id, f]) => `<button type="button" class="seg ${this.txFilter === id ? 'is-active' : ''}" onclick="window.DemoPanels.setTxFilter('${id}'); window.appState.notify();">${f.label}</button>`).join('')}
            </div>
            <div class="tx-table" role="table">
              ${rows.map((t) => `
                <div class="tx-row" role="row">
                  <span class="tx-ico">${icon(DEMO_TX_ICON[t.kind] || 'coins')}</span>
                  <span class="tx-main"><b>${esc(t.label)}</b><small class="mono">${demoTime(t.at)}</small></span>
                  <span class="tx-amt mono ${t.amount > 0 ? 'is-up' : t.amount < 0 ? 'is-down' : ''}">${demoSigned(t.amount)}</span>
                  <span class="tx-bal mono">${fmtPts(t.balance)}</span>
                </div>`).join('') || '<p class="demo-empty">No activity yet. Place a bet or play a casino round.</p>'}
            </div>
          </section>
          <div class="modal-actions">
            <button type="button" class="btn btn-volt" onclick="window.appState.depositDemo(1000)">${icon('plus')}Add 1,000 pts</button>
            <button type="button" class="btn btn-ghost" onclick="window.appState.depositDemo(5000)">${icon('plus')}Add 5,000</button>
            <button type="button" class="btn btn-ghost" onclick="if (confirm('Reset the demo wallet to ${DEMO_START_BALANCE} points and clear all tickets?')) window.appState.resetDemo()">${icon('refresh')}Reset demo</button>
          </div>
          <p class="modal-foot">${icon('shield-check')}Demo points are simulated locally and can never be withdrawn or exchanged.</p>
        </div>
      </div>`;
  }

  // ---- Account modal -------------------------------------------------------------
  public static account(state: DemoStateManager): string {
    const s = state.summary();
    const bySport = new Map<number, { legs: number }>();
    for (const t of state.myTickets) {
      for (const l of t.legs as any[]) {
        const id = Number(l.sportId) || 1;
        const row = bySport.get(id) || { legs: 0 };
        row.legs++;
        bySport.set(id, row);
      }
    }
    const names: Record<number, string> = { 1: 'Soccer', 2: 'Tennis', 3: 'Basketball', 4: 'Ice Hockey', 7: 'American Football', 8: 'Baseball', 9: 'Handball' };
    const kpi = (tone: string, ico: string, label: string, value: string) =>
      `<div class="kpi tone-${tone}"><span class="kpi-ico">${icon(ico)}</span><small>${label}</small><strong class="mono">${value}</strong></div>`;
    return `
      <div class="modal-backdrop" onclick="if (event.target === this) window.appState.toggleKpiModal(false)">
        <div class="modal modal-lg" role="dialog" aria-modal="true" aria-label="Demo account">
          <header class="modal-h">
            <span class="modal-ico tone-cyan">${icon('user')}</span>
            <div><h2>Demo player</h2><p>Local sample account · no registration, e-mail or password</p></div>
            <button type="button" class="icon-btn" aria-label="Close" onclick="window.appState.toggleKpiModal(false)">${icon('x')}</button>
          </header>
          <div class="kpi-grid">
            ${kpi('volt', 'ticket', 'Tickets placed', String(s.tickets))}
            ${kpi('up', 'trophy', 'Win rate', `${Math.round(s.winRate * 100)}%`)}
            ${kpi('gold', 'sparkle', 'Biggest win', fmtPts(s.biggestWin))}
            ${kpi('cyan', 'coins', 'Turnover', fmtPts(state.turnover))}
            ${kpi('violet', 'casino', 'Casino rounds', String(s.casinoRounds))}
            ${kpi('gold', 'coins', 'Cashed out', String(s.cashed))}
          </div>
          <section class="panel">
            <h3>${icon('chart')}Selections by sport</h3>
            ${bySport.size ? `<ul class="sport-bars">${[...bySport.entries()].sort((a, b) => b[1].legs - a[1].legs).map(([id, row]) => {
              const max = Math.max(...[...bySport.values()].map((r) => r.legs));
              return `<li>${icon(sportIcon(id))}<span>${esc(names[id] || 'Sport')}</span><span class="sport-bar"><i style="width:${Math.round((row.legs / max) * 100)}%"></i></span><b class="mono">${row.legs}</b></li>`;
            }).join('')}</ul>` : '<p class="demo-empty">Your favourite sports show up here once you bet.</p>'}
          </section>
          <section class="panel">
            <h3>${icon('info')}How this demo works</h3>
            <ul class="doc-list demo-doc">
              <li>Fixtures, scores and prices come from a match simulator running in your browser — not from real games.</li>
              <li>Odds are Monte-Carlo estimates with a 4.5–18% bookmaker margin, and move after every scoring event.</li>
              <li>Tickets settle when the simulated match ends. Cash out offers are based on the current prices.</li>
              <li>Balance and tickets persist in localStorage for this site. Clearing site data starts a fresh demo.</li>
            </ul>
          </section>
          <div class="modal-actions">
            <button type="button" class="btn btn-volt" onclick="window.appState.toggleKpiModal(false); window.appState.toggleCashierModal(true)">${icon('wallet')}Open wallet</button>
            <button type="button" class="btn btn-ghost" onclick="window.appState.toggleKpiModal(false); window._openLegalPage('responsible_gambling')">${icon('shield')}Responsible play</button>
          </div>
        </div>
      </div>`;
  }
}
