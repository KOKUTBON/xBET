/**
 * Casino Lobby Component
 *
 * Lists the platform's own casino, table, instant, and virtual-sports games.
 * Every title runs on this project's own provably-fair engines (see
 * services/casino-engine) — nothing here is a third-party integration.
 */

import { AppStateManager } from '../state/app-state.ts';
import { icon, esc, jsq } from '../ui/icons.ts';

export interface GameItem {
  id: string;
  title: string;
  category: 'ALL' | 'TABLE' | 'VIRTUAL' | 'SLOTS' | 'INSTANT' | 'LIVE';
  icon: string;
  provider: string;
  art?: string;
}

const CATEGORY_META: Record<string, { label: string; ico: string; tone: string }> = {
  ALL: { label: 'All games', ico: 'grid', tone: 'gold' },
  VIRTUAL: { label: 'Virtual sports', ico: 'virtual', tone: 'cyan' },
  TABLE: { label: 'Table', ico: 'cards', tone: 'violet' },
  SLOTS: { label: 'Slots', ico: 'slots', tone: 'gold' },
  INSTANT: { label: 'Instant & Keno', ico: 'bolt', tone: 'volt' },
};

export class CasinoLobbyComponent {
  public static catalog: GameItem[] = [
    { id: 'dogs', title: 'Virtual Greyhound Racing', category: 'VIRTUAL', icon: 'greyhound', provider: 'Virtual Sports', art: 'track' },
    { id: 'horse', title: 'Virtual Horse Racing', category: 'VIRTUAL', icon: 'horse', provider: 'Virtual Sports', art: 'track' },
    { id: 'roulette', title: 'European Roulette', category: 'TABLE', icon: 'roulette', provider: 'Table Games', art: 'felt' },
    { id: 'blackjack', title: 'Classic Blackjack', category: 'TABLE', icon: 'blackjack', provider: 'Table Games', art: 'felt' },
    { id: 'baccarat', title: 'Baccarat Professional', category: 'TABLE', icon: 'baccarat', provider: 'Table Games', art: 'felt' },
    { id: 'highlow', title: 'High Low Gambler', category: 'TABLE', icon: 'highlow', provider: 'Table Games', art: 'felt' },
    { id: 'stud', title: 'Caribbean Stud Poker', category: 'TABLE', icon: 'stud', provider: 'Table Games', art: 'felt' },
    { id: 'bingo', title: 'Classic Bingo 75', category: 'INSTANT', icon: 'bingo', provider: 'Instant Games', art: 'balls' },
    { id: 'keno', title: 'Lucky 80 Keno', category: 'INSTANT', icon: 'keno', provider: 'Instant Games', art: 'balls' },
    { id: 'scratch', title: 'Fruit Scratch Cards', category: 'INSTANT', icon: 'scratch', provider: 'Instant Games', art: 'foil' },
    { id: 'slot-fruits', title: 'Fruit Slot Deluxe', category: 'SLOTS', icon: 'cherry', provider: 'Slots', art: 'reels' },
    { id: 'slot-chicken', title: 'Chicken Slot Mania', category: 'SLOTS', icon: 'chicken', provider: 'Slots', art: 'reels' },
    { id: 'slot-christmas', title: 'Christmas Slot Fest', category: 'SLOTS', icon: 'tree', provider: 'Slots', art: 'reels' },
    { id: 'ancient-treasure', title: 'Ancient Treasure Deluxe', category: 'SLOTS', icon: 'amphora', provider: 'Slots', art: 'reels' },
    { id: 'slot-space', title: 'Space Adventure Slot', category: 'SLOTS', icon: 'rocket', provider: 'Slots', art: 'reels' },
    { id: 'soccer-hero', title: 'Soccer Hero Slot', category: 'SLOTS', icon: 'soccer', provider: 'Slots', art: 'reels' },
    { id: 'gates-of-olympus', title: 'Gates of Olympus', category: 'SLOTS', icon: 'sparkle', provider: 'Pragmatic Play', art: 'reels' },
    { id: 'sweet-bonanza', title: 'Sweet Bonanza', category: 'SLOTS', icon: 'cherry', provider: 'Pragmatic Play', art: 'reels' },
    { id: 'lightning-roulette', title: 'Lightning Roulette Live', category: 'TABLE', icon: 'roulette', provider: 'Evolution', art: 'felt' },
    { id: 'wanted-dead-or-wild', title: 'Wanted Dead or a Wild', category: 'SLOTS', icon: 'star', provider: 'Hacksaw Gaming', art: 'reels' },
    { id: 'aviator-pro', title: 'Aviator Multi-Player', category: 'INSTANT', icon: 'rocket', provider: 'Spribe', art: 'reels' },
  ];

  public static selectedCategory: string = 'ALL';

  public static setCategory(cat: string): void {
    this.selectedCategory = cat;
  }

  public static setCatalog(games: GameItem[]): void {
    this.catalog = games;
  }

