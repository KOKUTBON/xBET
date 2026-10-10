/**
 * xBET Web Application Entry Point
 *
 * Renders the application shell — header wallet, competition ribbon, sports
 * rail, centre view, bet slip, mobile navigation and modals — from the reactive
 * AppStateManager. Regions are patched only when their markup changes, so live
 * odds ticks never reset scroll, focus, hover or running animations.
 */

import { AppStateManager } from './state/app-state.ts';
import { DemoStateManager, DEMO_GAME_CATALOG } from './demo/demo-state.ts';
import { DemoPanels } from './demo/demo-panels.ts';
import { WebSocketClient } from './state/ws-client.ts';
import { LiveMatchListComponent } from './components/live-match-list.ts';
import { BetslipComponent } from './components/betslip.ts';
import { CasinoLobbyComponent } from './components/casino-lobby.ts';
import { GameFrameComponent } from './components/game-frame.ts';
import { MatchDetailsComponent } from './components/match-details.ts';
import { LegalModalComponent } from './components/pages/legal-modal.ts';
import { CashierModalComponent } from './components/modals/cashier-modal.ts';
import { AccountKpiModalComponent } from './components/modals/kpi-modal.ts';
import { TicketModalComponent } from './components/modals/ticket-modal.ts';
import { ProvablyFairModalComponent } from './components/modals/provably-fair-modal.ts';
import { LoginModalComponent } from './components/modals/login-modal.ts';
import { TraderConsoleComponent } from './components/pages/trader-console.ts';
import { icon, mountIconSprite, sportIcon, esc, jsq, fmtPts, initials } from './ui/icons.ts';

// Initialize Global State & WebSocket Streaming Client
const staticDemo = (window as any).XBET_STATIC_DEMO === true;
document.body.classList.toggle('demo-mode', staticDemo);
const appState = staticDemo ? new DemoStateManager() : new AppStateManager();
const wsClient = new WebSocketClient(appState);

// Expose state globally for inline event handlers & inspection
(window as any).appState = appState;
(window as any).CasinoLobbyComponent = CasinoLobbyComponent;
(window as any).CashierModalComponent = CashierModalComponent;
(window as any).ProvablyFairModalComponent = ProvablyFairModalComponent;
(window as any).LoginModalComponent = LoginModalComponent;
(window as any).TraderConsoleComponent = TraderConsoleComponent;
(window as any).MatchDetailsComponent = MatchDetailsComponent;
(window as any).DemoPanels = DemoPanels;
(window as any)._openLegalPage = (page: any) => {
  LegalModalComponent.setPage(page);
  appState.openLegalPage(page);
  window.scrollTo({ top: 0 });
};

// ============================================================================
// SPORTS MENU
// ============================================================================
export interface SportCategory {
  id: number;
  name: string;
  leagues: string[];
}

