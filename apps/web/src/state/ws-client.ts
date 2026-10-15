import { AppStateManager } from './app-state.ts';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private appState: AppStateManager;
  private reconnectTimer: any = null;

  constructor(appState: AppStateManager) {
    this.appState = appState;
  }

  public connect(url: string = typeof location === 'undefined' ? 'ws://127.0.0.1:4000/ws' : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`): void {
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[WebSocket Client] Connected to Live Odds Stream!');
        this.appState.feedConnected = true;
        this.appState.notify();
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (e) {
          console.error('[WebSocket Client] Failed to parse message:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[WebSocket Client] Disconnected. Reconnecting in 3s...');
        if (this.appState.feedConnected) {
          this.appState.feedConnected = false;
          this.appState.notify();
        }
        this.scheduleReconnect(url);
      };

      this.ws.onerror = (err) => {
        console.warn('[WebSocket Client] Connection error:', err);
      };
    } catch (e) {
      console.warn('[WebSocket Client] Init error, will retry:', e);
      this.scheduleReconnect(url);
    }
  }

  public handleMessage(msg: any): void {
    if (msg.type === 'WELCOME' && msg.liveMatches) {
      this.appState.liveFixtures.clear();
      for (const match of msg.liveMatches) {
        this.appState.liveFixtures.set(match.id, match);
      }
      this.appState.notify();
    } else if (msg.type === 'ODDS_TICK' && msg.data) {
      this.appState.updateOddsTick(msg.data);
      this.flashOddsElement(msg.data.selectionId, msg.data.newOdds, msg.data.oldOdds);
    } else if (msg.type === 'VERSIONED_QUOTE' && (msg.data || msg.quote)) {
      this.appState.applyVersionedQuote(msg.data || msg.quote);
    } else if (msg.type === 'MARKETS_SUSPENDED') {
      const fixtureId = msg.data?.fixtureId || msg.fixtureId;
      const reason = msg.data?.reason || msg.reason || 'Trading halted';
      if (fixtureId) this.appState.setMarketSuspended(fixtureId, true, reason);
    } else if (msg.type === 'MARKETS_UNSUSPENDED') {
      const fixtureId = msg.data?.fixtureId || msg.fixtureId;
      if (fixtureId) this.appState.setMarketSuspended(fixtureId, false);
    } else if (msg.type === 'SCORE_UPDATE' && msg.data) {
      this.appState.updateScoreDelta(msg.data);
    }
  }

  private flashOddsElement(selectionId: string, newOdds: number, oldOdds: number | null): void {
    if (typeof document === 'undefined') return;
    const elem = document.getElementById(`odd-btn-${selectionId}`);
    if (elem) {
      elem.classList.remove('flash-up', 'flash-down');
      void elem.offsetWidth; // Trigger reflow
      if (oldOdds !== null && newOdds > oldOdds) {
        elem.classList.add('flash-up');
      } else if (oldOdds !== null && newOdds < oldOdds) {
        elem.classList.add('flash-down');
      }
    }
  }

  private scheduleReconnect(url: string): void {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect(url);
      }, 3000);
    }
  }
}
