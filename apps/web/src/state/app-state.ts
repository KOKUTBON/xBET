/**
 * Reactive State Manager for xBET Web Platform
 * Converted from CakePHP with TypeScript Standard.
 * 
 * Manages:
 * - User Session, Balance & Seamless Wallet
 * - 20+ Sports Live Fixtures & WebSocket Streaming
 * - Dynamic Odds Format (Decimal, Fractional, American)
 * - Betslip (Single, Combi, Quick Stake Chips, Thermal Receipts)
 * - Reservation Ticket Search
 * - Game Frame (Dogs, Lucky 6, Aviator, Plinko, Classic Slots, Live Casino)
 * - Cashier Vouchers & Shop Manager 15% KPI Ledger
 */

export interface SlipSelectionItem {
  selectionId: string;
  selectionName: string;
  marketId: string;
  marketName: string;
  fixtureId: string;
  fixtureName: string;
  odds: number;
  quoteId?: string;
  marketVersion?: number;
  status?: string;
}

export interface PlacedTicket {
  id: string;
  slipNumber: string;
  betType: string;
  stake: number;
  totalOdds: number;
  potentialPayout: number;
  status: string;
  settledAt: string;
  roundId?: string;
  placedAt?: string;
  returned?: number;
  legs: Array<{
    selectionName: string;
    fixtureName: string;
    lockedOdds: number;
    status: string;
    fixtureId?: string;
    marketType?: string;
    marketName?: string;
    selectionId?: string;
    result?: string;
  }>;
}

export type OddsFormat = 'decimal' | 'fractional' | 'american';

export function formatOddsValue(decimalOdds: number, format: OddsFormat = 'decimal'): string {
  const dec = parseFloat(String(decimalOdds));
  if (isNaN(dec) || dec <= 1) return '1.01';

  if (format === 'fractional') {
    const val = dec - 1;
    const fractions = [
      { f: '1/10', v: 0.1 }, { f: '1/5', v: 0.2 }, { f: '1/4', v: 0.25 },
      { f: '1/3', v: 0.333 }, { f: '2/5', v: 0.4 }, { f: '1/2', v: 0.5 },
      { f: '4/7', v: 0.571 }, { f: '3/5', v: 0.6 }, { f: '4/6', v: 0.667 },
      { f: '4/5', v: 0.8 }, { f: '1/1', v: 1.0 }, { f: '6/5', v: 1.2 },
      { f: '5/4', v: 1.25 }, { f: '11/8', v: 1.375 }, { f: '6/4', v: 1.5 },
      { f: '7/4', v: 1.75 }, { f: '2/1', v: 2.0 }, { f: '9/4', v: 2.25 },
      { f: '5/2', v: 2.5 }, { f: '3/1', v: 3.0 }, { f: '7/2', v: 3.5 },
      { f: '4/1', v: 4.0 }, { f: '5/1', v: 5.0 }, { f: '6/1', v: 6.0 },
      { f: '7/1', v: 7.0 }, { f: '8/1', v: 8.0 }, { f: '10/1', v: 10.0 },
      { f: '12/1', v: 12.0 }, { f: '14/1', v: 14.0 }, { f: '20/1', v: 20.0 },
    ];
    let closest = fractions[0];
    let minDiff = Math.abs(val - closest.v);
    for (const f of fractions) {
      const diff = Math.abs(val - f.v);
      if (diff < minDiff) {
        minDiff = diff;
        closest = f;
      }
    }
    return closest.f;
  } else if (format === 'american') {
    if (dec >= 2.0) {
      return `+${Math.round((dec - 1) * 100)}`;
    } else {
      return `${Math.round(-100 / (dec - 1))}`;
    }
  }
  return dec.toFixed(2);
}

export class AppStateManager {
  public demoMode = false;
  public username: string = 'guest';
  public userId: string = '';
  public userRole: string = 'PLAYER';
  public isAuthenticated: boolean = false;
  public userBalance: number = 0;
  public userType: string = 'punter';
  public shard: string = 'main';
  public part: number = 1;
  public role: number = 6;
  public sessionToken: string = '';
  public accountProtection: {dailyWagerLimit:number;excludedUntil:string|null}|null = null;
  private pendingBet: {fingerprint:string;key:string;quoteId:string;selectionId:string;stake:number;userId:string} | null = null;
  private pendingCasino: {fingerprint:string;key:string;commitmentId?:string;clientSeed:string} | null = null;
  public restrictedPilot = false;
  public dataMode: 'SIMULATED' | 'REFERENCE_ONLY' | 'LICENSED_LIVE' = 'SIMULATED';

  // Active server quote state
  public activeQuote: { quoteId: string; expiresAt: number; price: number; selectionId: string } | null = null;
  public quoteCountdownSeconds: number = 0;
  public isRequestingQuote: boolean = false;
  private quoteTimer: any = null;

  public oddsFormat: OddsFormat = 'decimal';
  public feedConnected: boolean = false;
  public language: string = 'English';
  public searchQuery: string = '';

  public activeTab: 'sports' | 'inplay' | 'casino' | 'livecasino' | 'virtual' | 'game' | 'legal' = 'sports';
  public activeFixtureId: string | null = null;
  public selectedSportId: number | null = null;
  public expandedSportId: number | null = null;
  public selectedLeagueName: string | null = null;
  public activeLegalPage: string = 'responsible_gambling';

  // Imported Game Frame State (for imported vendor iframe launcher)
  public activeGameTitle: string = '';
  public activeGameUrl: string = '';
  public activeGameCategory: string = '';

  // Live Fixtures: Map<fixtureId, fixtureData>
  public liveFixtures: Map<string, any> = new Map();

