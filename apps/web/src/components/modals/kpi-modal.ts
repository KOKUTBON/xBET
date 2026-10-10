import { AppStateManager } from '../../state/app-state.ts';
import { icon, esc, fmtPts } from '../../ui/icons.ts';
import { DemoPanels } from '../../demo/demo-panels.ts';

export class AccountKpiModalComponent {
  public static render(state: AppStateManager): string {
    if (!state.showKpiModal) return '';
    if (state.demoMode) return DemoPanels.account(state as any);
    const protection = state.accountProtection;
    const open = state.myTickets.filter(ticket => ticket.status.startsWith('OPEN')).length;
    return `<div class="modal-backdrop" onclick="if(event.target===this)window.appState.toggleKpiModal(false)">
      <div class="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="kpi-title">
        <header class="modal-h"><h2 id="kpi-title">${esc(state.username)} · Account</h2>
        <button class="icon-btn" onclick="window.appState.toggleKpiModal(false)" aria-label="Close">${icon('x')}</button></header>
        <div class="balance-banner"><span>Points balance</span><strong>${fmtPts(state.userBalance)} PTS</strong></div>
        <p>${state.myTickets.length} tickets · ${open} open. Pilot points are granted by an administrator.</p>
        <h3>Account protection</h3>
        ${protection ? `<p>Daily wager limit: ${fmtPts(protection.dailyWagerLimit)} PTS (UTC day, football and roulette combined).</p>
        <p>${protection.excludedUntil ? `Self-excluded until ${esc(protection.excludedUntil)}` : 'No active self-exclusion.'}</p>
        <form onsubmit="event.preventDefault();window.appState.updateProtection({dailyWagerLimit:Number(document.getElementById('daily-wager-limit').value)})">
          <label for="daily-wager-limit">Lower daily wager limit (PTS)</label>
          <input class="input" id="daily-wager-limit" type="number" min="0.01" step="0.01" max="${protection.dailyWagerLimit}" value="${protection.dailyWagerLimit}" required>
          <button class="btn btn-ghost" type="submit">Save lower limit</button>
        </form>
        <form onsubmit="event.preventDefault();window.appState.updateProtection({selfExcludeDays:Number(document.getElementById('exclude-days').value)})">
          <label for="exclude-days">Self-exclusion duration</label>
          <select class="input" id="exclude-days"><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option><option value="365">365 days</option></select>
          <p>Submitting blocks new wagers immediately. You cannot shorten this period or raise your saved limit during the pilot. History remains available.</p>
          <button class="btn btn-ghost" type="submit">Activate self-exclusion</button>
        </form>` : '<p>Loading account protection…</p>'}
      <button class="btn btn-ghost" onclick="window.appState.toggleKpiModal(false);window.appState.logout()">Sign out</button></div></div>`;
  }
}