  /** Stable per-title hue shift so every tile has its own colourway within its category. */
  private static tileHue(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) % 360;
    return h;
  }

  private static tile(g: GameItem, demo = false): string {
    const meta = CATEGORY_META[g.category] || CATEGORY_META.ALL;
    const target = g.category === 'VIRTUAL' ? 'virtual' : 'casino';
    return `
      <div class="game-tile casino-card tone-${meta.tone} art-${g.art || 'reels'}" style="--tile-h:${this.tileHue(g.id)}" role="button" tabindex="0"
        onclick="window.appState.launchGame('${jsq(g.id)}', '${jsq(g.title)}', '${target}')"
        onkeydown="if (event.key === 'Enter') this.click()">
        <div class="tile-art">
          <span class="tile-pattern" aria-hidden="true"></span>
          <span class="tile-icon">${icon(g.icon || meta.ico)}</span>
          <span class="tile-chip">${icon(meta.ico)}${meta.label}</span>
          <span class="tile-fair" title="${demo ? 'Simulated demo' : 'Provably fair'}">${icon('shield-check')}</span>
          <span class="tile-play" aria-hidden="true">${icon('play')}</span>
        </div>
        <div class="tile-body">
          <strong class="tile-title">${esc(g.title)}</strong>
          <span class="tile-meta"><span>${esc(g.provider)}</span><span class="tile-cta">Play ${icon('arrow-right')}</span></span>
        </div>
      </div>`;
  }

  public static render(appState: AppStateManager): string {
    const isVirtual = appState.activeTab === 'virtual';
    let filtered = this.catalog;
    if (isVirtual) {
      filtered = this.catalog.filter((g) => g.category === 'VIRTUAL');
    } else if (this.selectedCategory !== 'ALL') {
      filtered = this.catalog.filter((g) => g.category === this.selectedCategory);
    }

    const categories = ['ALL', 'VIRTUAL', 'TABLE', 'SLOTS', 'INSTANT'];
    const count = (id: string) => (id === 'ALL' ? this.catalog.length : this.catalog.filter((g) => g.category === id).length);

    const hero = isVirtual ? `
      <section class="hero hero-cyan">
        <div class="hero-copy">
          <span class="eyebrow">${icon('virtual')}Virtual sports</span>
          <h1>Races that never stop</h1>
          <p>Simulated greyhound and horse racing with live form, trap draws and instant, server-side settlement.</p>
          <div class="hero-stats">
            <span><b class="mono">6–8</b>runners per race</span>
            <span><b class="mono">WIN</b>market</span>
            <span><b class="mono">RNG</b>audited engine</span>
          </div>
        </div>
        <div class="hero-art hero-art-track" aria-hidden="true">
          ${[1, 2, 3, 4, 5, 6].map((n) => `<span class="lane"><i class="silk silk-${n}">${n}</i></span>`).join('')}
        </div>
      </section>` : `
      <section class="hero hero-gold">
        <div class="hero-copy">
          <span class="eyebrow">${icon('casino')}xBET Originals</span>
          <h1>${appState.demoMode ? 'Try a spin.<br/>Play with points.' : 'Original games.<br/>Provably fair.'}</h1>
          <p>${appState.demoMode ? 'Roulette, blackjack, baccarat, slots, keno, bingo and virtual racing — every round is simulated in your browser at a realistic ~95% return, and your demo wallet updates instantly.' : "Every round is generated by the platform's own RGS engine and can be verified with HMAC-SHA256 — points settle instantly through the ledger."}</p>
          <div class="hero-stats">
            <span><b class="mono">${this.catalog.length}</b>titles</span>
            <span><b class="mono">${appState.demoMode ? 'LOCAL' : 'HMAC'}</b>${appState.demoMode ? 'simulated rounds' : 'verifiable rounds'}</span>
            <span><b class="mono">0</b>real money</span>
          </div>
        </div>
        <div class="hero-art hero-art-cards" aria-hidden="true">
          <span class="pcard pcard-a"><b>A</b><i>♠</i></span>
          <span class="pcard pcard-b"><b>K</b><i>♥</i></span>
          <span class="chip-stack">${icon('casino')}</span>
        </div>
      </section>`;

    const tabs = !isVirtual ? `
      <div class="seg-group seg-scroll lobby-tabs" role="tablist">
        ${categories.map((id) => {
          const meta = CATEGORY_META[id];
          return `<button type="button" role="tab" aria-selected="${this.selectedCategory === id}" class="seg ${this.selectedCategory === id ? 'is-active' : ''}"
            onclick="CasinoLobbyComponent.setCategory('${id}'); window.renderApp();">${icon(meta.ico)}${meta.label}<b class="mono">${count(id)}</b></button>`;
        }).join('')}
      </div>` : '';

    if (filtered.length === 0) {
      return `
        ${hero}
        ${tabs}
        <div class="empty-state">
          <span class="empty-ico">${icon('casino')}</span>
          <h3>No games in this category</h3>
          <p>Pick another category to keep playing.</p>
        </div>`;
    }

    return `
      ${hero}
      <header class="view-head view-head-compact">
        <div class="view-title">
          <span class="view-ico ${isVirtual ? 'tone-cyan' : 'tone-gold'}">${icon(isVirtual ? 'flag' : 'sparkle')}</span>
          <div><h1>${isVirtual ? 'Race cards' : 'Game lobby'}</h1><p>${filtered.length} title${filtered.length === 1 ? '' : 's'} · ${appState.demoMode ? 'browser simulation' : 'original provably-fair games'}</p></div>
        </div>
      </header>
      ${tabs}
      <div class="game-grid casino-grid">
        ${filtered.map((g) => this.tile(g, appState.demoMode)).join('')}
      </div>`;
  }
}
