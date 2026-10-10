/**
 * Legal / Help Pages Component
 *
 * Responsible gambling, support, terms, privacy, FAQ and betting rules,
 * rendered as a document with a section navigator.
 */

import { AppStateManager } from '../../state/app-state.ts';
import { icon } from '../../ui/icons.ts';

export type LegalPageSlug = 'responsible_gambling' | 'support' | 'terms' | 'privacy' | 'faq' | 'rules';

const PAGES: Array<{ id: LegalPageSlug; label: string; ico: string }> = [
  { id: 'responsible_gambling', label: 'Responsible gambling', ico: 'shield' },
  { id: 'support', label: 'Support', ico: 'headset' },
  { id: 'terms', label: 'Terms & conditions', ico: 'receipt' },
  { id: 'privacy', label: 'Privacy policy', ico: 'lock' },
  { id: 'faq', label: 'FAQ', ico: 'help' },
  { id: 'rules', label: 'Betting rules', ico: 'flag' },
];

export class LegalModalComponent {
  public static currentPage: LegalPageSlug = 'responsible_gambling';

  public static setPage(page: LegalPageSlug): void {
    this.currentPage = page;
  }

  public static render(_appState: AppStateManager, page?: LegalPageSlug): string {
    const active = page || this.currentPage;

    return `
      <div class="doc legal-page-container">
        <nav class="doc-nav" aria-label="Help &amp; legal">
          <button type="button" class="btn btn-ghost btn-sm doc-back" onclick="window.appState.setActiveTab('sports')">${icon('arrow-left')}Sportsbook</button>
          ${PAGES.map((p) => `
            <button type="button" class="doc-link ${active === p.id ? 'is-active' : ''}" onclick="window._openLegalPage('${p.id}')">${icon(p.ico)}<span>${p.label}</span></button>
          `).join('')}
        </nav>
        <article class="doc-body">
          ${this.renderPageContent(active)}
        </article>
      </div>
    `;
  }

  private static renderPageContent(page: LegalPageSlug): string {
    switch (page) {
      case 'responsible_gambling':
        return `
          <span class="eyebrow">${icon('shield')}Player protection</span>
          <h1>Responsible gambling</h1>
          <p class="lead">xBET is a points-only research platform, but it is built with the same player-protection patterns a regulated operator needs.</p>
          <div class="callout callout-danger">
            <span class="age-badge age-badge-lg">18+</span>
            <div><strong>Underage gambling is strictly prohibited.</strong><p>You must be 18 years or older to open an account and take part in betting.</p></div>
          </div>
          <div class="feature-list">
            <div>${icon('wallet')}<strong>Deposit limits</strong><p>Cap how many points you can add per day, week or month.</p></div>
            <div>${icon('clock')}<strong>Session timeouts</strong><p>Reality checks and automatic logout after a set period of play.</p></div>
            <div>${icon('lock')}<strong>Self-exclusion</strong><p>Take a break from all products for a period you choose.</p></div>
          </div>
        `;

      case 'support':
        return `
          <span class="eyebrow">${icon('headset')}Help centre</span>
          <h1>Contact support</h1>
          <p class="lead">Questions about your account, tickets or points? Reach the team through any channel below.</p>
          <div class="feature-list">
            <div>${icon('at-sign')}<strong>Email</strong><p>support@example.com</p></div>
            <div>${icon('headset')}<strong>Live chat</strong><p>Available 24/7</p></div>
            <div>${icon('receipt')}<strong>Support ticket</strong><p><button type="button" class="btn btn-volt btn-sm" onclick="window.appState.showToast('Support ticket created', 'success')">Open a ticket</button></p></div>
          </div>
        `;

      case 'terms':
        return `
          <span class="eyebrow">${icon('receipt')}Legal</span>
          <h1>Terms and conditions</h1>
          <p class="lead">By registering and placing bets, you agree to all terms, account rules and settlement regulations.</p>
          <ol class="doc-list">
            <li>Accounts are strictly personal and non-transferable.</li>
            <li>Odds are subject to market fluctuations until ticket acceptance.</li>
            <li>Winnings are automatically credited to your balance upon official match settlement.</li>
            <li>Points have no cash value and cannot be withdrawn or exchanged.</li>
          </ol>
        `;

      case 'privacy':
        return `
          <span class="eyebrow">${icon('lock')}Legal</span>
          <h1>Privacy policy</h1>
          <p class="lead">We take your privacy seriously. Your data is encrypted and protected in accordance with international data protection standards.</p>
        `;

      case 'faq':
        return `
          <span class="eyebrow">${icon('help')}Help centre</span>
          <h1>Frequently asked questions</h1>
          <div class="faq">
            <details open><summary>How do I place a combi bet?${icon('chevron-down')}</summary><p>Tap two or more selections from different events and the slip switches to Combi automatically. The combined odds are the product of every leg.</p></details>
            <details><summary>How do reservation tickets work?${icon('chevron-down')}</summary><p>Every placed ticket gets an ID. Enter it in the reservation box under the bet slip to pull up the receipt at any time.</p></details>
            <details><summary>What does “provably fair” mean?${icon('chevron-down')}</summary><p>Each casino round is generated with a deterministic HMAC-SHA256 scheme, so players and auditors can independently verify the outcome after the round.</p></details>
            <details><summary>Is live dealer available?${icon('chevron-down')}</summary><p>The live studio is included as an integration pattern only — no external studio is connected in this project.</p></details>
          </div>
        `;

      case 'rules':
        return `
          <span class="eyebrow">${icon('flag')}Settlement</span>
          <h1>General betting rules</h1>
          <ul class="doc-list">
            <li><strong>Soccer:</strong> All match markets are based on the result at the end of scheduled 90 minutes regulation time unless otherwise stated.</li>
            <li><strong>Tennis:</strong> If a match starts but is not completed, all bets are settled based on tournament rules.</li>
            <li><strong>Basketball:</strong> Overtime is included for match winner and totals unless 2-Way Regular Time is specified.</li>
          </ul>
        `;

      default:
        return '<p>Page content not found.</p>';
    }
  }
}
