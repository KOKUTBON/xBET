/**
 * Game Frame Component
 *
 * Renders a REAL, playable client for the platform's own RGS game engines.
 * Every round calls the backend casino/virtual engines over HTTP; points move
 * server-side through the shared points ledger. No external/imported iframe.
 *
 * Each engine gets a purpose-built stage that visualises the actual round the
 * server returned: the roulette wheel lands on the drawn pocket, slot reels
 * show the returned grid, card games deal the returned hands, keno and bingo
 * mark the drawn balls, and virtual races run to the engine's finish order.
 */

import { AppStateManager } from '../state/app-state.ts';
import { CasinoLobbyComponent } from './casino-lobby.ts';
import { icon, esc, jsq, fmtPts } from '../ui/icons.ts';

const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const KENO_DEFAULT_PICKS = [3, 7, 18, 24, 55];

const SLOT_SYMBOLS: Record<string, { ico?: string; text?: string; tone: string }> = {
  CHERRY: { ico: 'cherry', tone: 'red' },
  LEMON: { ico: 'lemon', tone: 'yellow' },
  ORANGE: { ico: 'orange', tone: 'orange' },
  PLUM: { ico: 'plum', tone: 'purple' },
  GRAPE: { ico: 'grape', tone: 'purple' },
  GRAPES: { ico: 'grape', tone: 'purple' },
  WATERMELON: { ico: 'melon', tone: 'green' },
  MELON: { ico: 'melon', tone: 'green' },
  BELL: { ico: 'bell', tone: 'yellow' },
  DIAMOND: { ico: 'gem', tone: 'cyan' },
  STAR: { ico: 'star', tone: 'yellow' },
  BONUS: { ico: 'star', tone: 'volt' },
  SEVEN: { text: '7', tone: 'red' },
  BAR: { text: 'BAR', tone: 'slate' },
  WILD: { text: 'WILD', tone: 'wild' },
};

const OPTION_ICONS: Record<string, string> = {
  HIGHER: 'caret-up', LOWER: 'caret-down', PLAYER: 'user', BANKER: 'store', TIE: 'minus',
};

export class GameFrameComponent {
  /** Recent roulette numbers, newest first (rendered as the history strip). */
  public static rouletteHistory: number[] = [];
  private static seenRound: number = 0;

  public static render(appState: AppStateManager): string {
    const title = appState.activeGameTitle || 'Game';
    const entry = CasinoLobbyComponent.catalog.find((g) => g.id === appState.activeGameSlug);
    const isVirtual = appState.activeGameCategory === 'virtual';
    const tone = isVirtual ? 'cyan' : entry?.category === 'TABLE' ? 'violet' : entry?.category === 'INSTANT' ? 'volt' : 'gold';

    const header = `
      <header class="game-head game-frame-header">
        <button type="button" class="btn btn-ghost btn-sm" onclick="window.appState.closeGame()">${icon('arrow-left')}<span class="hide-sm">Lobby</span></button>
        <span class="game-badge tone-${tone}">${icon(entry?.icon || (isVirtual ? 'flag' : 'casino'))}</span>
        <div class="game-titles">
          <h1>${esc(title)}</h1>
          <span class="game-tags">
            ${appState.demoMode ? '<span class="tag">Simulated round</span>' : `<button type="button" class="tag" style="cursor: pointer; border: 1px solid rgba(0, 230, 118, 0.4); background: rgba(0, 230, 118, 0.08); color: var(--color-volt, #00e676);" onclick="window.appState.toggleProvablyFairModal(true, window.appState.lastGameResult)">${icon('shield-check')}Verify Fairness</button>`}
            <span class="tag hide-sm">${icon('layers')}${appState.demoMode ? 'Local demo' : appState.activeB2BProvider ? esc(appState.activeB2BProvider) : 'Own RGS engine'}</span>
          </span>
        </div>
        <div class="game-balance">
          <small>Balance</small>
          <strong class="mono">${fmtPts(appState.userBalance)}<i>pts</i></strong>
        </div>
      </header>`;

    const body = appState.activeB2BLaunchUrl
      ? this.renderB2BGame(appState)
      : isVirtual
        ? this.renderVirtualRace(appState)
        : this.renderCasinoGame(appState);

    return `
      <div class="game-shell tone-${tone} game-frame-container active-provider-game-frame">
        ${header}
        ${body}
      </div>`;
  }