export const ALL_SPORTS_CATEGORIES: SportCategory[] = [
  {
    id: 1,
    name: 'Soccer',
    leagues: [
      'UEFA Champions League', 'Premier League', 'Spanish La Liga', 'German Bundesliga', 'Italian Serie A',
      'French Ligue 1', 'UEFA Europa League', 'Dutch Eredivisie', 'Portuguese Primeira Liga',
      'Turkish Super Lig', 'Russian Premier League', 'Brazilian Serie A', 'United States MLS',
    ],
  },
  { id: 2, name: 'Tennis', leagues: ['Wimbledon Men Singles', 'ATP US Open', 'Roland Garros', 'Australian Open', 'Davis Cup'] },
  { id: 3, name: 'Basketball', leagues: ['NBA', 'EuroLeague', 'NCAA Men Basketball', 'Spanish Liga ACB', 'Italian Serie A1 Basket'] },
  { id: 4, name: 'Ice Hockey', leagues: ['NHL', 'KHL', 'Swedish SHL', 'Finnish Liiga', 'IIHF World Championship'] },
  { id: 5, name: 'Formula 1', leagues: ['Monaco Grand Prix', 'British Grand Prix', 'Italian Grand Prix', 'Drivers Championship'] },
  { id: 6, name: 'Rugby Union', leagues: ['Six Nations', 'Rugby World Cup', 'English Premiership', 'Super Rugby'] },
  { id: 7, name: 'American Football', leagues: ['NFL', 'NCAAF College Football', 'CFL'] },
  { id: 8, name: 'Baseball', leagues: ['MLB', 'Japanese NPB', 'Korean KBO League'] },
  { id: 9, name: 'Handball', leagues: ['EHF Champions League', 'German Bundesliga Handball', 'World Championship'] },
  { id: 10, name: 'Volleyball', leagues: ['FIVB Nations League', 'CEV Champions League', 'Italian SuperLega'] },
  { id: 11, name: 'Cricket', leagues: ['IPL T20', 'ICC Cricket World Cup', 'The Ashes', 'T20 World Cup'] },
  { id: 12, name: 'Golf', leagues: ['The Masters', 'PGA Championship', 'US Open Golf', 'The Open Championship'] },
  { id: 13, name: 'Boxing', leagues: ['WBC Heavyweight', 'WBA Super', 'IBF World Bouts', 'Title Fights'] },
  { id: 14, name: 'MMA', leagues: ['UFC Championship', 'UFC Fight Night', 'Bellator MMA', 'ONE Championship'] },
  { id: 15, name: 'Snooker', leagues: ['World Snooker Championship', 'The Masters', 'UK Championship'] },
  { id: 16, name: 'Darts', leagues: ['PDC World Darts Championship', 'Premier League Darts', 'World Matchplay'] },
  { id: 17, name: 'Cycling', leagues: ['Tour de France', 'Giro d Italia', 'Vuelta a Espana'] },
  { id: 18, name: 'Motorcycles', leagues: ['MotoGP World Championship', 'Moto2', 'Superbike World Championship'] },
  { id: 19, name: 'Badminton', leagues: ['BWF World Championships', 'All England Open', 'Thomas & Uber Cup'] },
  { id: 20, name: 'Table Tennis', leagues: ['ITTF World Tour', 'Russian Liga Pro', 'TT Cup'] },
];

// ============================================================================
// TOP COMPETITIONS RIBBON
// ============================================================================
export const ALL_PREMIER_LEAGUES: string[] = [
  'UEFA Champions League', 'Premier League', 'Wimbledon Men Singles', 'NBA', 'German Bundesliga', 'Italian Serie A',
  'French Ligue 1', 'NHL', 'Monaco Grand Prix', 'NFL', 'Six Nations Championship', 'MLB', 'UFC Championship',
  'PDC World Darts Championship', 'Tour de France', 'MotoGP World Championship', 'IPL T20', 'The Masters',
  'World Cup', 'Spanish Liga Primera', 'Dutch Eredivisie', 'Portuguese Prim. Liga', 'Scottish Premiership',
  'Turkish Super Lig', 'English FA Cup', 'Copa Libertadores', 'Brazilian Serie A', 'United States MLS', 'Europa League',
];

// ============================================================================
// UI CONTROLLER (theme, drawers, keyboard)
// ============================================================================
const xui = {
  toggleTheme(): void {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('xbet-theme', next); } catch (_e) { /* storage unavailable */ }
  },
  toggleDrawer(force?: boolean): void {
    document.body.classList.toggle('drawer-open', force);
    document.body.classList.remove('slip-open');
  },
  toggleSlip(force?: boolean): void {
    document.body.classList.toggle('slip-open', force);
    document.body.classList.remove('drawer-open');
  },
  closeOverlays(): void {
    document.body.classList.remove('drawer-open', 'slip-open');
  },
  focusSearch(): void {
    const input = document.getElementById('event-search') as HTMLInputElement | null;
    if (input) { input.focus(); input.select(); }
  },
};
(window as any).xui = xui;

document.addEventListener('keydown', (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
  if (e.key === 'Escape') {
    xui.closeOverlays();
    if (appState.showKpiModal) appState.toggleKpiModal(false);
    if (appState.showCashierModal) appState.toggleCashierModal(false);
    if (appState.activePrintTicket) appState.closePrintTicket();
  } else if (e.key === '/' && !typing) {
    e.preventDefault();
    if (window.innerWidth < 1100) xui.toggleDrawer(true);
    xui.focusSearch();
  }
});

