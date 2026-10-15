/**
 * Betslip Component
 *
 * Single / combi slip with quick-stake chips, live return calculation,
 * reservation-ticket lookup and a history of placed tickets.
 */

import { AppStateManager, formatOddsValue } from '../state/app-state.ts';
import { icon, esc, jsq, fmtPts } from '../ui/icons.ts';
import { DemoPanels } from '../demo/demo-panels.ts';

export class BetslipComponent {
  private static statusTone(status: string): string {
    if (status === 'WON') return 'won';
    if (status === 'LOST') return 'lost';
    if (status === 'CASHED OUT') return 'cashed';
    return 'open';
  }

  public static render(appState: AppStateManager): string {
    const items = Array.from(appState.slipItems.values());
    const itemCount = items.length;
    const isCombi = appState.slipType === 'COMBI' && itemCount > 1;

    // Combi: one stake at the product of all legs. Several singles: the stake is placed on each selection.
    const combiOdds = items.reduce((acc, item) => acc * item.odds, 1.0);
    const multiSingles = !isCombi && itemCount > 1;
    const totalStake = multiSingles ? appState.stakeAmount * itemCount : appState.stakeAmount;
    const totalPotentialPayout = (multiSingles ? items.reduce((acc, item) => acc + appState.stakeAmount * item.odds, 0) : appState.stakeAmount * combiOdds).toFixed(2);
    const insufficient = totalStake > appState.userBalance;
    const sameMatch = isCombi && new Set(items.map((item) => item.fixtureId)).size < itemCount;

    const empty = `
      <div class="slip-empty betslip-empty">
        <svg class="slip-empty-art" viewBox="0 0 120 84" aria-hidden="true">
          <rect x="18" y="14" width="84" height="56" rx="8" class="se-card"/>
          <path d="M18 34a8 8 0 0 0 0 16M102 34a8 8 0 0 1 0 16" class="se-notch"/>
          <path d="M72 18v6M72 30v6M72 42v6M72 54v6" class="se-perf"/>
          <rect x="28" y="28" width="30" height="5" rx="2.5" class="se-line"/>
          <rect x="28" y="40" width="22" height="5" rx="2.5" class="se-line"/>
          <circle cx="88" cy="58" r="13" class="se-plus-bg"/><path d="M88 52v12M82 58h12" class="se-plus"/>
        </svg>
        <h3>Your slip is empty</h3>
        <p>${appState.restrictedPilot ? 'Choose one football selection. The points pilot supports singles only.' : 'Choose prices to build a single or combi bet.'}</p>
        <ol class="slip-steps">
          <li><b>1</b>Pick a price</li>
          <li><b>2</b>Set your stake</li>
          <li><b>3</b>Place the bet</li>
        </ol>
      </div>`;

    const filled = `
      <div class="seg-group slip-mode" role="tablist">
        <button type="button" class="seg ${appState.slipType === 'SINGLE' ? 'is-active' : ''}" onclick="window.appState.setSlipType('SINGLE')">Single</button>
        <button type="button" class="seg ${appState.slipType === 'COMBI' ? 'is-active' : ''}" onclick="window.appState.setSlipType('COMBI')" ${appState.restrictedPilot || itemCount < 2 ? 'disabled' : ''}>Combi <b class="mono">${itemCount}</b></button>
      </div>

      <ul class="slip-legs ${isCombi ? 'is-combi' : ''}">
        ${items.map((item) => `
          <li class="slip-leg slip-item">
            <span class="leg-node" aria-hidden="true"></span>
            <div class="leg-body">
              <div class="leg-top">
                <strong class="leg-pick">${esc(item.selectionName)}</strong>
                <span class="leg-odds mono ${(item as any).previousOdds ? ((item as any).previousOdds < item.odds ? 'is-up' : 'is-down') : ''}">${(item as any).previousOdds && (item as any).previousOdds !== item.odds ? icon((item as any).previousOdds < item.odds ? 'caret-up' : 'caret-down') : ''}${formatOddsValue(item.odds, appState.oddsFormat)}</span>
              </div>
              <div class="leg-market">
                ${esc(item.marketName)}
                ${item.marketVersion ? `<span class="tag mono" style="font-size: 0.65rem; padding: 1px 4px; background: rgba(255,255,255,0.08); border-radius: 3px; margin-left: 4px;">v${item.marketVersion}</span>` : ''}
                ${item.status === 'SUSPENDED' ? `<span class="status status-lost" style="font-size: 0.65rem; margin-left: 4px;">LOCKED</span>` : ''}
              </div>
              <div class="leg-fixture">${esc(item.fixtureName)}</div>
            </div>
            <button type="button" class="leg-remove" onclick="window.appState.removeSelection('${jsq(item.selectionId)}')" aria-label="Remove selection">${icon('x')}</button>
          </li>`).join('')}
      </ul>

      <div class="slip-stake">
        <label class="field-label" for="total-stake">
          <span>Stake</span>
          <span class="muted">Balance <b class="mono">${fmtPts(appState.userBalance)}</b></span>
        </label>
        <div class="stake-field ${insufficient ? 'is-error' : ''}">
          ${icon('coins')}
          <input type="number" id="total-stake" class="stake-input mono" value="${appState.stakeAmount}" min="1" max="5000" step="5" inputmode="decimal"
            onchange="window.appState.setStake(parseFloat(this.value) || 10)"
            oninput="window.appState.setStake(parseFloat(this.value) || 10)" />
          <span class="stake-unit">pts</span>
        </div>
        <div class="stake-chips">
          ${[10, 25, 50, 100].map((v) => `<button type="button" class="stake-chip" onclick="window.appState.addQuickStake(${v})">+${v}</button>`).join('')}
          <button type="button" class="stake-chip stake-chip-max" onclick="window.appState.setMaxStake()">Max</button>
        </div>
        ${insufficient ? `<p class="field-error">${icon('alert')}${multiSingles ? `${itemCount} singles need ${fmtPts(totalStake)} pts` : 'Stake exceeds your balance'}</p>` : ''}
        ${sameMatch ? `<p class="field-error">${icon('alert')}Combis need one selection per match. Use singles or remove a pick.</p>` : ''}
      </div>

      <dl class="slip-summary">
        ${multiSingles
          ? `<div><dt>Singles · ${itemCount} bets</dt><dd class="mono">${fmtPts(totalStake)}<i>pts</i></dd></div>`
          : `<div><dt>${isCombi ? `Combi odds · ${itemCount} legs` : 'Total odds'}</dt><dd class="mono">${formatOddsValue(combiOdds, appState.oddsFormat)}</dd></div>`}
        <div class="summary-return payout-summary-row"><dt>Potential return</dt><dd class="mono">${fmtPts(Number(totalPotentialPayout))}<i>pts</i></dd></div>
      </dl>

      ${appState.activeQuote ? `
        <div class="slip-quote-status" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); border-radius: 6px; margin-bottom: 8px; font-size: 0.78rem;">
          <span style="color: #10b981; display: flex; align-items: center; gap: 5px;">
            <span style="width: 7px; height: 7px; border-radius: 50%; background: #10b981; display: inline-block;"></span>
            <strong>Quote #${appState.activeQuote.quoteId.slice(0, 8)} locked</strong>
          </span>
          <span class="mono" style="color: #facc15; font-weight: bold;">
            ${appState.quoteCountdownSeconds}s remaining
          </span>
        </div>
      ` : ''}

      ${!appState.isAuthenticated ? `
        <div class="slip-auth-banner" style="background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; font-size: 0.8rem; display: flex; align-items: center; justify-content: space-between;">
          <span style="color: #f87171;">Sign in to lock quotes &amp; place bets</span>
          <button type="button" class="btn btn-volt btn-sm" onclick="window.appState.toggleLoginModal(true)">Sign In</button>
        </div>
      ` : ''}

      <button type="button" id="betslip-place" class="btn btn-volt btn-block btn-lg btn-place-bet"
        onclick="${!appState.isAuthenticated ? 'window.appState.toggleLoginModal(true)' : 'window.appState.placeSlipBet()'}"
        ${insufficient || sameMatch || appState.isRequestingQuote ? 'disabled' : ''}>
        <span>${!appState.isAuthenticated ? 'Sign in to place' : (appState.isRequestingQuote ? 'Locking quote...' : (appState.restrictedPilot && !appState.activeQuote ? 'Lock price' : 'Place bet'))}</span>
        <span class="mono btn-sub">${totalStake.toFixed(2)} pts</span>${icon('arrow-right')}
      </button>`;

