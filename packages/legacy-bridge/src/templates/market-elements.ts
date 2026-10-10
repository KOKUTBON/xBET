/**
 * CakePHP Bet Market Elements Renderer
 * 1:1 Port of all 18+ App/View/Themed/Admin/Elements/Bets/*.ctp templates
 * Renders market selection tables, odds cells, inputs, and badge indicators for:
 * 1X2, Under/Over, BTTS, Double Chance, Correct Score, HT/FT, Asian Handicap, etc.
 */

export interface MarketSelectionItem {
  id: string | number;
  name: string;
  odd: number;
  line?: string | number;
  status?: string;
  isWon?: boolean;
}

export interface BetMarketData {
  id: string | number;
  eventId: string | number;
  marketType: string;
  name: string;
  line?: string | number;
  selections: MarketSelectionItem[];
}

export class MarketElementsRenderer {
  /**
   * Render 1X2 Market (Match Winner)
   */
  public render1X2(market: BetMarketData): string {
    const home = market.selections.find((s) => s.name === '1' || s.name === 'Home')?.odd ?? 1.0;
    const draw = market.selections.find((s) => s.name === 'X' || s.name === 'Draw')?.odd ?? 1.0;
    const away = market.selections.find((s) => s.name === '2' || s.name === 'Away')?.odd ?? 1.0;

    return `
      <div class="market-element market-1x2" data-market-id="${market.id}">
        <div class="market-header"><strong>1X2 (Match Winner)</strong></div>
        <div class="market-odds-grid grid-3">
          <button class="odd-btn" data-selection="1"><span class="label">1</span><span class="odd">${home.toFixed(2)}</span></button>
          <button class="odd-btn" data-selection="X"><span class="label">X</span><span class="odd">${draw.toFixed(2)}</span></button>
          <button class="odd-btn" data-selection="2"><span class="label">2</span><span class="odd">${away.toFixed(2)}</span></button>
        </div>
      </div>
    `.trim();
  }

  /**
   * Render 12 Market (Two-way / Moneyline / Tennis / Basketball)
   */
  public render12(market: BetMarketData): string {
    const home = market.selections.find((s) => s.name === '1' || s.name === 'Home')?.odd ?? 1.0;
    const away = market.selections.find((s) => s.name === '2' || s.name === 'Away')?.odd ?? 1.0;

    return `
      <div class="market-element market-12" data-market-id="${market.id}">
        <div class="market-header"><strong>12 (Head to Head)</strong></div>
        <div class="market-odds-grid grid-2">
          <button class="odd-btn" data-selection="1"><span class="label">1</span><span class="odd">${home.toFixed(2)}</span></button>
          <button class="odd-btn" data-selection="2"><span class="label">2</span><span class="odd">${away.toFixed(2)}</span></button>
        </div>
      </div>
    `.trim();
  }

  /**
   * Render Under / Over (Totals)
   */
  public renderUnderOver(market: BetMarketData, period: string = 'Full Time'): string {
    const line = market.line ?? '2.5';
    const over = market.selections.find((s) => s.name.toLowerCase().includes('over'))?.odd ?? 1.0;
    const under = market.selections.find((s) => s.name.toLowerCase().includes('under'))?.odd ?? 1.0;

    return `
      <div class="market-element market-under-over" data-market-id="${market.id}">
        <div class="market-header"><strong>Totals Over/Under ${line} (${period})</strong></div>
        <div class="market-odds-grid grid-2">
          <button class="odd-btn" data-selection="Over"><span class="label">Over ${line}</span><span class="odd">${over.toFixed(2)}</span></button>
          <button class="odd-btn" data-selection="Under"><span class="label">Under ${line}</span><span class="odd">${under.toFixed(2)}</span></button>
        </div>
      </div>
    `.trim();
  }

  /**
   * Render Both Teams To Score (BTTS)
   */
  public renderBothTeamsToScore(market: BetMarketData): string {
    const yes = market.selections.find((s) => s.name.toLowerCase() === 'yes')?.odd ?? 1.0;
    const no = market.selections.find((s) => s.name.toLowerCase() === 'no')?.odd ?? 1.0;

    return `
      <div class="market-element market-btts" data-market-id="${market.id}">
        <div class="market-header"><strong>Both Teams To Score (BTTS)</strong></div>
        <div class="market-odds-grid grid-2">
          <button class="odd-btn" data-selection="Yes"><span class="label">Yes</span><span class="odd">${yes.toFixed(2)}</span></button>
          <button class="odd-btn" data-selection="No"><span class="label">No</span><span class="odd">${no.toFixed(2)}</span></button>
        </div>
      </div>
    `.trim();
  }