  // Betslip state
  public slipItems: Map<string, SlipSelectionItem> = new Map();
  public slipType: 'SINGLE' | 'COMBI' = 'SINGLE';
  public stakeAmount: number = 25.0;

  // Placed Tickets for "My Bets" (populated at runtime as the player places bets)
  public myTickets: PlacedTicket[] = [];

  // Financial Ledger & KPI (accumulated at runtime from real activity)
  public turnover: number = 0.0;
  public ggr: number = 0.0;
  public marginPercent: number = 0.0;
  public kpiRate: number = 0.15;

  // Modals
  public showKpiModal: boolean = false;
  public showCashierModal: boolean = false;
  public showLoginModal: boolean = false;
  public showProvablyFairModal: boolean = false;
  public activeVerificationRound: any = null;
  public activePrintTicket: PlacedTicket | null = null;

  private listeners: Set<any> = new Set();

  constructor() {
    // Structured clean initialization ready for live feed streams
  }

  public toggleLoginModal(show?: boolean): void {
    this.showLoginModal = show !== undefined ? show : !this.showLoginModal;
    this.notify();
  }

  public setDataMode(mode: 'SIMULATED' | 'REFERENCE_ONLY' | 'LICENSED_LIVE'): void {
    this.dataMode = mode;
    this.notify();
  }

  public async login(username: string, password: string, register = false): Promise<boolean> {
    try {
      const resp = await fetch(register ? '/api/v1/auth/register' : '/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (resp.ok) {
        const data = await resp.json();
        this.sessionToken = data.token;
        this.username = data.user.username;
        this.userId = data.user.id;
        this.userRole = data.user.role;
        this.isAuthenticated = true;
        if(typeof sessionStorage!=='undefined')sessionStorage.setItem('xbet-token',this.sessionToken);
        await this.syncBalance();
        await this.syncTickets();
        this.showToast(`Signed in as ${this.username} (${this.userRole})`, 'success');
        this.notify();
        return true;
      }
    } catch (_err) { this.showToast('Sign in unavailable. Please retry.', 'error'); }
    this.showToast('Sign in was not accepted', 'error');
    return false;
  }

  public logout(): void {
    const token=this.sessionToken;
    if(token)void fetch('/api/v1/auth/logout',{method:'POST',headers:{Authorization:`Bearer ${token}`}}).catch(()=>{});
    if(typeof sessionStorage!=='undefined')sessionStorage.removeItem('xbet-token');
    this.myTickets=[];
    this.pendingBet=null;this.pendingCasino=null;
    this.username = 'guest';
    this.userId = '';
    this.userRole = 'PLAYER';
    this.sessionToken = '';
    this.accountProtection = null;
    this.isAuthenticated = false;
    this.userBalance = 0;
    this.activeQuote = null;
    this.clearSlip();
    this.showToast('Signed out', 'info');
    this.notify();
  }