  // ==========================================================================
  // B2B Aggregator Iframe Game
  // ==========================================================================
  private static renderB2BGame(appState: AppStateManager): string {
    const url = appState.activeB2BLaunchUrl;
    const provider = appState.activeB2BProvider || 'B2B Aggregator';
    return `
      <div class="b2b-game-container" style="display: flex; flex-direction: column; width: 100%; min-height: 680px; position: relative; background: #0b0e14; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.1);">
        <div class="b2b-status-bar" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 18px; background: rgba(0, 0, 0, 0.7); border-bottom: 1px solid rgba(255, 255, 255, 0.08); font-size: 13px; color: #a0aec0;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #00e676; box-shadow: 0 0 8px #00e676;"></span>
            <span>Seamless Wallet: <strong>${esc(provider)}</strong></span>
          </div>
          <div style="display: flex; align-items: center; gap: 16px;">
            <span style="display: flex; align-items: center; gap: 4px;">${icon('shield-check')} GLI-19 Certified RNG</span>
            <span>Reality Check: <strong class="mono" style="color: #00e676;">Active</strong></span>
          </div>
        </div>
        <iframe
          src="${esc(url)}"
          style="width: 100%; height: 630px; border: none; flex: 1; background: #121824;"
          allow="autoplay; fullscreen; encrypted-media"
          title="${esc(appState.activeGameTitle || 'Casino Game')}"
        ></iframe>
      </div>`;
  }

  // ==========================================================================
  // Casino games
  // ==========================================================================
  private static renderCasinoGame(appState: AppStateManager): string {
    const cfg = AppStateManager.resolveGameConfig(appState.activeGameSlug);
    if (!cfg) {
      return `
        <div class="empty-state">
          <span class="empty-ico">${icon('code')}</span>
          <h3>Engine not wired for this title</h3>
          <p>This game has no backend RGS engine in the project yet. The playable titles are roulette, slots, baccarat, blackjack, high-low, keno, scratch and bingo — each runs on the platform's own provably-fair engine and moves real points.</p>
        </div>`;
    }

    const r = appState.lastGameResult;
    if (cfg.kind === 'roulette' && r && !r.error && r.roundKey && r.roundKey !== this.seenRound) {
      this.seenRound = r.roundKey;
      const n = Number(r.raw?.gameState?.winningNumber ?? r.raw?.winningNumber);
      if (Number.isFinite(n)) this.rouletteHistory = [n, ...this.rouletteHistory].slice(0, 12);
    }

    const stage = this.stageFor(cfg.kind, appState);
    const stake = appState.gameStake;
    const busy = appState.gameBusy;

    const optButtons = (cfg.options || []).map((o: string) => {
      const marker = cfg.kind === 'roulette'
        ? `<i class="opt-dot opt-${o.toLowerCase()}"></i>`
        : OPTION_ICONS[o] ? icon(OPTION_ICONS[o]) : '';
      const on = appState.gameOption === o || (!appState.gameOption && o === cfg.options[0]);
      return `<button type="button" class="seg ${on ? 'is-active' : ''}" onclick="window.appState.setGameOption('${jsq(o)}'); window.renderApp();">${marker}${esc(o)}</button>`;
    }).join('');

    const playIcon = cfg.kind === 'roulette' ? 'roulette' : cfg.kind === 'slots' ? 'slots' : cfg.kind === 'cards' ? 'cards' : 'play';
    const playLabel = busy ? 'Playing…' : cfg.kind === 'slots' || cfg.kind === 'roulette' ? 'Spin' : cfg.kind === 'cards' ? 'Deal' : 'Play';

    return `
      <div class="game-stage stage-${cfg.kind} ${busy ? 'is-busy' : ''}">
        ${stage}
        ${this.renderResult(appState)}
      </div>

      <div class="game-dock">
        ${optButtons ? `<div class="dock-block"><span class="dock-label">Your bet</span><div class="seg-group">${optButtons}</div></div>` : ''}
        <div class="dock-block">
          <span class="dock-label">Stake</span>
          <div class="stepper">
            <button type="button" class="step-btn" onclick="window.appState.setGameStake(${stake - 5}); window.renderApp();" aria-label="Decrease stake">${icon('minus')}</button>
            <input id="game-stake" class="mono" value="${stake}" inputmode="numeric" aria-label="Stake"
              onchange="window.appState.setGameStake(Number(this.value)); window.renderApp();" />
            <button type="button" class="step-btn" onclick="window.appState.setGameStake(${stake + 5}); window.renderApp();" aria-label="Increase stake">${icon('plus')}</button>
          </div>
          <div class="chip-row">
            ${[5, 10, 25, 50, 100].map((v) => `<button type="button" class="bet-chip ${stake === v ? 'is-active' : ''}" onclick="window.appState.setGameStake(${v}); window.renderApp();"><span class="mono">${v}</span></button>`).join('')}
          </div>
        </div>
        <button type="button" class="btn btn-volt btn-lg btn-play" ${busy ? 'disabled' : ''} onclick="window.appState.playActiveGame()">
          ${icon(playIcon, busy ? 'spin' : '')}<span>${playLabel}</span><span class="mono btn-sub">${stake} pts</span>
        </button>
      </div>`;
  }