    return `
      <div class="slip betslip-card">
        <header class="slip-head betslip-header">
          <span class="slip-title">${icon('ticket')}Bet slip <b class="count-badge mono">${itemCount}</b></span>
          <span class="slip-head-actions">
            ${itemCount > 0 ? `<button type="button" class="link-btn link-danger" onclick="window.appState.clearSlip()">${icon('trash')}Clear</button>` : ''}
            <button type="button" class="icon-btn slip-close" onclick="window.xui.toggleSlip(false)" aria-label="Close bet slip">${icon('chevron-down')}</button>
          </span>
        </header>
        <div class="slip-body">${itemCount === 0 ? empty : filled}</div>
      </div>

      <div class="card reservation-ticket-card">
        <header class="card-h">${icon('receipt')}<span>Reservation ticket</span></header>
        <form class="inline-form" onsubmit="event.preventDefault(); window.appState.lookupReservationTicket(document.getElementById('TicketSearchForm-Input').value);">
          <input type="text" id="TicketSearchForm-Input" class="input mono reservation-search-input" placeholder="TKT-000000" aria-label="Ticket ID" />
          <button type="submit" class="btn btn-ghost reservation-search-btn">${icon('search')}Find</button>
        </form>
      </div>

      ${appState.demoMode ? DemoPanels.myBets(appState as any) + DemoPanels.controls(appState as any) : appState.myTickets.length > 0 ? `
        <div class="card" id="ticketsHistory-block">
          <header class="card-h">${icon('layers')}<span>My tickets</span><b class="count-badge mono">${appState.myTickets.length}</b></header>
          <div class="stubs">
            ${appState.myTickets.slice(0, 4).map((t) => `
              <button type="button" class="stub stub-${this.statusTone(t.status)}" onclick="window.appState.openPrintTicket(window.appState.myTickets.find(function (x) { return x.id === '${jsq(t.id)}'; }))">
                <span class="stub-main">
                  <span class="stub-id mono">${esc(t.slipNumber)}</span>
                  <span class="stub-meta">${t.betType === 'COMBI' ? `Combi · ${t.legs.length} legs` : esc(t.legs[0]?.selectionName || 'Single')}</span>
                </span>
                <span class="stub-side">
                  <span class="status status-${this.statusTone(t.status)}">${esc(t.status.replace(' (IN-PLAY)', ''))}</span>
                  <span class="stub-amt mono">${fmtPts(t.stake)} → ${fmtPts(t.potentialPayout)}</span>
                </span>
              </button>`).join('')}
          </div>
        </div>` : ''}`;
  }
}