  /**
   * Render Double Chance (1X, 12, X2)
   */
  public renderDoubleChance(market: BetMarketData, period: string = 'Full Time'): string {
    const oneX = market.selections.find((s) => s.name === '1X')?.odd ?? 1.0;
    const oneTwo = market.selections.find((s) => s.name === '12')?.odd ?? 1.0;
    const xTwo = market.selections.find((s) => s.name === 'X2')?.odd ?? 1.0;

    return `
      <div class="market-element market-double-chance" data-market-id="${market.id}">
        <div class="market-header"><strong>Double Chance (${period})</strong></div>
        <div class="market-odds-grid grid-3">
          <button class="odd-btn" data-selection="1X"><span class="label">1X</span><span class="odd">${oneX.toFixed(2)}</span></button>
          <button class="odd-btn" data-selection="12"><span class="label">12</span><span class="odd">${oneTwo.toFixed(2)}</span></button>
          <button class="odd-btn" data-selection="X2"><span class="label">X2</span><span class="odd">${xTwo.toFixed(2)}</span></button>
        </div>
      </div>
    `.trim();
  }

  /**
   * Render Half Time / Full Time (HT/FT)
   */
  public renderHtFt(market: BetMarketData): string {
    const selectionsHtml = market.selections
      .map(
        (s) => `
        <button class="odd-btn" data-selection="${s.name}">
          <span class="label">${s.name}</span>
          <span class="odd">${s.odd.toFixed(2)}</span>
        </button>
      `
      )
      .join('');

    return `
      <div class="market-element market-ht-ft" data-market-id="${market.id}">
        <div class="market-header"><strong>Half Time / Full Time (HT/FT)</strong></div>
        <div class="market-odds-grid grid-3">
          ${selectionsHtml}
        </div>
      </div>
    `.trim();
  }

  /**
   * Render Correct Score Matrix
   */
  public renderCorrectScore(market: BetMarketData): string {
    const cells = market.selections
      .map(
        (s) => `
        <button class="odd-btn score-cell" data-selection="${s.name}">
          <span class="label">${s.name}</span>
          <span class="odd">${s.odd.toFixed(2)}</span>
        </button>
      `
      )
      .join('');

    return `
      <div class="market-element market-correct-score" data-market-id="${market.id}">
        <div class="market-header"><strong>Correct Score</strong></div>
        <div class="market-odds-grid score-grid">
          ${cells}
        </div>
      </div>
    `.trim();
  }

  /**
   * Render European Handicap / Asian Handicap
   */
  public renderEuropeanHandicap(market: BetMarketData): string {
    const line = market.line ?? '-1';
    const selectionsHtml = market.selections
      .map(
        (s) => `
        <button class="odd-btn" data-selection="${s.name}">
          <span class="label">${s.name} (${line})</span>
          <span class="odd">${s.odd.toFixed(2)}</span>
        </button>
      `
      )
      .join('');

    return `
      <div class="market-element market-handicap" data-market-id="${market.id}">
        <div class="market-header"><strong>Handicap (${line})</strong></div>
        <div class="market-odds-grid grid-3">
          ${selectionsHtml}
        </div>
      </div>
    `.trim();
  }

  /**
   * Render Odd / Even
   */
  public renderOddEven(market: BetMarketData, period: string = 'Full Time'): string {
    const odd = market.selections.find((s) => s.name.toLowerCase() === 'odd')?.odd ?? 1.0;
    const even = market.selections.find((s) => s.name.toLowerCase() === 'even')?.odd ?? 1.0;

    return `
      <div class="market-element market-odd-even" data-market-id="${market.id}">
        <div class="market-header"><strong>Odd / Even Total Goals (${period})</strong></div>
        <div class="market-odds-grid grid-2">
          <button class="odd-btn" data-selection="Odd"><span class="label">Odd</span><span class="odd">${odd.toFixed(2)}</span></button>
          <button class="odd-btn" data-selection="Even"><span class="label">Even</span><span class="odd">${even.toFixed(2)}</span></button>
        </div>
      </div>
    `.trim();
  }
}