  private static stageFor(kind: string, appState: AppStateManager): string {
    const r = appState.lastGameResult;
    const gs = r && !r.error ? (r.raw?.gameState || r.raw || {}) : null;
    switch (kind) {
      case 'roulette': return this.rouletteStage(gs, r);
      case 'slots': return this.slotsStage(gs, r);
      case 'cards': return this.cardsStage(gs);
      case 'highlow': return this.highLowStage(gs);
      case 'numbers': return this.kenoStage(gs, r);
      case 'instant': return appState.activeGameSlug === 'bingo' ? this.bingoStage(gs, r) : this.scratchStage(gs, r);
      default: return `<div class="stage-idle">${icon('casino')}</div>`;
    }
  }

  // ---- Roulette -----------------------------------------------------------
  private static rouletteStage(gs: any, r: any): string {
    const step = 360 / WHEEL_ORDER.length;
    const n = gs ? Number(gs.winningNumber ?? gs.number) : NaN;
    const idx = Number.isFinite(n) ? WHEEL_ORDER.indexOf(n) : -1;
    const land = idx >= 0 ? -idx * step : 0;
    const pt = (deg: number, rad: number) => {
      const a = ((deg - 90) * Math.PI) / 180;
      return `${(150 + rad * Math.cos(a)).toFixed(2)} ${(150 + rad * Math.sin(a)).toFixed(2)}`;
    };
    const pockets = WHEEL_ORDER.map((num, i) => {
      const a0 = i * step - step / 2;
      const a1 = i * step + step / 2;
      const color = num === 0 ? 'green' : RED_NUMBERS.has(num) ? 'red' : 'black';
      return `<path class="pk pk-${color} ${i === idx ? 'pk-win' : ''}" d="M${pt(a0, 140)} A140 140 0 0 1 ${pt(a1, 140)} L${pt(a1, 100)} A100 100 0 0 0 ${pt(a0, 100)} Z"/>
        <text class="pk-num" x="150" y="${150 - 120}" transform="rotate(${i * step} 150 150)" text-anchor="middle" dominant-baseline="middle">${num}</text>`;
    }).join('');
    const color = !Number.isFinite(n) ? '' : n === 0 ? 'green' : RED_NUMBERS.has(n) ? 'red' : 'black';

    return `
      <div class="roulette">
        <div class="wheel-wrap">
          <span class="wheel-pointer" aria-hidden="true"></span>
          <svg class="wheel ${idx >= 0 ? 'is-landing' : ''}" viewBox="0 0 300 300" style="--land:${land}deg" data-round="${r?.roundKey || 0}">
            <circle class="wheel-rim" cx="150" cy="150" r="148"/>
            ${pockets}
            <circle class="wheel-bowl" cx="150" cy="150" r="98"/>
            ${Array.from({ length: 8 }, (_, i) => `<path class="wheel-spoke" d="M150 150 L${pt(i * 45, 70)}"/>`).join('')}
          </svg>
          <div class="wheel-hub ${color ? `hub-${color}` : ''}">
            ${Number.isFinite(n) ? `<b class="mono">${n}</b><small>${esc(gs.winningColor || color)}</small>` : `${icon('roulette')}<small>Place your bet</small>`}
          </div>
        </div>
        <div class="history-strip" aria-label="Recent numbers">
          <span class="dock-label">Last</span>
          ${this.rouletteHistory.length ? this.rouletteHistory.map((h) => `<span class="hist hist-${h === 0 ? 'green' : RED_NUMBERS.has(h) ? 'red' : 'black'} mono">${h}</span>`).join('') : '<span class="muted">No spins yet</span>'}
        </div>
      </div>`;
  }