// ============================================================================
// LIVE CLOCK
// ============================================================================
function updateDateTime(): void {
  const el = document.getElementById('date_time');
  if (el) {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    el.textContent = `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}
setInterval(updateDateTime, 1000);

// ============================================================================
// PATCHING HELPERS
// ============================================================================
function patch(el: HTMLElement | null, html: string): void {
  if (!el) return;
  if ((el as any).__html === html) return;
  (el as any).__html = html;
  el.innerHTML = html;
}

function modalRoot(id: string): HTMLElement {
  let root = document.getElementById(id);
  if (!root) {
    root = document.createElement('div');
    root.id = id;
    document.body.appendChild(root);
  }
  return root;
}

function isLive(m: any): boolean {
  return Boolean(m.isLive || m.isInPlay || m.status === 'LIVE');
}

// ============================================================================
// REGION RENDERERS
// ============================================================================
function renderUserBox(): string {
  const dataModeColors: Record<string, string> = {
    SIMULATED: '#3b82f6',
    REFERENCE_ONLY: '#f59e0b',
    LICENSED_LIVE: '#10b981',
  };
  const modeColor = dataModeColors[appState.dataMode] || '#3b82f6';

  const modeBadge = `
    <div class="data-mode-badge" style="display: flex; align-items: center; gap: 4px; padding: 2px 8px; background: rgba(255,255,255,0.06); border: 1px solid ${modeColor}40; border-radius: 4px; font-size: 0.7rem; margin-right: 6px;" title="Sports Data Ingestion Mode: ${appState.dataMode}">
      <span style="width: 6px; height: 6px; border-radius: 50%; background: ${modeColor};"></span>
      <span style="color: ${modeColor}; font-weight: 600; text-transform: uppercase;">${appState.dataMode}</span>
    </div>
  `;

  if (!appState.isAuthenticated) {
    return `
      <div class="wallet" id="loged" style="display: flex; align-items: center; gap: 6px;">
        ${modeBadge}
        <button type="button" class="btn btn-volt btn-sm" onclick="window.appState.toggleLoginModal(true)" style="padding: 0.35rem 0.8rem; font-weight: 600;">
          ${icon('lock')}<span>Sign In</span>
        </button>
      </div>
    `;
  }

  const isStaff = appState.userRole === 'TRADER' || appState.userRole === 'ADMINISTRATOR' || appState.userRole === 'RISK_MANAGER';

  return `
    <div class="wallet" id="loged" style="display: flex; align-items: center; gap: 6px;">
      ${modeBadge}
      <button type="button" class="wallet-balance" onclick="window.appState.toggleCashierModal(true)" title="Points balance — open cashier">
        <span class="wallet-ico">${icon('wallet')}</span>
        <span class="wallet-figures">
          <small>Balance</small>
          <strong class="mono">${fmtPts(appState.userBalance)}<i>pts</i></strong>
        </span>
      </button>
      <button type="button" class="btn btn-volt btn-sm wallet-cashier" onclick="window.appState.toggleCashierModal(true)">${icon('store')}<span>Cashier</span></button>
      ${isStaff ? `
        <button type="button" class="btn btn-ghost btn-sm" style="color: #10b981; border: 1px solid rgba(16,185,129,0.3); padding: 0.35rem 0.6rem; border-radius: 4px;" onclick="window.appState.setActiveTab('trader')" title="Operator &amp; Trader Console">
          🛡️ <span class="hide-md">Console</span>
        </button>
      ` : ''}
      <button type="button" class="avatar-btn" onclick="window.appState.toggleKpiModal(true)" title="Account and protection" aria-label="My account">
        <span class="avatar">${esc(initials(appState.username))}</span>
        <span class="avatar-name hide-md">${esc(appState.username)}</span>
      </button>
    </div>`;
}

function renderRibbon(): string {
  // The static demo only lists competitions that currently have events on the board.
  const leagues = appState.demoMode
    ? [...new Set(Array.from(appState.liveFixtures.values()).map((f: any) => f.tournamentName))]
    : ALL_PREMIER_LEAGUES;
  return `
    <span class="ribbon-label">${icon('flame')}Top</span>
    ${leagues.filter(l=>!appState.restrictedPilot || ALL_SPORTS_CATEGORIES[0].leagues.includes(l)).map((l) => `
      <button type="button" class="chip ${appState.selectedLeagueName === l ? 'is-active' : ''}" onclick="window.appState.selectLeague('${jsq(l)}')">${esc(l)}</button>
    `).join('')}`;
}

/** Sports A–Z; in the static demo only sports and competitions with events are listed. */
function sportsMenu(fixtures: any[]): SportCategory[] {
  if (!appState.demoMode) return ALL_SPORTS_CATEGORIES.filter(sport=>!appState.restrictedPilot || sport.id===1);
  return ALL_SPORTS_CATEGORIES
    .map((sport) => ({ ...sport, leagues: [...new Set(fixtures.filter((f) => f.sportId === sport.id).map((f) => f.tournamentName))] }))
    .filter((sport) => sport.leagues.length > 0);
}

function renderSidebar(fixtures: any[]): string {
  const liveCount = fixtures.filter(isLive).length;

  return `
    <div class="rail-section">
      <form class="search" id="EventSearchForm" onsubmit="event.preventDefault();" role="search">
        ${icon('search')}
        <input type="search" id="event-search" class="event-search-input" placeholder="Search teams, leagues, IDs" autocomplete="off"
          value="${esc(appState.searchQuery)}" oninput="window.appState.setSearchQuery(this.value)" aria-label="Search events" />
        <kbd>/</kbd>
      </form>
    </div>

    <button type="button" class="live-cta ${appState.activeTab === 'inplay' ? 'is-active' : ''}" onclick="window.appState.setActiveTab('inplay'); window.xui.closeOverlays();">
      <span class="live-dot"></span>
      <span class="live-cta-text"><strong>Live betting</strong><small>${appState.demoMode ? 'Simulated in-play prices' : 'Real-time odds stream'}</small></span>
      <span class="live-cta-count mono">${liveCount}</span>
    </button>

    <div class="rail-heading">
      <span>Sports A–Z</span>
      ${appState.selectedSportId !== null || appState.selectedLeagueName || appState.searchQuery ? `<button type="button" class="link-btn" onclick="window.appState.selectSport(null)">${icon('refresh')}Reset</button>` : ''}
    </div>

    <ul class="sport-list">
      ${sportsMenu(fixtures).map((sport) => {
        const isSelected = appState.selectedSportId === sport.id;
        const isExpanded = appState.expandedSportId === sport.id;
        const count = fixtures.filter((m: any) => m.sportId === sport.id || (!m.sportId && sport.id === 1)).length;
        return `
          <li class="sport-item ${isExpanded ? 'is-open' : ''}">
            <button type="button" class="sport-link ${isSelected ? 'is-active' : ''}" onclick="window.appState.selectSport(${sport.id})">
              <span class="sport-ico">${icon(sportIcon(sport.id))}</span>
              <span class="sport-name">${esc(sport.name)}</span>
              ${count > 0 ? `<span class="sport-count mono">${count}</span>` : ''}
              <span class="sport-caret">${icon('chevron-right')}</span>
            </button>
            ${isExpanded ? `
              <div class="league-list">
                <button type="button" class="league-link ${isSelected && !appState.selectedLeagueName ? 'is-active' : ''}" onclick="window.appState.selectSport(${sport.id}); window.xui.closeOverlays();">All ${esc(sport.name)}</button>
                ${sport.leagues.map((league) => `
                  <button type="button" class="league-link ${appState.selectedLeagueName === league ? 'is-active' : ''}" onclick="window.appState.selectLeague('${jsq(league)}'); window.xui.closeOverlays();">${esc(league)}</button>
                `).join('')}
              </div>` : ''}
          </li>`;
      }).join('')}
    </ul>

    <div class="rail-footnote">
      ${icon('fingerprint')}
      <span>${appState.demoMode ? 'All odds, results and points are simulated locally in this browser.' : 'Every casino round is provably fair and every point moves through a double-entry ledger.'}</span>
    </div>`;
}

function renderBottomNav(): string {
  const tab = appState.activeTab;
  const count = appState.slipItems.size;
  const item = (id: string, label: string, ico: string, active: boolean, action: string) => `
    <button type="button" class="bn-item ${active ? 'is-active' : ''}" onclick="${action}">
      ${icon(ico)}<span>${label}</span>
    </button>`;
  return `
    ${item('sports', 'Sports', 'soccer', tab === 'sports', "window.xui.closeOverlays(); window.appState.setActiveTab('sports')")}
    ${item('inplay', 'Live', 'live', tab === 'inplay', "window.xui.closeOverlays(); window.appState.setActiveTab('inplay')")}
    <button type="button" class="bn-slip ${count ? 'has-items' : ''}" onclick="window.xui.toggleSlip()" aria-label="Bet slip">
      ${icon('ticket')}<b class="mono">${count}</b>
    </button>
    ${item('casino', 'Casino', 'casino', tab === 'casino' || (tab === 'game' && appState.activeGameCategory !== 'virtual'), "window.xui.closeOverlays(); window.appState.setActiveTab('casino')")}
    ${appState.demoMode ? item('wallet', 'Wallet', 'wallet', false, "window.xui.closeOverlays(); window.appState.toggleCashierModal(true)") : item('virtual', 'Virtuals', 'virtual', tab === 'virtual' || (tab === 'game' && appState.activeGameCategory === 'virtual'), "window.xui.closeOverlays(); window.appState.setActiveTab('virtual')")}`;
}

function renderLiveCasino(): string {
  return `
    <section class="hero hero-violet">
      <div class="hero-copy">
        <span class="eyebrow">${icon('studio')}Live studio</span>
        <h1>Live dealer tables</h1>
        <p>The live-dealer studio is an integration pattern in this project — no external studio is connected, so no streams run here. Every table game below runs on the platform's own provably-fair engine instead.</p>
        <div class="hero-actions">
          <button type="button" class="btn btn-volt" onclick="window.CasinoLobbyComponent.setCategory('TABLE'); window.appState.setActiveTab('casino');">${icon('cards')}Play table games</button>
          <button type="button" class="btn btn-ghost" onclick="window._openLegalPage('faq')">${icon('help')}How it works</button>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        <div class="studio-screen">${icon('studio')}<span class="studio-off">Offline</span></div>
      </div>
    </section>`;
}

// ============================================================================
// MAIN RENDER
// ============================================================================
export function renderApp(): void {
  updateDateTime();

  // Preserve focus + caret across re-renders (search box, stake input…)
  const active = document.activeElement as HTMLInputElement | null;
  const focusId = active && active.id ? active.id : null;
  const caret = focusId && typeof active!.selectionStart === 'number' ? [active!.selectionStart, active!.selectionEnd] : null;
  const scrolls: Array<[string, number, number]> = [];
  document.querySelectorAll<HTMLElement>('[data-keep-scroll][id]').forEach((el) => scrolls.push([el.id, el.scrollLeft, el.scrollTop]));

  const fixtures = Array.from(appState.liveFixtures.values());

  // 1. Primary navigation state
  ['sports', 'inplay', 'casino', 'livecasino', 'virtual', 'bingo', 'keno'].forEach((tab) => {
    const btn = document.getElementById(`tab-${tab}`);
    if (!btn) return;
    let on = appState.activeTab === tab;
    if (appState.activeTab === 'game') {
      if (tab === 'bingo' || tab === 'keno') on = appState.activeGameSlug === tab;
      else if (tab === 'virtual') on = appState.activeGameCategory === 'virtual';
      else if (tab === 'casino') on = appState.activeGameCategory !== 'virtual' && !['bingo', 'keno'].includes(appState.activeGameSlug);
    }
    btn.classList.toggle('is-active', on);
  });
  const liveCountEl = document.getElementById('nav-live-count');
  if (liveCountEl) liveCountEl.textContent = String(fixtures.filter(isLive).length || '');

  const oddsSelect = document.getElementById('odds-format-select') as HTMLSelectElement | null;
  if (oddsSelect && oddsSelect.value !== appState.oddsFormat) oddsSelect.value = appState.oddsFormat;

  patch(document.getElementById('feed-status'), appState.feedConnected
    ? `<span class="feed-dot is-on"></span><span>${appState.demoMode ? ((appState as DemoStateManager).demoPaused ? 'Simulation paused' : `Simulated feed${(appState as DemoStateManager).demoSpeed > 1 ? ` · ${(appState as DemoStateManager).demoSpeed}×` : ''}`) : 'Live feed'}</span>`
    : `<span class="feed-dot"></span><span>Connecting…</span>`);

  // 2. Header wallet
  patch(document.getElementById('header-user-container'), renderUserBox());

  // 3. Competition ribbon
  patch(document.getElementById('premier-leagues-bar'), renderRibbon());

  // 4. Sports rail
  patch(document.getElementById('sports-sidebar-container'), renderSidebar(fixtures));

  // 5. Centre view
  const centerElem = document.getElementById('main-content-view');
  let center = '';
  let view = appState.activeTab as string;
  if (appState.activeTab === 'trader' || appState.activeTab === 'console') { center = TraderConsoleComponent.render(appState); view = 'trader'; }
  else if (appState.activeTab === 'game') center = GameFrameComponent.render(appState);
  else if (appState.activeFixtureId) { center = MatchDetailsComponent.render(appState, appState.activeFixtureId); view = 'match'; }
  else if (appState.activeTab === 'sports' || appState.activeTab === 'inplay') {
    const board = !appState.searchQuery && appState.selectedSportId === null && !appState.selectedLeagueName && appState.activeTab === 'sports';
    center = (appState.demoMode && board ? DemoPanels.welcome(appState as DemoStateManager) : '') + LiveMatchListComponent.render(appState);
  }
  else if (appState.activeTab === 'casino' || appState.activeTab === 'virtual') center = CasinoLobbyComponent.render(appState);
  else if (appState.activeTab === 'livecasino') center = renderLiveCasino();
  else if (appState.activeTab === 'legal') center = LegalModalComponent.render(appState, appState.activeLegalPage as any);
  if (centerElem) centerElem.setAttribute('data-view', view);
  patch(centerElem, center);
  document.body.setAttribute('data-view', view);

  // 6. Bet slip
  patch(document.getElementById('betslip-container'), BetslipComponent.render(appState));

  // 7. Mobile bottom navigation
  patch(document.getElementById('bottom-nav'), renderBottomNav());

  // 8. Modals
  patch(modalRoot('kpi-modal-root'), AccountKpiModalComponent.render(appState));
  patch(modalRoot('cashier-modal-root'), CashierModalComponent.render(appState));
  patch(modalRoot('ticket-modal-root'), TicketModalComponent.render(appState));
  patch(modalRoot('provably-fair-modal-root'), ProvablyFairModalComponent.render(appState));
  patch(modalRoot('login-modal-root'), LoginModalComponent.render(appState));
  document.body.classList.toggle('modal-open', Boolean(appState.showKpiModal || appState.showCashierModal || appState.showProvablyFairModal || appState.showLoginModal || appState.activePrintTicket));

  // Restore focus / scroll
  scrolls.forEach(([id, left, top]) => {
    const el = document.getElementById(id);
    if (el) { el.scrollLeft = left; el.scrollTop = top; }
  });
  if (focusId && document.activeElement?.id !== focusId) {
    const el = document.getElementById(focusId) as HTMLInputElement | null;
    if (el) {
      el.focus({ preventScroll: true });
      if (caret) { try { el.setSelectionRange(caret[0], caret[1]); } catch (_e) { /* number inputs */ } }
    }
  }
}

// Initial bootstrap
mountIconSprite();
(window as any).renderApp = renderApp;
appState.subscribe(renderApp);
if (staticDemo) {
  (appState as DemoStateManager).startDemo();
  CasinoLobbyComponent.setCatalog(DEMO_GAME_CATALOG as any);
  document.getElementById('tab-livecasino')?.remove();
} else wsClient.connect();
renderApp();

// Restore the server-issued session and durable points history.
void appState.restoreSession();
if (!staticDemo) fetch('/api/v1/casino/games').then(response=>response.json()).then(({games})=>{if(games?.length===1 && games[0].slug==='roulette'){appState.restrictedPilot=true;for(const id of ['tab-livecasino','tab-virtual','tab-bingo','tab-keno'])document.getElementById(id)?.remove();}if(games)CasinoLobbyComponent.setCatalog(games.map((game:any)=>({id:game.slug,title:game.title,category:'TABLE',icon:'roulette',provider:'xBET',art:'felt'})));renderApp();}).catch(()=>{});

// Register the PWA service worker (offline shell caching, installability).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {
      // Non-fatal: the app works fine without an active service worker.
    });
  });
}

console.log('[App] xBET platform initialized.');
