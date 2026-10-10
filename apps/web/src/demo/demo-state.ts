import { AppStateManager, type PlacedTicket } from '../state/app-state.ts';
import { DemoSports, DEMO_LEAGUES, demoParseSelection, type DemoRng } from './demo-sports.ts';
import { DemoCasino } from './demo-casino.ts';

/**
 * Browser-only demo state for the static GitHub Pages build.
 *
 * Runs a self-contained sportsbook: fixtures kick off, play out unit by unit,
 * reprice after every event and settle open tickets when they finish. A local
 * points wallet records every movement. Never imports service code or contacts a backend.
 */

export const DEMO_START_BALANCE = 5000;
export const DEMO_TICK_MS = 2500;
/** Finished events stay on the board briefly (showing FT) before a new fixture replaces them. */
const DEMO_FINISHED_LINGER_MS = 30000;
const DEMO_STORAGE_VERSION = 2;

/** How many events of each sport the board keeps: [live, upcoming]. */
const DEMO_BOARD_TARGETS: Array<[number, number, number]> = [
  [1, 8, 8], [2, 3, 2], [3, 3, 2], [4, 2, 2], [7, 2, 1], [8, 1, 2], [9, 1, 1],
];

export const DEMO_GAME_CATALOG = [
  { id: 'roulette', title: 'European Roulette', category: 'TABLE', icon: 'roulette', provider: 'xBET Demo · Table', art: 'felt' },
  { id: 'blackjack', title: 'Classic Blackjack', category: 'TABLE', icon: 'blackjack', provider: 'xBET Demo · Table', art: 'felt' },
  { id: 'baccarat', title: 'Baccarat Professional', category: 'TABLE', icon: 'baccarat', provider: 'xBET Demo · Table', art: 'felt' },
  { id: 'highlow', title: 'High Low Gambler', category: 'TABLE', icon: 'highlow', provider: 'xBET Demo · Table', art: 'felt' },
  { id: 'slot-fruits', title: 'Fruit Slot Deluxe', category: 'SLOTS', icon: 'cherry', provider: 'xBET Demo · Slots', art: 'reels' },
  { id: 'ancient-treasure', title: 'Ancient Treasure Deluxe', category: 'SLOTS', icon: 'amphora', provider: 'xBET Demo · Slots', art: 'reels' },
  { id: 'slot-space', title: 'Space Adventure Slot', category: 'SLOTS', icon: 'rocket', provider: 'xBET Demo · Slots', art: 'reels' },
  { id: 'keno', title: 'Lucky 80 Keno', category: 'INSTANT', icon: 'keno', provider: 'xBET Demo · Instant', art: 'balls' },
  { id: 'bingo', title: 'Classic Bingo 75', category: 'INSTANT', icon: 'bingo', provider: 'xBET Demo · Instant', art: 'balls' },
  { id: 'scratch', title: 'Fruit Scratch Cards', category: 'INSTANT', icon: 'scratch', provider: 'xBET Demo · Instant', art: 'foil' },
  { id: 'dogs', title: 'Virtual Greyhound Racing', category: 'VIRTUAL', icon: 'greyhound', provider: 'xBET Demo · Virtuals', art: 'track' },
  { id: 'horse', title: 'Virtual Horse Racing', category: 'VIRTUAL', icon: 'horse', provider: 'xBET Demo · Virtuals', art: 'track' },
];

export interface DemoTransaction {
  id: string;
  label: string;
  amount: number;
  at: string;
  kind: 'bet' | 'win' | 'refund' | 'cashout' | 'casino' | 'casino-win' | 'deposit' | 'reset';
  balance: number;
}

export interface DemoOptions { rng?: DemoRng; now?: () => number; storage?: boolean }