  // ---- Slots --------------------------------------------------------------
  private static slotSymbol(sym: string, i: number): string {
    const key = String(sym || '').toUpperCase();
    const s = SLOT_SYMBOLS[key] || { text: key.slice(0, 3) || '?', tone: 'slate' };
    return `<span class="sym sym-${s.tone}" style="--d:${i * 70}ms" title="${esc(key)}">${s.ico ? icon(s.ico) : `<b>${esc(s.text)}</b>`}</span>`;
  }

  private static slotsStage(gs: any, r: any): string {
    const grid: string[][] = Array.isArray(gs?.grid) ? gs.grid : Array.isArray(gs?.reels) ? gs.reels : [];
    const rows = grid.length ? grid : [['CHERRY', 'SEVEN', 'BELL', 'LEMON', 'WILD'], ['BAR', 'PLUM', 'SEVEN', 'CHERRY', 'BELL'], ['LEMON', 'BONUS', 'ORANGE', 'SEVEN', 'PLUM']];
    const cols = rows[0]?.length || 5;
    const reels = Array.from({ length: cols }, (_, c) => rows.map((row) => row[c]));
    return `
      <div class="slot-machine ${grid.length ? '' : 'is-idle'}" data-round="${r?.roundKey || 0}">
        <div class="slot-window" style="--cols:${cols}">
          ${reels.map((reel, c) => `<div class="reel">${reel.map((sym, rI) => this.slotSymbol(sym, c * reel.length + rI)).join('')}</div>`).join('')}
          <span class="payline" aria-hidden="true"></span>
        </div>
        ${gs && typeof gs.totalWinMultiplier === 'number' ? `<div class="slot-meta"><span>Lines won <b class="mono">${(gs.winningLines || []).length}</b></span><span>Multiplier <b class="mono">×${gs.totalWinMultiplier}</b></span></div>` : ''}
      </div>`;
  }

  // ---- Cards --------------------------------------------------------------
  private static playingCard(c: any, i: number, hidden: boolean = false): string {
    if (hidden) return `<span class="pcard pcard-back" style="--d:${i * 90}ms"></span>`;
    const suit = String(c?.suit ?? '');
    const red = suit === '♥' || suit === '♦' || /heart|diamond/i.test(suit);
    const glyph = /heart/i.test(suit) ? '♥' : /diamond/i.test(suit) ? '♦' : /club/i.test(suit) ? '♣' : /spade/i.test(suit) ? '♠' : suit;
    return `<span class="pcard ${red ? 'pcard-red' : ''}" style="--d:${i * 90}ms"><b>${esc(c?.value ?? c?.rank ?? '?')}</b><i>${esc(glyph)}</i><em>${esc(glyph)}</em></span>`;
  }

  private static cardsStage(gs: any): string {
    if (!gs) {
      return `
        <div class="table-felt">
          <div class="hand"><span class="hand-label">Dealer</span><div class="hand-cards">${this.playingCard(null, 0, true)}${this.playingCard(null, 1, true)}</div></div>
          <div class="hand"><span class="hand-label">You</span><div class="hand-cards">${this.playingCard(null, 2, true)}${this.playingCard(null, 3, true)}</div></div>
        </div>`;
    }
    const hands = Object.keys(gs).filter((k) => /Hand$/.test(k) && Array.isArray(gs[k]));
    let dealt = 0;
    return `
      <div class="table-felt">
        ${hands.map((k) => {
          const who = k.replace(/Hand$/, '');
          const label = who.charAt(0).toUpperCase() + who.slice(1);
          const score = gs[`${who}Score`];
          const cards: any[] = gs[k];
          const holeHidden = who === 'dealer' && gs.dealerHoleCardHidden;
          return `
            <div class="hand">
              <span class="hand-label">${esc(label)}${typeof score === 'number' ? `<b class="hand-score mono">${score}</b>` : ''}</span>
              <div class="hand-cards">
                ${cards.map((c) => this.playingCard(c, dealt++)).join('')}
                ${holeHidden ? this.playingCard(null, dealt++, true) : ''}
              </div>
            </div>`;
        }).join('')}
        ${gs.isCompleted === false || gs.canHit ? `<p class="felt-note">${icon('info')}Opening deal shown — this client deals one hand per round.</p>` : ''}
      </div>`;
  }

