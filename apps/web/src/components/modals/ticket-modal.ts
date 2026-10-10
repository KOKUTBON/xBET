/**
 * Ticket Receipt Modal Component
 *
 * Thermal-receipt style view of a placed or looked-up ticket, mirroring the
 * ESC/POS slip printed by retail terminals.
 */

import { AppStateManager, formatOddsValue } from '../../state/app-state.ts';
import { icon, esc, fmtPts } from '../../ui/icons.ts';

export class TicketModalComponent {
  /** Decorative barcode derived from the ticket number (visual only). */
  private static barcode(code: string): string {
    let x = 0;
    const bars: string[] = [];
    for (let i = 0; i < code.length * 3; i++) {
      const c = code.charCodeAt(i % code.length) + i;
      const w = (c % 3) + 1;
      if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="40"/>`);
      x += w + 1;
    }
    return `<svg class="barcode" viewBox="0 0 ${x} 40" preserveAspectRatio="none" aria-hidden="true">${bars.join('')}</svg>`;
  }

  public static render(appState: AppStateManager): string {
    const t = appState.activePrintTicket;
    if (!t) return '';
    const tone = t.status === 'WON' ? 'won' : t.status === 'LOST' ? 'lost' : t.status === 'CASHED OUT' ? 'cashed' : 'open';
    const legTone = (s: string) => (s === 'WON' ? 'won' : s === 'LOST' ? 'lost' : 'open');

    return `
      <div class="modal-backdrop" onclick="if (event.target === this) window.appState.closePrintTicket()">
        <div class="receipt-wrap" role="dialog" aria-modal="true" aria-label="Ticket ${esc(t.slipNumber)}">
          <div class="receipt">
            <div class="receipt-brand"><span class="brand-mark">${icon('logo')}</span><span>xBET · Points ticket</span></div>
            <div class="receipt-row"><span>Ticket</span><b class="mono">${esc(t.slipNumber)}</b></div>
            <div class="receipt-row"><span>Type</span><b>${esc(t.betType)}</b></div>
            <div class="receipt-row"><span>Status</span><b class="status status-${tone}">${esc(t.status)}</b></div>
            ${t.placedAt ? `<div class="receipt-row"><span>Placed</span><b class="mono">${esc(new Date(t.placedAt).toLocaleString())}</b></div>` : ''}
            <hr/>
            ${t.legs.map((l) => `
              <div class="receipt-leg">
                <div class="receipt-row"><b>${esc(l.selectionName)}</b><b class="mono">${formatOddsValue(l.lockedOdds, appState.oddsFormat)}</b></div>
                <small>${l.marketName ? `${esc(l.marketName)} · ` : ''}${esc(l.fixtureName)}</small>
                ${l.result || (l.status && l.status !== 'OPEN' && l.status !== 'LIVE') ? `<div class="receipt-row"><small>${esc(l.result || '')}</small><b class="status status-${legTone(l.status)}">${esc(l.status)}</b></div>` : ''}
              </div>`).join('')}
            <hr/>
            <div class="receipt-row"><span>Stake</span><b class="mono">${fmtPts(t.stake)} pts</b></div>
            <div class="receipt-row"><span>Total odds</span><b class="mono">${formatOddsValue(t.totalOdds, appState.oddsFormat)}</b></div>
            <div class="receipt-row receipt-total"><span>Potential return</span><b class="mono">${fmtPts(t.potentialPayout)} pts</b></div>
            ${typeof t.returned === 'number' && t.status !== 'OPEN' ? `<div class="receipt-row receipt-total"><span>Returned</span><b class="mono">${fmtPts(t.returned)} pts</b></div>` : ''}
            ${this.barcode(t.slipNumber)}
            <div class="receipt-code mono">${esc(t.id)}</div>
          </div>
          <div class="receipt-actions">
            <button type="button" class="btn btn-ghost" onclick="window.print()">${icon('printer')}Print</button>
            <button type="button" class="btn btn-volt" onclick="window.appState.closePrintTicket()">${icon('check')}Done</button>
          </div>
        </div>
      </div>`;
  }
}
