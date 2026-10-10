import { AppStateManager } from '../../state/app-state.ts';
import { icon } from '../../ui/icons.ts';

export class LoginModalComponent {
  public static render(state: AppStateManager): string {
    if (!state.showLoginModal) return '';
    return `<div class="modal-backdrop" onclick="if(event.target===this)window.appState.toggleLoginModal(false)">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="login-modal-title" style="max-width:440px">
        <header class="modal-h"><span class="modal-ico">${icon('lock')}</span><h2 id="login-modal-title">Sign in</h2>
        <button class="icon-btn" onclick="window.appState.toggleLoginModal(false)" aria-label="Close">${icon('x')}</button></header>
        <form onsubmit="event.preventDefault();window.appState.login(document.getElementById('login-username').value,document.getElementById('login-password').value).then(ok=>{if(ok)window.appState.toggleLoginModal(false)})">
          <label for="login-username">Username</label><input class="input" id="login-username" autocomplete="username" required minlength="3" maxlength="40">
          <label for="login-password">Password</label><input class="input" id="login-password" type="password" autocomplete="current-password" required minlength="12" maxlength="256">
          <p>Points pilot. Use your assigned account or create a player account.</p>
          <button class="btn btn-volt" type="submit">Sign in</button>
          <button class="btn btn-ghost" type="button" onclick="window.appState.login(document.getElementById('login-username').value,document.getElementById('login-password').value,true).then(ok=>{if(ok)window.appState.toggleLoginModal(false)})">Create player account</button>
        </form>
      </div></div>`;
  }
}