  private static highLowStage(gs: any): string {
    const base = gs?.baseCard;
    const next = gs?.nextCard;
    return `
      <div class="table-felt highlow">
        <div class="hand"><span class="hand-label">Base card</span><div class="hand-cards">${base ? this.playingCard(base, 0) : this.playingCard(null, 0, true)}</div></div>
        <span class="hl-arrow ${gs?.choice === 'LOWER' ? 'is-down' : ''}">${icon(gs?.choice === 'LOWER' ? 'caret-down' : 'caret-up')}<small>${esc(gs?.choice || 'Higher or lower?')}</small></span>
        <div class="hand"><span class="hand-label">Next card</span><div class="hand-cards">${next ? this.playingCard(next, 1) : this.playingCard(null, 1, true)}</div></div>
      </div>`;
  }

  // ---- Keno / Bingo / Scratch --------------------------------------------
  private static kenoStage(gs: any, r: any): string {
    const picked = new Set<number>(gs?.pickedNumbers || KENO_DEFAULT_PICKS);
    const drawn: number[] = gs?.drawnNumbers || [];
    const drawnSet = new Set(drawn);
    return `
      <div class="keno" data-round="${r?.roundKey || 0}">
        <div class="keno-board">
          ${Array.from({ length: 80 }, (_, i) => {
            const n = i + 1;
            const cls = picked.has(n) && drawnSet.has(n) ? 'is-hit' : drawnSet.has(n) ? 'is-drawn' : picked.has(n) ? 'is-picked' : '';
            const order = drawn.indexOf(n);
            return `<span class="kn ${cls} mono" style="--d:${Math.max(order, 0) * 45}ms">${n}</span>`;
          }).join('')}
        </div>
        <div class="keno-legend">
          <span><i class="lg lg-picked"></i>Your numbers</span>
          <span><i class="lg lg-drawn"></i>Drawn</span>
          <span><i class="lg lg-hit"></i>Hit</span>
          ${gs ? `<span class="keno-hits">Matched <b class="mono">${gs.matchedCount ?? 0}/${picked.size}</b></span>` : ''}
        </div>
      </div>`;
  }

  private static bingoStage(gs: any, r: any): string {
    const card: number[][] = Array.isArray(gs?.card) ? gs.card : [];
    const drawn = new Set<number>(gs?.drawnBalls || []);
    const letters = ['B', 'I', 'N', 'G', 'O'];
    const cell = (col: number, row: number) => {
      if (!card.length) return `<span class="bc bc-empty"></span>`;
      const n = card[col]?.[row];
      if (n === 0) return `<span class="bc is-free">${icon('star')}</span>`;
      return `<span class="bc ${drawn.has(n) ? 'is-marked' : ''} mono" style="--d:${(col * 5 + row) * 40}ms">${n}</span>`;
    };
    return `
      <div class="bingo" data-round="${r?.roundKey || 0}">
        <div class="bingo-card">
          ${letters.map((l) => `<span class="bh">${l}</span>`).join('')}
          ${Array.from({ length: 5 }, (_, row) => letters.map((_l, col) => cell(col, row)).join('')).join('')}
        </div>
        <div class="bingo-side">
          <span class="dock-label">Balls drawn <b class="mono">${drawn.size || 0}</b></span>
          <div class="ball-tray">
            ${(gs?.drawnBalls || []).slice(-12).map((b: number) => `<span class="ball ball-${letters[Math.min(4, Math.floor((b - 1) / 15))]} mono">${b}</span>`).join('') || '<span class="muted">Balls appear here after the draw</span>'}
          </div>
          ${gs ? `<span class="stat-chip">Lines <b class="mono">${gs.completedLines ?? 0}</b></span><span class="stat-chip">Multiplier <b class="mono">×${gs.multiplier ?? 0}</b></span>` : ''}
        </div>
      </div>`;
  }

  private static scratchStage(gs: any, r: any): string {
    const grid: number[][] = Array.isArray(gs?.grid) ? gs.grid : [];
    const counts = new Map<number, number>();
    grid.flat().forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
    return `
      <div class="scratch" data-round="${r?.roundKey || 0}">
        <div class="scratch-card">
          ${grid.length
            ? grid.flat().map((v, i) => `<span class="sc is-revealed ${(counts.get(v) || 0) >= 3 ? 'is-match' : ''}" style="--d:${i * 80}ms"><b class="mono">${v}</b></span>`).join('')
            : Array.from({ length: 9 }, () => `<span class="sc">${icon('sparkle')}</span>`).join('')}
        </div>
        <p class="stage-hint">Match three values to win that prize multiple.</p>
      </div>`;
  }