export class DemoStateManager extends AppStateManager {
  public override demoMode = true;
  public demoPaused = false;
  public demoSpeed = 1;
  public betsTab: 'OPEN' | 'SETTLED' = 'OPEN';
  public welcomeDismissed = false;
  public demoTransactions: DemoTransaction[] = [];
  public demoStats = { casinoRounds: 0, casinoStaked: 0, casinoReturned: 0, biggestWin: 0, deposits: 0 };
  private readonly rng: DemoRng;
  private readonly clock: () => number;
  private readonly useStorage: boolean;
  private readonly storageKey = `xbet-static-demo-v${DEMO_STORAGE_VERSION}:${typeof location === 'undefined' ? '/' : location.pathname}`;
  private seq = 0;
  private tickNo = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: DemoOptions = {}) {
    super();
    this.rng = options.rng || Math.random;
    this.clock = options.now || Date.now;
    this.useStorage = options.storage !== false;
    this.username = 'Demo player';
    this.userId = 'demo-player';
    this.isAuthenticated = true;
    this.userBalance = DEMO_START_BALANCE;
    this.feedConnected = true;
    const restored = this.load();
    if (restored) this.catchUp();
    else this.seedBoard();
    this.fillBoard();
    this.sortBoard();
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private load(): boolean {
    if (!this.useStorage) return false;
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) || 'null');
      if (!saved || saved.v !== DEMO_STORAGE_VERSION || !Number.isFinite(saved.balance) || saved.balance < 0 || !Array.isArray(saved.tickets)) return false;
      this.userBalance = saved.balance;
      this.myTickets = saved.tickets;
      this.demoTransactions = Array.isArray(saved.transactions) ? saved.transactions : [];
      this.demoStats = { ...this.demoStats, ...(saved.stats || {}) };
      this.turnover = Number(saved.turnover) || 0;
      this.seq = Number(saved.seq) || 0;
      this.welcomeDismissed = Boolean(saved.welcomeDismissed);
      this.liveFixtures = new Map();
      for (const fixture of Array.isArray(saved.fixtures) ? saved.fixtures : []) {
        if (fixture?.id && fixture.sim?.state && Array.isArray(fixture.markets)) this.liveFixtures.set(fixture.id, fixture);
      }
      (this as any).savedAt = Number(saved.savedAt) || this.clock();
      return true;
    } catch { return false; /* Storage is optional; the demo still works in memory. */ }
  }

  private save(): void {
    if (!this.useStorage) return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        v: DEMO_STORAGE_VERSION, savedAt: this.clock(), balance: this.userBalance, tickets: this.myTickets.slice(0, 200),
        transactions: this.demoTransactions, stats: this.demoStats, turnover: this.turnover, seq: this.seq,
        welcomeDismissed: this.welcomeDismissed, fixtures: [...this.liveFixtures.values()],
      }));
    } catch { /* Private browsing or full storage: keep this session usable. */ }
  }

  /** Replay the time the page was closed so open tickets settle and the board moves on. */
  private catchUp(): void {
    const now = this.clock();
    const savedAt = Number((this as any).savedAt) || now;
    for (const fixture of this.liveFixtures.values()) {
      if (fixture.status === 'FINISHED') continue;
      const from = Math.max(savedAt, Number(fixture.startTime) || savedAt);
      if (now < from) continue;
      if (fixture.status === 'PRE') DemoSports.kickOff(fixture);
      const steps = Math.min(400, Math.round(((now - from) / DEMO_TICK_MS) * DemoSports.model(fixture.sportId).advance));
      for (let i = 0; i < steps && fixture.status === 'LIVE'; i++) DemoSports.advance(fixture, this.rng);
      fixture.isSuspended = fixture.status === 'FINISHED';
      if (fixture.status === 'FINISHED') { fixture.finishedAt = now; this.settleFixture(fixture); }
      else DemoSports.reprice(fixture, this.rng, 300);
    }
    this.resolveOrphanLegs();
  }

  // ==========================================================================
  // Board management
  // ==========================================================================

  private nextId(prefix: string): string {
    this.seq++;
    return `${prefix}${this.seq.toString(36)}${Math.floor(this.rng() * 1296).toString(36).padStart(2, '0')}`.toUpperCase();
  }

  private busyNames(): Set<string> {
    const names = new Set<string>();
    for (const f of this.liveFixtures.values()) { names.add(f.homeTeam); names.add(f.awayTeam); }
    return names;
  }

  /** Create a fixture for `sportId` between two teams that are not already on the board. */
  private spawn(sportId: number, startTime: number, progress = 0): any | null {
    const busy = this.busyNames();
    const leagues = DEMO_LEAGUES.filter((l) => l.sportId === sportId);
    const order = leagues.slice().sort(() => this.rng() - 0.5);
    for (const league of order) {
      const free = league.teams.filter((t) => !busy.has(t[0]));
      if (free.length < 2) continue;
      const home = free.splice(Math.floor(this.rng() * free.length) % free.length, 1)[0];
      const away = free[Math.floor(this.rng() * free.length) % free.length];
      const fixture = DemoSports.createFixture({ id: this.nextId('FX'), league, home, away, startTime, rng: this.rng, samples: 500 });
      if (progress > 0) {
        DemoSports.kickOff(fixture);
        const units = Math.floor(DemoSports.model(sportId).units * progress);
        for (let i = 0; i < units && fixture.status === 'LIVE'; i++) DemoSports.advance(fixture, this.rng);
        if (fixture.status !== 'LIVE') return null;
        DemoSports.reprice(fixture, this.rng, 400);
      }
      this.liveFixtures.set(fixture.id, fixture);
      return fixture;
    }
    return null;
  }

  /**
   * Time between kick-offs that keeps `live` events of a sport running at once:
   * the simulated match length divided by the number of concurrent live events.
   */
  private kickoffGap(sportId: number, live: number): number {
    const model = DemoSports.model(sportId);
    return ((model.units / model.advance) * DEMO_TICK_MS) / Math.max(1, live);
  }

  private seedBoard(): void {
    const now = this.clock();
    this.liveFixtures = new Map();
    for (const [sportId, live, pre] of DEMO_BOARD_TARGETS) {
      const gap = this.kickoffGap(sportId, live);
      for (let i = 0; i < live; i++) this.spawn(sportId, now - 60000, 0.08 + (0.8 * (i + this.rng())) / live);
      for (let i = 0; i < pre; i++) this.spawn(sportId, now + gap * (i + 0.5 + this.rng() * 0.5));
    }
  }

  /** Keep each sport at its target size by scheduling new upcoming fixtures. */
  private fillBoard(): void {
    const now = this.clock();
    for (const [sportId, live, pre] of DEMO_BOARD_TARGETS) {
      const active = [...this.liveFixtures.values()].filter((f) => f.sportId === sportId && f.status !== 'FINISHED');
      let latest = Math.max(now, ...active.filter((f) => f.status === 'PRE').map((f) => Number(f.startTime) || now));
      const gap = this.kickoffGap(sportId, live);
      for (let i = active.length; i < live + pre; i++) {
        latest += gap * (0.75 + this.rng() * 0.5);
        this.spawn(sportId, latest);
      }
    }
  }

  private sortBoard(): void {
    const leagueRank = new Map(DEMO_LEAGUES.map((l, i) => [l.name, i]));
    const statusRank: Record<string, number> = { LIVE: 0, FINISHED: 1, PRE: 2 };
    const list = [...this.liveFixtures.values()].sort((a, b) =>
      (leagueRank.get(a.tournamentName) ?? 99) - (leagueRank.get(b.tournamentName) ?? 99)
      || (statusRank[a.status] ?? 3) - (statusRank[b.status] ?? 3)
      || (Number(a.startTime) || 0) - (Number(b.startTime) || 0));
    this.liveFixtures = new Map(list.map((f) => [f.id, f]));
    for (const f of list) if (f.status === 'PRE') f.matchClock = this.kickoffLabel(f.startTime);
  }

  private kickoffLabel(startTime: number): string {
    const mins = Math.max(0, Math.ceil((startTime - this.clock()) / 60000));
    if (mins <= 1) return 'Starting';
    if (mins < 60) return `in ${mins}m`;
    const d = new Date(startTime);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /** Overrides the legacy hard-coded fixtures: the demo builds its own board. */
  public override hydrateDefaultMatches(): void {}

  // ==========================================================================
  // Simulation loop
  // ==========================================================================

  public startDemo(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.tick(), DEMO_TICK_MS / this.demoSpeed);
  }

  public stopDemo(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One simulation step for the whole board. Exposed for tests. */
  public tick(): void {
    if (this.demoPaused) return;
    this.tickNo++;
    const now = this.clock();
    let settled = false;
    for (const fixture of [...this.liveFixtures.values()]) {
      if (fixture.status === 'FINISHED') {
        if (now - (Number(fixture.finishedAt) || now) >= DEMO_FINISHED_LINGER_MS && !this.hasOpenLegs(fixture.id)) this.liveFixtures.delete(fixture.id);
        continue;
      }
      if (fixture.status === 'PRE') {
        if (now >= fixture.startTime) DemoSports.kickOff(fixture);
        else if (this.rng() < 0.12) DemoSports.reprice(fixture, this.rng, 250, 0.7);
        continue;
      }
      if (fixture.isSuspended && (fixture.suspendedUntil ?? 0) <= this.tickNo) { fixture.isSuspended = false; fixture.suspensionReason = undefined; }
      if (fixture.isSuspended || this.rng() >= DemoSports.model(fixture.sportId).advance) continue;
      const result = DemoSports.advance(fixture, this.rng);
      if (result.finished) {
        fixture.finishedAt = now;
        DemoSports.reprice(fixture, this.rng, 1);
        settled = this.settleFixture(fixture) || settled;
        continue;
      }
      const bigEvent = result.scored && [1, 4, 7, 8].includes(fixture.sportId);
      if (bigEvent) {
        fixture.isSuspended = true;
        fixture.suspendedUntil = this.tickNo + 1;
        fixture.suspensionReason = fixture.sportId === 1 || fixture.sportId === 4 ? 'Goal · repricing' : 'Score · repricing';
      }
      DemoSports.reprice(fixture, this.rng, 300, bigEvent ? 0 : 0.5);
    }
    this.fillBoard();
    this.sortBoard();
    this.syncSlip();
    if (settled || this.tickNo % 4 === 0) this.save();
    this.notify();
  }

  private hasOpenLegs(fixtureId: string): boolean {
    return this.myTickets.some((t) => t.status === 'OPEN' && t.legs.some((l) => l.fixtureId === fixtureId && l.status === 'OPEN'));
  }

  /** Keep bet-slip prices and availability in step with the board. */
  private syncSlip(): void {
    for (const item of this.slipItems.values()) {
      const fixture = this.liveFixtures.get(item.fixtureId);
      const sel = this.findSelection(item.selectionId);
      if (!fixture || !sel || fixture.status === 'FINISHED' || fixture.isSuspended || sel.status === 'SUSPENDED') { item.status = 'SUSPENDED'; continue; }
      item.status = undefined;
      if (sel.odds !== item.odds) { (item as any).previousOdds = item.odds; item.odds = sel.odds; }
    }
  }

  private findSelection(selectionId: string): any {
    const ref = demoParseSelection(selectionId);
    const fixture = ref && this.liveFixtures.get(ref.fixtureId);
    if (!fixture) return null;
    for (const market of fixture.markets) for (const sel of market.selections) if (sel.id === selectionId) return sel;
    return null;
  }

  public toggleDemoFeed(): void {
    this.demoPaused = !this.demoPaused;
    this.showToast(this.demoPaused ? 'Simulation paused · prices and clocks frozen' : 'Simulation resumed', 'info');
    this.notify();
  }

  public setDemoSpeed(speed: number): void {
    this.demoSpeed = [1, 2, 4].includes(speed) ? speed : 1;
    if (this.timer) this.startDemo();
    this.notify();
  }

  public setBetsTab(tab: 'OPEN' | 'SETTLED'): void { this.betsTab = tab; this.notify(); }
  public dismissWelcome(): void { this.welcomeDismissed = true; this.save(); this.notify(); }

  // ==========================================================================
  // Wallet
  // ==========================================================================

  private record(label: string, amount: number, kind: DemoTransaction['kind']): void {
    this.userBalance = Math.round((this.userBalance + amount) * 100) / 100;
    this.demoTransactions.unshift({ id: this.nextId('TX'), label, amount: Math.round(amount * 100) / 100, at: new Date(this.clock()).toISOString(), kind, balance: this.userBalance });
    this.demoTransactions = this.demoTransactions.slice(0, 200);
  }

  public resetDemo(): void {
    this.userBalance = DEMO_START_BALANCE;
    this.myTickets = [];
    this.demoTransactions = [];
    this.demoStats = { casinoRounds: 0, casinoStaked: 0, casinoReturned: 0, biggestWin: 0, deposits: 0 };
    this.turnover = 0;
    this.activePrintTicket = null;
    this.lastGameResult = null;
    this.clearSlip();
    this.record('Demo wallet opened', 0, 'reset');
    this.save();
    this.showToast(`Demo reset to ${DEMO_START_BALANCE.toLocaleString('en-US')} points`, 'success');
    this.notify();
  }

  public override depositDemo(amount = 1000): void {
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) return;
    this.demoStats.deposits += amount;
    this.record('Demo points added', Math.round(amount * 100) / 100, 'deposit');
    this.save();
    this.showToast(`Added ${amount.toLocaleString('en-US')} demo points`, 'success');
    this.notify();
  }

  public override async restoreSession(): Promise<void> {}
  public override async syncBalance(): Promise<void> {}
  public override async syncTickets(): Promise<void> {}
  public override async refreshProtection(): Promise<void> {}
  public override logout(): void { this.showToast('This demo uses a local sample player. Reset it from the wallet.', 'info'); }

  /** Aggregates for the wallet and account views. */
  public summary() {
    const settled = this.myTickets.filter((t) => t.status !== 'OPEN');
    const won = settled.filter((t) => t.status === 'WON').length;
    const lost = settled.filter((t) => t.status === 'LOST').length;
    const cashed = settled.filter((t) => t.status === 'CASHED OUT').length;
    const staked = this.myTickets.reduce((acc, t) => acc + t.stake, 0);
    const returned = settled.reduce((acc, t) => acc + (Number((t as any).returned) || 0), 0);
    const settledStake = settled.reduce((acc, t) => acc + t.stake, 0);
    const open = this.myTickets.filter((t) => t.status === 'OPEN');
    return {
      tickets: this.myTickets.length, open: open.length, openStake: open.reduce((acc, t) => acc + t.stake, 0), won, lost, cashed,
      staked, returned, sportsNet: returned - settledStake, winRate: settled.length ? won / settled.length : 0,
      biggestWin: Math.max(this.demoStats.biggestWin, ...settled.map((t) => (Number((t as any).returned) || 0) - t.stake), 0),
      casinoRounds: this.demoStats.casinoRounds, casinoNet: this.demoStats.casinoReturned - this.demoStats.casinoStaked,
      netResult: this.userBalance - DEMO_START_BALANCE - this.demoStats.deposits,
    };
  }

  // ==========================================================================
  // Sportsbook
  // ==========================================================================

  public override setStake(amount: number): void {
    this.stakeAmount = Math.max(0.5, Math.min(100000, parseFloat(String(amount)) || 1.0));
    this.notify();
  }

  private ticketId(): string {
    let id = '';
    do id = `XB-${Math.floor(this.rng() * 36 ** 6).toString(36).toUpperCase().padStart(6, '0')}`;
    while (this.myTickets.some((t) => t.id === id));
    return id;
  }

  private buildTicket(items: any[], stake: number): PlacedTicket {
    const totalOdds = Math.round(items.reduce((odds, item) => odds * item.odds, 1) * 100) / 100;
    const id = this.ticketId();
    return {
      id, slipNumber: id, betType: items.length > 1 ? 'COMBI' : 'SINGLE', stake, totalOdds,
      potentialPayout: Math.round(stake * totalOdds * 100) / 100, status: 'OPEN', settledAt: '',
      placedAt: new Date(this.clock()).toISOString(),
      legs: items.map((item) => ({
        selectionName: item.selectionName, fixtureName: item.fixtureName, lockedOdds: item.odds, status: 'OPEN',
        fixtureId: item.fixtureId, marketType: item.marketName, marketName: item.marketName, selectionId: item.selectionId,
        tournament: this.liveFixtures.get(item.fixtureId)?.tournamentName, sportId: this.liveFixtures.get(item.fixtureId)?.sportId,
      })),
    } as PlacedTicket;
  }

  public override async placeSlipBet(): Promise<void> {
    const items = [...this.slipItems.values()];
    if (!items.length) return;
    this.syncSlip();
    const isCombi = this.slipType === 'COMBI' && items.length > 1;
    if (isCombi && new Set(items.map((item) => item.fixtureId)).size !== items.length) {
      this.showToast('Combis need one selection per match. Remove the extra pick or switch to singles.', 'error'); return;
    }
    if (isCombi && items.length > 12) { this.showToast('Combis are limited to 12 legs.', 'error'); return; }
    const stake = Math.round(this.stakeAmount * 100) / 100;
    const totalStake = isCombi ? stake : stake * items.length;
    if (!Number.isFinite(stake) || stake < 0.5 || totalStake > this.userBalance) {
      this.showToast(items.length > 1 && !isCombi ? `Singles need ${totalStake.toFixed(2)} pts (stake × ${items.length})` : 'Enter a valid stake within your points balance', 'error'); return;
    }
    if (items.some((item) => !Number.isFinite(item.odds) || item.odds <= 1 || item.status === 'SUSPENDED')) {
      this.showToast('A selection is suspended or settled. Remove it or wait for the market to reopen.', 'error'); return;
    }
    const groups = isCombi ? [items] : items.map((item) => [item]);
    const tickets = groups.map((legs) => this.buildTicket(legs, stake));
    if (tickets.some((t) => !Number.isSafeInteger(Math.round(t.potentialPayout * 100)) || t.potentialPayout > 10_000_000)) {
      this.showToast('Potential return is too large. Reduce the stake or selections.', 'error'); return;
    }
    for (const ticket of tickets) {
      this.myTickets.unshift(ticket);
      this.turnover += stake;
      this.record(`Bet ${ticket.slipNumber} · ${ticket.betType === 'COMBI' ? `${ticket.legs.length}-fold` : ticket.legs[0].selectionName}`, -stake, 'bet');
    }
    this.clearSlip();
    this.betsTab = 'OPEN';
    this.save();
    this.showToast(tickets.length > 1 ? `${tickets.length} singles placed · ${totalStake.toFixed(2)} pts` : `Bet placed · ${tickets[0].slipNumber} · settles at full time`, 'success');
    this.notify();
  }

  /** Grade every open leg on a finished fixture and settle tickets that are decided. */
  private settleFixture(fixture: any): boolean {
    let changed = false;
    for (const ticket of this.myTickets) {
      if (ticket.status !== 'OPEN') continue;
      let graded = false;
      for (const leg of ticket.legs as any[]) {
        if (leg.fixtureId !== fixture.id || leg.status !== 'OPEN') continue;
        leg.status = DemoSports.grade(fixture, leg.selectionId) || 'LOST';
        leg.result = `${fixture.matchClock || 'FT'} ${DemoSports.resultText(fixture)}`;
        graded = true;
      }
      if (graded) { this.evaluateTicket(ticket); changed = true; }
    }
    return changed;
  }

  private evaluateTicket(ticket: PlacedTicket): void {
    if (ticket.status !== 'OPEN') return;
    const legs = ticket.legs;
    if (legs.some((l) => l.status === 'LOST')) {
      ticket.status = 'LOST';
      (ticket as any).returned = 0;
    } else if (legs.every((l) => l.status === 'WON')) {
      ticket.status = 'WON';
      (ticket as any).returned = ticket.potentialPayout;
      this.record(`Winnings ${ticket.slipNumber}`, ticket.potentialPayout, 'win');
      this.showToast(`Ticket ${ticket.slipNumber} won · +${ticket.potentialPayout.toFixed(2)} pts`, 'win');
    } else return;
    ticket.settledAt = new Date(this.clock()).toISOString();
    if (ticket.status === 'LOST') this.showToast(`Ticket ${ticket.slipNumber} lost`, 'info');
  }

  /** Legs whose fixture vanished (e.g. corrupted storage) settle from their locked price. */
  private resolveOrphanLegs(): void {
    for (const ticket of this.myTickets) {
      if (ticket.status !== 'OPEN') continue;
      for (const leg of ticket.legs as any[]) {
        if (leg.status !== 'OPEN' || this.liveFixtures.has(leg.fixtureId)) continue;
        leg.status = this.rng() < 0.95 / Math.max(1.01, leg.lockedOdds) ? 'WON' : 'LOST';
        leg.result = 'Result simulated';
      }
      this.evaluateTicket(ticket);
    }
  }

  /** Fair-value cash-out offer: locked prices against the current prices (which include margin). */
  public cashOutValue(ticket: PlacedTicket): number | null {
    if (ticket.status !== 'OPEN') return null;
    let value = ticket.stake;
    for (const leg of ticket.legs as any[]) {
      if (leg.status === 'WON') { value *= leg.lockedOdds; continue; }
      if (leg.status !== 'OPEN') return null;
      const fixture = this.liveFixtures.get(leg.fixtureId);
      const sel = this.findSelection(leg.selectionId);
      if (!fixture || !sel || fixture.isSuspended || fixture.status === 'FINISHED' || sel.status === 'SUSPENDED' || !(sel.odds > 1)) return null;
      value *= leg.lockedOdds / sel.odds;
    }
    return Math.max(0.01, Math.floor(value * 0.97 * 100) / 100);
  }

  public cashOut(ticketId: string): void {
    const ticket = this.myTickets.find((t) => t.id === ticketId);
    const value = ticket ? this.cashOutValue(ticket) : null;
    if (!ticket || value === null) { this.showToast('Cash out is unavailable while a market is suspended', 'error'); return; }
    ticket.status = 'CASHED OUT';
    ticket.settledAt = new Date(this.clock()).toISOString();
    (ticket as any).returned = value;
    for (const leg of ticket.legs) if (leg.status === 'OPEN') leg.status = 'CASHED OUT';
    this.record(`Cash out ${ticket.slipNumber}`, value, 'cashout');
    this.save();
    this.showToast(`Cashed out ${ticket.slipNumber} · +${value.toFixed(2)} pts`, 'success');
    this.notify();
  }

  /** Play every fixture with an open leg to full time right now. */
  public finishMyMatches(): void {
    const ids = new Set<string>();
    for (const t of this.myTickets) if (t.status === 'OPEN') for (const l of t.legs) if (l.status === 'OPEN' && l.fixtureId) ids.add(l.fixtureId);
    if (!ids.size) { this.showToast('No open bets to settle · place a bet first', 'info'); return; }
    const now = this.clock();
    for (const id of ids) {
      const fixture = this.liveFixtures.get(id);
      if (!fixture || fixture.status === 'FINISHED') continue;
      DemoSports.playToEnd(fixture, this.rng);
      fixture.finishedAt = now;
      DemoSports.reprice(fixture, this.rng, 1);
      this.settleFixture(fixture);
    }
    this.resolveOrphanLegs();
    this.sortBoard();
    this.save();
    this.showToast(`${ids.size} match${ids.size > 1 ? 'es' : ''} played to full time`, 'success');
    this.notify();
  }

  /** Back-compat alias used by the original demo controls. */
  public simulateResults(): void { this.finishMyMatches(); }

  // ==========================================================================
  // Casino & virtuals
  // ==========================================================================

  public override launchGame(slug: string, title: string, category = 'casino'): void {
    if (!DEMO_GAME_CATALOG.some((g) => g.id === slug)) { this.showToast('This title is not part of the static demo', 'info'); return; }
    super.launchGame(slug, title, category);
  }

  public override async requestB2BLaunch(): Promise<void> {}

  public override async loadVirtualRaces(): Promise<void> {
    const now = this.clock();
    const races: any[] = Array.isArray(this.virtualRaces) ? this.virtualRaces : [];
    const ensure = (kind: 'GREYHOUND' | 'HORSE') => {
      if (!races.some((r) => r.type === kind)) races.push(DemoCasino.raceCard(kind, 101 + Math.floor(this.rng() * 400), now, this.rng));
    };
    ensure('GREYHOUND');
    ensure('HORSE');
    this.virtualRaces = races;
    this.notify();
  }

  public override async playCasinoGame(endpoint: string, payload: any): Promise<any> {
    const isRace = endpoint.endsWith('/virtual-sports/bet');
    const bet = payload?.bets?.[0];
    const stake = Number(isRace ? payload?.wager : bet ? bet.amount : payload?.wager ?? payload?.ante);
    if (!Number.isFinite(stake) || stake < 1 || stake > 1000) return { error: 'Choose a stake between 1 and 1,000 points' };
    if (stake > this.userBalance) { this.showToast('Not enough points for this stake', 'error'); return { error: 'Not enough points for this stake' }; }
    const slug = this.activeGameSlug;
    let round: any;
    if (isRace) {
      const index = this.virtualRaces.findIndex((r: any) => r.id === payload.raceId);
      const race = this.virtualRaces[index];
      if (!race || !race.runners.some((x: any) => x.number === payload.runnerNumber)) return { error: 'This race is closed. Pick a runner from the next race.' };
      round = DemoCasino.runRace(race, payload.runnerNumber, stake, this.rng);
      // The finished card stays visible with its result; the next bet opens a fresh race.
      this.virtualRaces[index] = { ...DemoCasino.raceCard(race.type, race.raceNumber + 1, this.clock(), this.rng) };
      this.virtualRaces[index].previous = race;
      round.roundId = `${race.id}`;
    } else if (endpoint.endsWith('/roulette')) {
      if (!['RED', 'BLACK', 'EVEN', 'ODD', 'LOW', 'HIGH'].includes(bet?.type)) return { error: 'Invalid demo wager' };
      round = DemoCasino.roulette(bet.type, stake, this.rng);
    } else if (endpoint.endsWith('/slots')) round = DemoCasino.slots(slug, stake, this.rng);
    else if (endpoint.endsWith('/blackjack')) round = DemoCasino.blackjack(stake, this.rng);
    else if (endpoint.endsWith('/baccarat')) round = DemoCasino.baccarat(payload.betSide || 'PLAYER', stake, this.rng);
    else if (endpoint.endsWith('/highlow')) round = DemoCasino.highLow(payload.choice || 'HIGHER', stake, this.rng);
    else if (endpoint.endsWith('/keno')) round = DemoCasino.keno(Array.isArray(payload.pickedNumbers) ? payload.pickedNumbers : [3, 7, 18, 24, 55], stake, this.rng);
    else if (endpoint.endsWith('/scratch')) round = DemoCasino.scratch(stake, this.rng);
    else if (endpoint.endsWith('/bingo')) round = DemoCasino.bingo(stake, this.rng);
    else return { error: 'This game is not part of the static demo' };

    const title = this.activeGameTitle || (isRace ? 'Virtual race' : 'Casino');
    this.turnover += stake;
    this.demoStats.casinoRounds++;
    this.demoStats.casinoStaked += stake;
    this.demoStats.casinoReturned += round.payout;
    this.demoStats.biggestWin = Math.max(this.demoStats.biggestWin, round.payout - stake);
    this.record(`${title} · stake`, -stake, 'casino');
    if (round.payout > 0) this.record(`${title} · ${round.payout >= stake ? 'win' : 'return'}`, round.payout, 'casino-win');
    if (this.demoStats.casinoRounds % 3 === 0) this.save();
    if (isRace) return { ...round, newBalance: this.userBalance };
    return { newBalance: this.userBalance, result: { payout: round.payout, gameState: round.gameState, roundId: round.roundId, message: round.message } };
  }
}
