/**
 * Cashier Modal Component
 *
 * Retail point-voucher terminal: issue a voucher (produce PIN) or redeem one
 * (consume PIN). Points only — vouchers carry no cash value.
 */

import { AppStateManager } from '../../state/app-state.ts';
import { icon, fmtPts } from '../../ui/icons.ts';
import { DemoPanels } from '../../demo/demo-panels.ts';

export class CashierModalComponent {
  public static voucherAmount: number = 50;

  public static render(appState: AppStateManager): string {
    if (!appState.showCashierModal) return '';

    if (appState.demoMode) return DemoPanels.wallet(appState as any);
    if(appState.restrictedPilot)return `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="Pilot points">
      <header class="modal-h"><h2>Pilot points</h2><button class="icon-btn" aria-label="Close" onclick="window.appState.toggleCashierModal(false)">${icon('x')}</button></header>
      <p>Balance: ${fmtPts(appState.userBalance)} PTS</p><p>Your administrator can grant pilot points. Vouchers, deposits and withdrawals are unavailable.</p>
    </div></div>`;
    return `
      <div class="modal-backdrop" onclick="if (event.target === this) window.appState.toggleCashierModal(false)">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="cashier-title">
          <header class="modal-h">
            <span class="modal-ico tone-volt">${icon('store')}</span>
            <div>
              <h2 id="cashier-title">Cashier terminal</h2>
              <p>Issue and redeem point vouchers</p>
            </div>
            <button type="button" class="icon-btn" onclick="window.appState.toggleCashierModal(false)" aria-label="Close">${icon('x')}</button>
          </header>

          <div class="balance-banner">
            <span>${icon('wallet')}Current balance</span>
            <strong class="mono">${fmtPts(appState.userBalance)}<i>pts</i></strong>
          </div>

          <section class="panel">
            <h3>${icon('printer')}Issue point voucher</h3>
            <div class="amount-grid">
              ${[25, 50, 100, 250].map((v) => `
                <button type="button" class="amount ${this.voucherAmount === v ? 'is-active' : ''}" onclick="CashierModalComponent.voucherAmount = ${v}; window.renderApp();">
                  <b class="mono">${v}</b><small>pts</small>
                </button>`).join('')}
            </div>
            <button type="button" class="btn btn-volt btn-block" onclick="window.appState.depositDemo(CashierModalComponent.voucherAmount); window.appState.showToast('Voucher PIN generated: VCH-' + Math.floor(1000 + Math.random() * 9000), 'info');">
              ${icon('voucher')}Produce voucher · <span class="mono">${this.voucherAmount} pts</span>
            </button>
          </section>

          <section class="panel">
            <h3>${icon('ticket')}Redeem voucher PIN</h3>
            <form class="inline-form" onsubmit="event.preventDefault(); var el = document.getElementById('voucher-pin-input-ts'); if (el.value) { window.appState.depositDemo(100); window.appState.showToast('Voucher ' + el.value + ' redeemed: +100 pts', 'success'); el.value = ''; } else { window.appState.showToast('Enter a voucher PIN', 'error'); }">
              <input type="text" id="voucher-pin-input-ts" class="input mono" placeholder="VCH-4821-9930" aria-label="Voucher PIN" />
              <button type="submit" class="btn btn-ghost">${icon('check')}Redeem</button>
            </form>
          </section>

          <p class="modal-foot">${icon('shield-check')}Demo terminal — vouchers are points only and have no cash value.</p>
        </div>
      </div>
    `;
  }
}