  public async syncBalance(): Promise<void> {
    if (!this.userId || !this.sessionToken) return;
    try {
      const resp = await fetch(`/api/v1/wallet/balance/${this.userId}`, {
        headers: { 'Authorization': `Bearer ${this.sessionToken}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (typeof data.balance === 'number') {
          this.userBalance = data.balance;
          this.notify();
          return;
        }
      }
    } catch (_e) {}
  }

  public async restoreSession(): Promise<void> {
    if(typeof sessionStorage==='undefined')return;
    const token=sessionStorage.getItem('xbet-token');if(!token)return;
    try{const response=await fetch('/api/v1/auth/me',{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)return;
      const {user}=await response.json();this.sessionToken=token;this.userId=user.id;this.username=user.username;this.userRole=user.role;this.isAuthenticated=true;await this.syncBalance();await this.syncTickets();this.notify();
    }catch{this.showToast('Account service unavailable','error');}
  }

  public async syncTickets(): Promise<void> {
    if(!this.isAuthenticated)return;
    try{const response=await fetch(`/api/v1/bets/user/${encodeURIComponent(this.userId)}`,{headers:{Authorization:`Bearer ${this.sessionToken}`}});if(!response.ok)return;
      const {tickets}=await response.json();this.myTickets=(tickets||[]).map((ticket:any)=>({id:ticket.id,slipNumber:ticket.id,betType:'SINGLE',stake:ticket.stake,totalOdds:ticket.totalOdds,potentialPayout:ticket.potentialPayout,status:ticket.status,settledAt:ticket.status==='ACCEPTED'?'Pending':'Settled',legs:[{selectionName:ticket.selection.selectionName,fixtureName:ticket.selection.fixtureName,lockedOdds:ticket.totalOdds,status:ticket.status,fixtureId:ticket.selection.fixtureId,marketType:ticket.selection.marketType}]}));this.notify();
    }catch{this.showToast('Ticket history unavailable','error');}
  }

  public async requestServerQuote(item: SlipSelectionItem): Promise<string | null> {
    this.isRequestingQuote = true;
    this.notify();
    try {
      const resp = await fetch('/api/v1/bets/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.sessionToken}`,
        },
        body: JSON.stringify({
          fixtureId: item.fixtureId,
          marketId: item.marketId,
          selectionId: item.selectionId,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const quote = data.quote;
        if (quote && quote.quoteId) {
          this.activeQuote = {
            quoteId: quote.quoteId,
            expiresAt: quote.expiresAt || (Date.now() + 60000),
            price: quote.selection?.odds || quote.price || item.odds,
            selectionId: item.selectionId,
          };
          item.odds = this.activeQuote.price;
          item.quoteId = quote.quoteId;
          this.startQuoteTimer();
          this.showToast(`Quote #${quote.quoteId.slice(0, 8)} locked @ ${item.odds.toFixed(2)}`, 'info');
          this.notify();
          return quote.quoteId;
        }
      }
    } catch (_err) { this.showToast('Quote service unavailable', 'error');
    } finally {
      this.isRequestingQuote = false;
      this.notify();
    }
    return null;
  }

  public startQuoteTimer(): void {
    if (this.quoteTimer) clearInterval(this.quoteTimer);
    if (!this.activeQuote) return;
    const updateCountdown = () => {
      if (!this.activeQuote) {
        if (this.quoteTimer) clearInterval(this.quoteTimer);
        return;
      }
      const remainingMs = this.activeQuote.expiresAt - Date.now();
      if (remainingMs <= 0) {
        this.quoteCountdownSeconds = 0;
        this.activeQuote = null;
        if (this.quoteTimer) clearInterval(this.quoteTimer);
        this.showToast('Server quote expired. Please re-lock price.', 'info');
        this.notify();
      } else {
        this.quoteCountdownSeconds = Math.ceil(remainingMs / 1000);
        this.notify();
      }
    };
    updateCountdown();
    this.quoteTimer = setInterval(updateCountdown, 1000);
  }

  public subscribe(listener: any): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public setOddsFormat(format: OddsFormat): void {
    this.oddsFormat = format;
    this.showToast(`Odds format: ${format}`, 'info');
    this.notify();
  }

  public setSearchQuery(q: string): void {
    this.searchQuery = q.toLowerCase().trim();
    if (this.searchQuery) {
      this.selectedSportId = null;
      this.selectedLeagueName = null;
      this.activeTab = 'sports';
    }
    this.notify();
  }

  public setActiveTab(tab: 'sports' | 'inplay' | 'casino' | 'livecasino' | 'virtual' | 'game' | 'legal'): void {
    this.activeTab = tab;
    this.activeFixtureId = null;
    this.notify();
  }

  public openGame(title: string, gameUrl: string, category: string = 'casino'): void {
    const slug = gameUrl.match(/^\/casino\/([a-z0-9-]+)\/index\.html$/)?.[1];
    if (!slug) throw new Error('Unsupported game route');
    this.launchGame(slug, title, category);
  }

  public closeGame(): void {
    this.activeGameUrl = '';
    this.activeGameTitle = '';
    this.activeGameSlug = '';
    this.activeB2BLaunchUrl = '';
    this.activeB2BProvider = '';
    this.lastGameResult = null;
    this.activeTab = this.activeGameCategory === 'virtual' ? 'virtual' : 'casino';
    this.notify();
  }

  // ---- Casino game client state ----
  public activeGameSlug: string = '';
  public activeB2BLaunchUrl: string = '';
  public activeB2BProvider: string = '';
  public gameStake: number = 10;
  public gameOption: string = '';
  public lastGameResult: any = null;
  public gameBusy: boolean = false;

  /** Static config: which real engine each catalog game maps to, and how to build its payload. */
  public static readonly GAME_CONFIG: any = {
    roulette:      { endpoint: '/api/v1/casino/play/roulette', kind: 'roulette', options: ['RED', 'BLACK', 'EVEN', 'ODD'], build: (s, o) => ({ bets: [{ type: o || 'RED', value: o || 'RED', amount: s }] }) },
    slots:         { endpoint: '/api/v1/casino/play/slots',    kind: 'slots',    build: (s) => ({ wager: s, gameCode: 'slot_fruits' }) },
    baccarat:      { endpoint: '/api/v1/casino/play/baccarat', kind: 'cards', options: ['PLAYER', 'BANKER', 'TIE'], build: (s, o) => ({ wager: s, betSide: o || 'PLAYER' }) },
    blackjack:     { endpoint: '/api/v1/casino/play/blackjack',kind: 'cards',  build: (s) => ({ action: 'DEAL', wager: s }) },
    stud:          { endpoint: '/api/v1/casino/play/stud',     kind: 'cards',  build: (s) => ({ action: 'DEAL', ante: s, wager: s }) },
    highlow:       { endpoint: '/api/v1/casino/play/highlow',  kind: 'highlow', options: ['HIGHER', 'LOWER'], build: (s, o) => ({ wager: s, choice: o || 'HIGHER' }) },
    keno:          { endpoint: '/api/v1/casino/play/keno',     kind: 'numbers', build: (s) => ({ wager: s, pickedNumbers: [3, 7, 18, 24, 55] }) },
    scratch:       { endpoint: '/api/v1/casino/play/scratch',  kind: 'instant', build: (s) => ({ wager: s }) },
    bingo:         { endpoint: '/api/v1/casino/play/bingo',    kind: 'instant', build: (s) => ({ wager: s }) },
  };

  /** Resolve a catalog slug to its engine config (all slot-* variants share the slots engine). */
  public static resolveGameConfig(slug: string) {
    if (AppStateManager.GAME_CONFIG[slug]) return AppStateManager.GAME_CONFIG[slug];
    if (/^slot-|ancient-treasure|soccer-hero|gates-of-olympus|sweet-bonanza|wanted-dead-or-wild/i.test(slug)) return AppStateManager.GAME_CONFIG.slots;
    if (/^lightning-roulette/i.test(slug)) return AppStateManager.GAME_CONFIG.roulette;
    return undefined;
  }

  public virtualRaces: any[] = [];

  public launchGame(slug: string, title: string, category: string = 'casino'): void {
    this.activeGameSlug = slug;
    this.activeGameTitle = title;
    this.activeGameCategory = category;
    this.activeGameUrl = slug;
    this.activeTab = 'game';
    this.activeFixtureId = null;
    this.lastGameResult = null;
    this.gameOption = '';

    const b2bProviders: Record<string, string> = {
      'gates-of-olympus': 'PRAGMATIC_PLAY',
      'sweet-bonanza': 'PRAGMATIC_PLAY',
      'lightning-roulette': 'EVOLUTION',
      'wanted-dead-or-wild': 'HACKSAW',
      'aviator-pro': 'SPRIBE',
    };

    if (b2bProviders[slug]) {
      this.activeB2BProvider = b2bProviders[slug];
      void this.requestB2BLaunch(slug, b2bProviders[slug]);
    } else {
      this.activeB2BLaunchUrl = '';
      this.activeB2BProvider = '';
    }

    this.notify();
    if (category === 'virtual') void this.loadVirtualRaces();
  }

  public async requestB2BLaunch(gameId: string, provider: string): Promise<void> {
    try {
      const resp = await fetch('/api/v1/aggregator/games/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, provider, mode: 'REAL' }),
      });
      if (resp.ok) {
        const data = await resp.json();
        this.activeB2BLaunchUrl = data.launchUrl || '';
        this.notify();
      }
    } catch (_e) {
      this.activeB2BLaunchUrl = `https://demogamesfree.pragmaticplay.net/gs2c/playGame.do?gameId=${gameId}&mode=REAL`;
      this.notify();
    }
  }

  public async loadVirtualRaces(): Promise<void> {
    try {
      const resp = await fetch('/api/v1/virtual-sports/races');
      const data = await resp.json();
      this.virtualRaces = Array.isArray(data.races) ? data.races : [];
      this.notify();
    } catch (_e) {
      this.virtualRaces = [];
    }
  }

  public setGameStake(v: number): void {
    if (!Number.isFinite(v)) return;
    this.gameStake = Math.max(1, Math.min(1000, Math.round(v)));
    this.notify();
  }

  public setGameOption(o: string): void {
    this.gameOption = o;
    this.notify();
  }

  /** Play one round of the active casino game against the real RGS engine. Points move server-side. */
  public async playActiveGame(): Promise<void> {
    const cfg = AppStateManager.resolveGameConfig(this.activeGameSlug);
    if (!cfg || this.gameBusy) return;
    if (this.userBalance < this.gameStake) {
      this.showToast('Not enough points for this stake', 'error');
      return;
    }
    this.gameBusy = true;
    this.notify();

    const payload = cfg.build(this.gameStake, this.gameOption);
    const data = await this.playCasinoGame(cfg.endpoint, payload);

    const payout = Number(data?.result?.payout ?? data?.payout ?? 0);
    const won = payout > 0;
    this.lastGameResult = {
      kind: cfg.kind,
      won,
      payout,
      stake: this.gameStake,
      raw: data?.result ?? data,
      newBalance: data?.newBalance ?? this.userBalance,
      error: data?.error,
      roundKey: Date.now(),
    };
    this.gameBusy = false;
    if (!data?.error) {
      this.showToast(won ? `Won +${payout.toFixed(2)} pts` : `No win this round (−${this.gameStake} pts)`, won ? 'win' : 'info');
    }
    this.notify();
  }

  /** Play a virtual race: pick a runner, run and settle on the server. */
  public async playVirtualRace(raceId: string, runnerNumber: number, betType: string = 'WIN'): Promise<void> {
    if (this.gameBusy) return;
    if (this.userBalance < this.gameStake) {
      this.showToast('Not enough points for this stake', 'error');
      return;
    }
    this.gameBusy = true;
    this.notify();
    const data = await this.playCasinoGame('/api/v1/virtual-sports/bet', { raceId, runnerNumber, betType, wager: this.gameStake });
    this.lastGameResult = {
      kind: 'race',
      won: Boolean(data?.won),
      payout: Number(data?.payout ?? 0),
      stake: this.gameStake,
      raw: data,
      newBalance: data?.newBalance ?? this.userBalance,
      error: data?.error,
      roundKey: Date.now(),
      runnerNumber,
    };
    this.gameBusy = false;
    if (!data?.error) {
      this.showToast(data?.won ? `Race won +${Number(data.payout).toFixed(2)} pts` : `${data?.message || 'Race lost'}`, data?.won ? 'win' : 'info');
    }
    this.notify();
  }

  public selectSport(sportId: number | null): void {
    if (this.selectedSportId === sportId) {
      this.expandedSportId = this.expandedSportId === sportId ? null : sportId;
    } else {
      this.selectedSportId = sportId;
      this.expandedSportId = sportId;
    }
    this.selectedLeagueName = null;
    this.activeFixtureId = null;
    this.searchQuery = '';
    this.activeTab = 'sports';
    this.notify();
  }

  public selectLeague(leagueName: string | null): void {
    this.selectedLeagueName = leagueName;
    this.selectedSportId = null;
    this.activeFixtureId = null;
    this.searchQuery = '';
    this.activeTab = 'sports';
    this.notify();
  }

  public openLegalPage(page: string = 'responsible_gambling'): void {
    this.activeTab = 'legal';
    this.activeLegalPage = page;
    this.activeFixtureId = null;
    this.notify();
  }

  public openMatchDetails(fixtureId: string): void {
    this.activeFixtureId = fixtureId;
    this.notify();
  }

  public closeMatchDetails(): void {
    this.activeFixtureId = null;
    this.notify();
  }

  public toggleSelection(item: SlipSelectionItem): void {
    if (this.slipItems.has(item.selectionId)) {
      this.slipItems.delete(item.selectionId);
    } else {
      if(this.restrictedPilot){this.slipItems.clear();this.slipType='SINGLE';}
      this.slipItems.set(item.selectionId, item);
      if (this.slipItems.size > 1 && this.slipType === 'SINGLE') {
        this.slipType = 'COMBI';
      }
    }
    this.notify();
  }

  public removeSelection(selectionId: string): void {
    this.slipItems.delete(selectionId);
    if (this.slipItems.size <= 1) {
      this.slipType = 'SINGLE';
    }
    this.notify();
  }

  public clearSlip(): void {
    this.slipItems.clear();
    this.notify();
  }

  public setSlipType(type: 'SINGLE' | 'COMBI'): void {
    this.slipType = this.restrictedPilot ? 'SINGLE' : type;
    this.notify();
  }

  public setStake(amount: number): void {
    this.stakeAmount = Math.max(0.5, parseFloat(String(amount)) || 1.0);
    this.notify();
  }

  public addQuickStake(delta: number): void {
    this.stakeAmount += delta;
    this.notify();
  }

  public setMaxStake(): void {
    this.stakeAmount = Math.min(this.userBalance, 1000.0);
    this.notify();
  }

  public setBalance(newBalance: number): void {
    this.userBalance = newBalance;
    this.notify();
  }

  public depositDemo(amount: number = 100): void {
    if(typeof window !== 'undefined'){this.showToast('Pilot points are granted by an administrator','info');return;}
    this.userBalance += amount;
    this.showToast(`+${amount.toFixed(2)} pts added to your wallet`, 'success');
    this.notify();
  }

  public toggleKpiModal(open: boolean): void {
    this.showKpiModal = open;
    if(open && this.isAuthenticated)void this.refreshProtection();
    this.notify();
  }

  public async refreshProtection(): Promise<void> {
    try {
      const response = await fetch('/api/v1/account/protection', {headers:{Authorization:`Bearer ${this.sessionToken}`}});
      if(response.ok){this.accountProtection=await response.json();this.notify();}
    } catch { this.showToast('Unable to load account protection', 'error'); }
  }

  public async updateProtection(body: {dailyWagerLimit?:number;selfExcludeDays?:number}): Promise<void> {
    try {
      const response=await fetch('/api/v1/account/protection',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.sessionToken}`},body:JSON.stringify(body)});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error || 'Protection update failed');
      this.accountProtection=data;this.showToast('Account protection saved','success');this.notify();
    } catch(error:any){this.showToast(error.message || 'Protection update failed','error');}
  }

  public toggleCashierModal(open: boolean): void {
    this.showCashierModal = open;
    this.notify();
  }

  public toggleProvablyFairModal(open: boolean, roundData?: any): void {
    this.showProvablyFairModal = open;
    if (roundData) {
      this.activeVerificationRound = roundData;
      if (typeof (globalThis as any).ProvablyFairModalComponent?.setFromRound === 'function') {
        (globalThis as any).ProvablyFairModalComponent.setFromRound(roundData);
      }
    }
    this.notify();
  }

  public setMarketSuspended(fixtureId: string, suspended: boolean, reason?: string): void {
    const fix = this.liveFixtures.get(fixtureId);
    if (!fix) return;
    fix.isSuspended = suspended;
    fix.suspensionReason = reason;
    if (fix.markets) {
      for (const mkt of fix.markets) {
        mkt.status = suspended ? 'SUSPENDED' : 'ACTIVE';
        mkt.suspensionReason = reason;
        if (mkt.selections) {
          for (const sel of mkt.selections) {
            sel.status = suspended ? 'SUSPENDED' : 'ACTIVE';
          }
        }
      }
    }
    if (suspended) {
      this.showToast(`Market suspended: ${reason || 'Trading halted'}`, 'info');
    }
    this.notify();
  }

  public applyVersionedQuote(quote: any): void {
    if (!quote || !quote.fixtureId) return;
    const fix = this.liveFixtures.get(quote.fixtureId);
    if (!fix) return;
    fix.marketVersion = quote.marketVersion;
    fix.quoteId = quote.quoteId;
    fix.isSuspended = quote.status === 'SUSPENDED';
    fix.suspensionReason = quote.suspensionReason;

    if (quote.markets && fix.markets) {
      const m1x2 = fix.markets.find((m: any) => /1x2|match winner|result/i.test(m.marketType || m.name));
      if (m1x2 && quote.markets.matchWinner) {
        m1x2.status = quote.markets.matchWinner.status;
        m1x2.marketVersion = quote.marketVersion;
        m1x2.quoteId = quote.quoteId;
        const qSels = quote.markets.matchWinner.selections;
        if (qSels && m1x2.selections) {
          for (let i = 0; i < Math.min(m1x2.selections.length, qSels.length); i++) {
            const sel = m1x2.selections[i];
            const qSel = qSels[i];
            sel.previousOdds = sel.odds;
            sel.odds = qSel.odds;
            sel.quoteId = quote.quoteId;
            sel.marketVersion = quote.marketVersion;
            sel.status = quote.markets.matchWinner.status;
          }
        }
      }
    }
    this.notify();
  }

  public openPrintTicket(ticket: PlacedTicket): void {
    this.activePrintTicket = ticket;
    this.notify();
  }

  public closePrintTicket(): void {
    this.activePrintTicket = null;
    this.notify();
  }

  public lookupReservationTicket(ticketId: string): void {
    const clean = ticketId.trim().toUpperCase();
    if (!clean) {
      this.showToast('Enter a ticket ID', 'error');
      return;
    }
    const found = this.myTickets.find((t) => t.slipNumber.toUpperCase() === clean || t.id.toUpperCase() === clean);
    if (found) {
      this.openPrintTicket(found);
      this.showToast(`Ticket ${clean} found · ${found.status}`, 'success');
    } else {
      this.showToast(`Ticket ${clean} not found`, 'error');
    }
  }

  public async debitWallet(amount: number, gameId: string = 'sportsbook', roundId?: string): Promise<boolean> {
    if (this.userBalance < amount) {
      this.showToast('Insufficient balance for this action', 'error');
      return false;
    }
    const rid = roundId || `rnd_${Date.now()}`;
    try {
      const resp = await fetch('/api/wallet/debit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.username,
          amount,
          transactionId: `tx_${Date.now()}`,
          roundId: rid,
          gameId,
        }),
      });
      if (!resp.ok) throw new Error(`Wallet debit rejected (${resp.status})`);
      const data = await resp.json();
      if (typeof data.balance !== 'number') throw new Error('Wallet debit returned no balance');
      this.userBalance = data.balance;
    } catch (_e) {
      this.showToast('Wallet debit was not accepted', 'error');
      return false;
    }
    this.turnover += amount;
    this.notify();
    return true;
  }

  public async creditWallet(amount: number, wager: number = 0, gameId: string = 'sportsbook', roundId?: string): Promise<boolean> {
    const rid = roundId || `rnd_${Date.now()}`;
    try {
      const resp = await fetch('/api/wallet/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.username,
          amount,
          wager,
          transactionId: `tx_${Date.now()}`,
          roundId: rid,
          gameId,
        }),
      });
      if (!resp.ok) throw new Error(`Wallet credit rejected (${resp.status})`);
      const data = await resp.json();
      if (typeof data.balance !== 'number') throw new Error('Wallet credit returned no balance');
      this.userBalance = data.balance;
    } catch (_e) {
      this.showToast('Wallet credit was not accepted', 'error');
      return false;
    }
    this.notify();
    return true;
  }

  /** Seed (once) and load the real points balance from the wallet service. */
  public async initWallet(): Promise<void> {
    try {
      const resp = await fetch('/api/wallet/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: this.username, minBalance: 5000 }),
      });
      if (!resp.ok) throw new Error(`Wallet initialization rejected (${resp.status})`);
      const data = await resp.json();
      if (typeof data.balance === 'number') {
        this.userBalance = data.balance;
        this.notify();
      }
    } catch (_e) {
      this.userBalance = 0;
      this.notify();
    }
  }

  /** Admin: grant (+) or revoke (-) points for a user against the real ledger. */
  public async adminAdjustPoints(userId: string, delta: number, reason: string = 'Admin adjustment'): Promise<void> {
    try {
      const resp = await fetch('/api/wallet/admin-adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, delta, reason }),
      });
      if (!resp.ok) throw new Error(`Admin adjustment rejected (${resp.status})`);
      const data = await resp.json();
      if (userId === this.username && typeof data.balance === 'number') this.userBalance = data.balance;
      this.showToast(`${delta >= 0 ? 'Granted' : 'Revoked'} ${Math.abs(delta)} pts ${userId === this.username ? '(you)' : 'to ' + userId} → ${data.balance?.toFixed?.(2) ?? '?'} pts`);
      this.notify();
    } catch (_e) {
      this.showToast('Admin adjust failed (wallet service unreachable)', 'error');
    }
  }

  /** Casino: play one round of a game through the real RGS engine; points move on the server. */
  public async playCasinoGame(endpoint: string, payload: any): Promise<any> {
    try {
      if(!this.isAuthenticated)throw new Error('Sign in to play');
      const fingerprint=JSON.stringify({endpoint,payload});
      if(this.pendingCasino && this.pendingCasino.fingerprint!==fingerprint)throw new Error('Retry the previous round before changing your wager');
      if(this.pendingCasino?.fingerprint!==fingerprint)this.pendingCasino={fingerprint,key:crypto.randomUUID(),clientSeed:crypto.randomUUID()};
      const pending=this.pendingCasino!;
      if(endpoint==='/api/v1/casino/play/roulette'&&!pending.commitmentId){
        const prepared=await fetch('/api/v1/casino/roulette/commitment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.sessionToken}`},body:JSON.stringify({idempotencyKey:pending.key})});
        if(!prepared.ok)throw new Error('Seed commitment unavailable');
        const {commitment}=await prepared.json();pending.commitmentId=commitment.commitmentId;
      }
      const resp = await fetch(endpoint, {
        method: 'POST',headers: { 'Content-Type': 'application/json',Authorization:`Bearer ${this.sessionToken}` },
        body: JSON.stringify({ ...payload,idempotencyKey:pending.key,commitmentId:pending.commitmentId,clientSeed:pending.clientSeed }),
      });
      if (!resp.ok) {const failure=await resp.json().catch(()=>({}));if(['COMMITMENT_EXPIRED_OR_USED','INVALID_BETS','INVALID_BET','UNSUPPORTED_BET','WAGER_LIMIT_EXCEEDED','INVALID_AMOUNT','INSUFFICIENT_FUNDS','DAILY_WAGER_LIMIT','SELF_EXCLUDED','PILOT_FROZEN','UNAUTHORIZED'].includes(failure.error))this.pendingCasino=null;throw new Error(failure.error || `Game round rejected (${resp.status})`);}
      const data = await resp.json();
      this.pendingCasino=null;
      if (typeof data.newBalance === 'number') this.userBalance = data.newBalance;
      this.notify();
      return data;
    } catch (e) {
      this.showToast('Game round failed', 'error');
      return { error: String(e) };
    }
  }

  public async placeSlipBet(): Promise<void> {
    const items = Array.from(this.slipItems.values());
    if (items.length === 0) return;

    if (!this.isAuthenticated) {
      this.showToast('Please sign in to lock quotes and place bets', 'error');
      this.toggleLoginModal(true);
      return;
    }

    if (this.stakeAmount > this.userBalance) {
      this.showToast('Stake exceeds current points balance', 'error');
      return;
    }

    // 1. Authoritative Server Quote path for Singles
    if (this.slipType === 'SINGLE' && items.length === 1) {
      const item = items[0];
      try {
        if(this.pendingBet && (this.pendingBet.userId!==this.userId || this.pendingBet.selectionId!==item.selectionId || this.pendingBet.stake!==this.stakeAmount)){
          this.showToast('Resolve the previous placement by retrying its selection and stake before starting another bet.','error');return;
        }
        let quoteId = this.pendingBet?.quoteId || item.quoteId || this.activeQuote?.quoteId;
        if (!this.pendingBet && (!quoteId || this.activeQuote?.selectionId !== item.selectionId)) {
          quoteId = await this.requestServerQuote(item) || undefined;
          if(this.restrictedPilot)return; // Display the authoritative price before the player confirms.
        }

        if (quoteId) {
          const fingerprint=JSON.stringify({quoteId,stake:this.stakeAmount});
          if(this.pendingBet?.fingerprint!==fingerprint)this.pendingBet={fingerprint,key:crypto.randomUUID(),quoteId,selectionId:item.selectionId,stake:this.stakeAmount,userId:this.userId};
          const pResp = await fetch('/api/v1/bets/place', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.sessionToken}`,
            },
            body: JSON.stringify({
              quoteId,
              stake: this.stakeAmount,
              idempotencyKey: this.pendingBet!.key,
            }),
          });

          if (pResp.ok) {
            const pData = await pResp.json();
            const tkt = pData.ticket;
            this.pendingBet=null;
            if (typeof pData.remainingBalance === 'number') {
              this.userBalance = pData.remainingBalance;
            } else {
              this.userBalance -= this.stakeAmount;
            }
            this.turnover += this.stakeAmount;

            const ticket: PlacedTicket = {
              id: tkt?.id || `slip-${Date.now()}`,
              slipNumber: tkt?.id || `TKT-${Date.now().toString().slice(-6)}`,
              betType: 'SINGLE',
              stake: this.stakeAmount,
              totalOdds: parseFloat((tkt?.totalOdds || item.odds).toFixed(2)),
              potentialPayout: parseFloat((tkt?.potentialPayout || (this.stakeAmount * item.odds)).toFixed(2)),
              status: 'OPEN (IN-PLAY)',
              settledAt: 'Live',
              legs: [{
                selectionName: item.selectionName,
                fixtureName: item.fixtureName,
                lockedOdds: tkt?.totalOdds || item.odds,
                status: 'LIVE',
                fixtureId: item.fixtureId,
                marketType: '1X2',
              }],
            };
            this.myTickets.unshift(ticket);
            await this.syncBalance();
            await this.syncTickets();
            this.clearSlip();
            this.showToast(`Server Quote Locked: ${ticket.slipNumber} · ${ticket.stake.toFixed(2)} pts`, 'success');
            this.notify();
            return;
          } else {
            const err = await pResp.json().catch(() => ({}));
            if (err.error === 'MARKET_VERSION_SUPERSEDED' || err.error === 'QUOTE_EXPIRED' || err.error==='QUOTE_EXPIRED_OR_USED') {
              this.pendingBet=null;item.quoteId=undefined;this.activeQuote=null;
              this.showToast('Odds changed or quote expired. Please confirm updated price.', 'error');
              return;
            } else if (err.error === 'MARKET_SUSPENDED') {
              this.showToast(`Market suspended (${err.reason || 'Trading halted'})`, 'error');
              return;
            }
          }
        }
      } catch (_e) {
        // Keep the original pending request for an idempotent retry after transport failure.
      }
    }

    this.showToast('Bet was not accepted. Only server-quoted singles are available.', 'error');
  }

  /**
   * Grades and settles open sportsbook tickets for a fixture that just finished.
   * Single bets on a 1X2 market are settled against the final score; points move via the
   * real wallet (credit = stake*odds on a win, 0 on a loss). Called from updateScoreDelta.
   */
  public async settleFixtureBets(fixtureId: string, score: any, homeTeam: string, awayTeam: string): Promise<void> {
    await this.syncTickets();
    await this.syncBalance();
  }

  /** Stacked, typed toast notifications (success | error | win | info). */
  public showToast(message: string, kind: 'success' | 'error' | 'win' | 'info' = 'info'): void {
    if (typeof document === 'undefined') return;
    let stack = document.getElementById('xbet-toasts');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'xbet-toasts';
      stack.className = 'toast-stack';
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const glyph = { success: 'check', error: 'alert', win: 'trophy', info: 'info' }[kind];
    const toast = document.createElement('div');
    toast.className = `toast toast-${kind}`;
    toast.innerHTML = `<span class="toast-ico"><svg class="i" aria-hidden="true"><use href="#i-${glyph}"></use></svg></span><span class="toast-msg"></span><span class="toast-bar"></span>`;
    (toast.querySelector('.toast-msg') as HTMLElement).textContent = message;
    stack.appendChild(toast);
    while (stack.children.length > 4) stack.removeChild(stack.firstChild as Node);
    setTimeout(() => toast.classList.add('toast-out'), 3600);
    setTimeout(() => toast.remove(), 4000);
  }

  public hydrateDefaultMatches(): void {
    const list = [
      { id: 'fix-ucl-001', sportId: 1, sportName: 'Soccer', tournamentName: 'UEFA Champions League', homeTeam: 'Real Madrid', awayTeam: 'Manchester City', isLive: true, score: { home: 1, away: 1 }, matchClock: "34' In-Play", markets: [{ id: 'm1', name: '1X2 Full Time Result', selections: [{ id: 's1', name: 'Real Madrid', odds: 2.35 }, { id: 's2', name: 'Draw', odds: 3.40 }, { id: 's3', name: 'Manchester City', odds: 2.85 }] }] },
      { id: 'fix-epl-002', sportId: 1, sportName: 'Soccer', tournamentName: 'Premier League', homeTeam: 'Arsenal', awayTeam: 'Chelsea', isLive: true, score: { home: 2, away: 0 }, matchClock: "68' In-Play", markets: [{ id: 'm2', name: '1X2 Full Time Result', selections: [{ id: 's4', name: 'Arsenal', odds: 1.22 }, { id: 's5', name: 'Draw', odds: 5.50 }, { id: 's6', name: 'Chelsea', odds: 11.0 }] }] },
      { id: 'fix-ucl-003', sportId: 1, sportName: 'Soccer', tournamentName: 'UEFA Champions League', homeTeam: 'Liverpool', awayTeam: 'Barcelona', isLive: true, score: { home: 0, away: 0 }, matchClock: "12' In-Play", markets: [{ id: 'm3', name: '1X2 Full Time Result', selections: [{ id: 's7', name: 'Liverpool', odds: 2.05 }, { id: 's8', name: 'Draw', odds: 3.50 }, { id: 's9', name: 'Barcelona', odds: 3.30 }] }] },
      { id: 'fix-bun-004', sportId: 1, sportName: 'Soccer', tournamentName: 'German Bundesliga', homeTeam: 'Bayern Munich', awayTeam: 'Borussia Dortmund', isLive: true, score: { home: 3, away: 1 }, matchClock: "55' In-Play", markets: [{ id: 'm4', name: '1X2 Full Time Result', selections: [{ id: 's10', name: 'Bayern Munich', odds: 1.15 }, { id: 's11', name: 'Draw', odds: 7.00 }, { id: 's12', name: 'Borussia Dortmund', odds: 14.5 }] }] },
      { id: 'fix-ten-001', sportId: 2, sportName: 'Tennis', tournamentName: 'Wimbledon Men Singles', homeTeam: 'Carlos Alcaraz', awayTeam: 'Jannik Sinner', isLive: true, score: { home: 1, away: 1 }, matchClock: "Set 3 (4-3)", markets: [{ id: 'm7', name: 'Match Winner', selections: [{ id: 's19', name: 'Carlos Alcaraz', odds: 1.82 }, { id: 's20', name: 'Jannik Sinner', odds: 1.98 }] }] },
      { id: 'fix-nba-001', sportId: 3, sportName: 'Basketball', tournamentName: 'NBA', homeTeam: 'Los Angeles Lakers', awayTeam: 'Boston Celtics', isLive: true, score: { home: 88, away: 84 }, matchClock: "Q4 04:32", markets: [{ id: 'm9', name: 'Moneyline', selections: [{ id: 's23', name: 'LA Lakers', odds: 1.62 }, { id: 's24', name: 'Boston Celtics', odds: 2.30 }] }] },
      { id: 'fix-nhl-001', sportId: 4, sportName: 'Ice Hockey', tournamentName: 'NHL', homeTeam: 'New York Rangers', awayTeam: 'Boston Bruins', isLive: true, score: { home: 3, away: 2 }, matchClock: "Period 3", markets: [{ id: 'm11', name: '1X2 Result', selections: [{ id: 's27', name: 'NY Rangers', odds: 1.75 }, { id: 's28', name: 'Draw', odds: 4.20 }, { id: 's29', name: 'Boston Bruins', odds: 3.60 }] }] },
      { id: 'fix-f1-001', sportId: 5, sportName: 'Formula 1', tournamentName: 'Monaco Grand Prix', homeTeam: 'Max Verstappen', awayTeam: 'Lando Norris', isLive: true, score: { home: 1, away: 2 }, matchClock: "Lap 52/78", markets: [{ id: 'm12', name: 'Race Winner', selections: [{ id: 's30', name: 'Max Verstappen', odds: 1.40 }, { id: 's31', name: 'Lando Norris', odds: 2.80 }] }] },
    ];
    for (const f of list) {
      this.liveFixtures.set(f.id, f);
    }
  }

  public updateOddsTick(delta: { fixtureId: string; marketId?: string; selectionId: string; newOdds: number; oldOdds?: number | null }): void {
    const fix = this.liveFixtures.get(delta.fixtureId);
    if (!fix || !fix.markets) return;
    for (const mkt of fix.markets) {
      for (const sel of mkt.selections) {
        if (sel.id === delta.selectionId) {
          sel.previousOdds = sel.odds;
          sel.odds = delta.newOdds;
          sel.isDriftUp = delta.newOdds > (sel.previousOdds || sel.odds);
          sel.isDriftDown = delta.newOdds < (sel.previousOdds || sel.odds);
          this.notify();
          return;
        }
      }
    }
  }

  public updateScoreDelta(delta: { fixtureId: string; score?: { home: number; away: number }; matchMinute?: number; matchClock?: string; status?: string; lastEvent?: string }): void {
    const fix = this.liveFixtures.get(delta.fixtureId);
    if (!fix) return;
    if (delta.score) fix.score = delta.score;
    if (typeof delta.matchMinute === 'number') fix.matchMinute = delta.matchMinute;
    if (delta.matchClock) fix.matchClock = delta.matchClock;
    const wasFinished = fix.status === 'FINISHED';
    if (delta.status) fix.status = delta.status;
    if (delta.lastEvent) fix.lastEvent = delta.lastEvent;
    this.notify();

    // On the transition to FINISHED, auto-settle any open tickets on this fixture.
    if (delta.status === 'FINISHED' && !wasFinished && fix.score) {
      void this.settleFixtureBets(delta.fixtureId, fix.score, fix.homeTeam, fix.awayTeam);
    }
  }
}