  // ==========================================================================
  // Virtual racing
  // ==========================================================================
  private static renderVirtualRace(appState: AppStateManager): string {
    const races = appState.virtualRaces || [];
    if (races.length === 0) {
      return `<div class="empty-state"><span class="empty-ico">${icon('flag')}</span><h3>Loading the next race…</h3><p>Race cards are fetched from the virtual sports engine.</p></div>`;
    }
    const wantHorse = appState.activeGameSlug === 'horse';
    const race = races.find((x: any) => (wantHorse ? /HORSE/i : /GREYHOUND|DOG/i).test(String(x.type || ''))) || races[0];
    const stake = appState.gameStake;
    const r = appState.lastGameResult;
    const result = r && !r.error && r.kind === 'race' ? r.raw : null;
    // The track replays the race that just ran while the runner list already offers the next card.
    const ran = result && race.previous && race.previous.id === result.raceId ? race.previous : race;
    const finish: number[] = Array.isArray(result?.finishOrder) ? result.finishOrder : [];
    const runners: any[] = race.runners || [];
    const maxRating = Math.max(...runners.map((x) => Number(x.rating) || 0), 1);
    const byNumber = new Map((ran.runners || runners).map((x: any) => [x.number, x]));
    const when = race.scheduledTime ? new Date(race.scheduledTime) : null;

    const lanes = (ran.runners || runners).map((x: any) => {
      const place = finish.indexOf(x.number);
      const to = place < 0 ? 0 : 92 - place * (60 / Math.max(runners.length - 1, 1));
      return `
        <div class="lane-row">
          <span class="silk silk-${x.trapNumber || x.number} mono">${x.number}</span>
          <div class="lane-track">
            <span class="runner ${wantHorse ? 'runner-horse' : ''} ${finish.length ? 'is-racing' : ''} ${r?.runnerNumber === x.number ? 'is-mine' : ''}" style="--to:${to}%; --dur:${2.2 + Math.max(place, 0) * 0.18}s">${icon(wantHorse ? 'horse' : 'greyhound')}</span>
          </div>
          ${place >= 0 ? `<b class="lane-pos mono">${place + 1}</b>` : ''}
        </div>`;
    }).join('');

    const podium = finish.length ? `
      <div class="podium">
        ${finish.slice(0, 3).map((num, i) => {
          const x: any = byNumber.get(num) || { number: num, name: `Runner ${num}` };
          return `<div class="podium-step step-${i + 1}"><span class="silk silk-${x.trapNumber || x.number} mono">${num}</span><strong>${esc(x.name)}</strong><small>${['Winner', '2nd', '3rd'][i]}</small></div>`;
        }).join('')}
      </div>` : '';

    return `
      <div class="race">
        <div class="race-card-h">
          <div>
            <span class="eyebrow">${icon('flag')}${esc(ran.trackName || 'Virtual track')} · Race <span class="mono">#${esc(ran.raceNumber ?? '')}</span>${ran !== race ? ' · result' : ''}</span>
            <h2>${esc(ran.name)}</h2>
          </div>
          <div class="race-facts">
            <span class="stat-chip">${icon('user')}<b class="mono">${runners.length}</b> runners</span>
            ${when ? `<span class="stat-chip">${icon('clock')}<b class="mono">${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b></span>` : ''}
          </div>
        </div>

        <div class="race-track ${finish.length ? 'has-result' : ''}" data-round="${r?.roundKey || 0}">
          ${lanes}
          <span class="finish-line" aria-hidden="true"></span>
        </div>

        ${this.renderResult(appState)}
        ${podium}

        <div class="race-toolbar">
          <span class="dock-label">Stake per bet</span>
          <div class="stepper stepper-sm">
            <button type="button" class="step-btn" onclick="window.appState.setGameStake(${stake - 5}); window.renderApp();" aria-label="Decrease stake">${icon('minus')}</button>
            <input id="race-stake" class="mono" value="${stake}" inputmode="numeric" aria-label="Stake" onchange="window.appState.setGameStake(Number(this.value)); window.renderApp();" />
            <button type="button" class="step-btn" onclick="window.appState.setGameStake(${stake + 5}); window.renderApp();" aria-label="Increase stake">${icon('plus')}</button>
          </div>
          <span class="muted hide-sm">Pick a runner to WIN — the race runs instantly and settles your points.</span>
        </div>

        ${ran !== race ? `<p class="race-next">${icon('flag')}Next race · <b>${esc(race.name)}</b> · ${esc(race.trackName || '')} <span class="mono">#${esc(race.raceNumber ?? '')}</span></p>` : ''}
        <div class="runner-list">
          ${runners.map((x) => `
            <div class="runner-row ${r?.runnerNumber === x.number && result && ran === race ? 'is-mine' : ''}">
              <span class="silk silk-${x.trapNumber || x.number} mono">${x.number}</span>
              <div class="runner-info">
                <strong>${esc(x.name)}${x.form ? ` <small class="mono muted">form ${esc(x.form)}</small>` : ''}</strong>
                <span class="rating"><span class="rating-bar"><span style="width:${Math.round((Number(x.rating) / maxRating) * 100)}%"></span></span><small class="mono">${esc(x.rating)}</small></span>
              </div>
              ${x.placeOdds ? `<span class="runner-place hide-sm">Place <b class="mono">${Number(x.placeOdds).toFixed(2)}</b></span>` : ''}
              <button type="button" class="odd-btn odd-win" ${appState.gameBusy ? 'disabled' : ''} onclick="window.appState.playVirtualRace('${jsq(race.id)}', ${Number(x.number)}, 'WIN')">
                <span class="odd-name">Win</span><span class="odd-value mono">${Number(x.winOdds).toFixed(2)}</span>
              </button>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ==========================================================================
  // Shared result banner
  // ==========================================================================
  private static renderResult(appState: AppStateManager): string {
    const r = appState.lastGameResult;
    if (!r) {
      return `<div class="result result-idle">${icon('info')}<span>Set a stake and play — results and points update live.</span></div>`;
    }
    if (r.error) {
      return `<div class="result result-error">${icon('alert')}<span>${esc(r.error)}</span></div>`;
    }
    const detail = this.summariseResult(r);
    const roundId = r.raw?.roundId || r.raw?.ticket?.raceId;
    return `
      <div class="result ${r.won ? 'result-win' : 'result-loss'}" data-round="${r.roundKey || 0}">
        <span class="result-ico">${icon(r.won ? 'trophy' : 'minus')}</span>
        <div class="result-main">
          <strong class="mono">${r.won ? `+${fmtPts(Number(r.payout))} pts` : `−${fmtPts(Number(r.stake))} pts`}</strong>
          <span>${r.won ? 'You win' : 'No win this round'}${detail ? ` · ${detail}` : ''}</span>
        </div>
        ${roundId ? `<span class="result-round mono" title="Round / race identifier for verification">${icon('fingerprint')}${esc(String(roundId).slice(0, 8))}</span>` : ''}
      </div>`;
  }

  /** Pull a friendly line out of whatever the engine returned. */
  private static summariseResult(r: any): string {
    const raw = r.raw || {};
    const gs = raw.gameState || {};
    if (r.kind === 'roulette') {
      const n = gs.winningNumber ?? raw.winningNumber ?? raw.number;
      const c = gs.winningColor ?? raw.winningColor ?? raw.color;
      if (n !== undefined) return `ball on <strong>${esc(n)}${c ? ' ' + esc(c) : ''}</strong>`;
    }
    if (r.kind === 'slots') {
      const lines = (gs.winningLines || []).length;
      return `<strong>${lines}</strong> winning line${lines === 1 ? '' : 's'}`;
    }
    if (r.kind === 'race') {
      if (raw.winner) return `winner <strong>#${esc(raw.winner.number)} ${esc(raw.winner.name)}</strong>`;
    }
    if (r.kind === 'highlow') {
      if (gs.message) return esc(gs.message);
    }
    if (r.kind === 'cards') {
      const outcome = gs.winner || gs.outcome || raw.outcome || raw.result;
      if (outcome) return `outcome <strong>${esc(outcome)}</strong>`;
    }
    if (r.kind === 'numbers' && typeof gs.matchedCount === 'number') return `<strong>${gs.matchedCount}</strong> numbers matched`;
    if (raw.message) return esc(raw.message);
    return '';
  }
}
