import { IncomingMessage } from 'http';
import { NativeWebSocketServer, NativeWebSocketClient } from './native-ws.ts';
import { LiveStateManager } from '../domain/live-state.ts';
import type { LiveOddsDelta, LiveScoreDelta } from '../domain/live-state.ts';

interface ClientSession {
  ws: NativeWebSocketClient;
  ip: string;
  subscriptions: Set<string>;
  connectedAt: Date;
}

export interface GatewayStats {
  activeConnections: number;
  totalSubscribers: number;
  totalBroadcasts: number;
  totalDeliveredMessages: number;
  activeTopicsCount: number;
}

export class WebSocketGateway {
  private wss: NativeWebSocketServer;
  private clients: Map<NativeWebSocketClient, ClientSession> = new Map();
  private topicSubscribers: Map<string, Set<NativeWebSocketClient>> = new Map();
  private stateManager: LiveStateManager;

  private stats: GatewayStats = {
    activeConnections: 0,
    totalSubscribers: 0,
    totalBroadcasts: 0,
    totalDeliveredMessages: 0,
    activeTopicsCount: 0,
  };

  constructor(wss: NativeWebSocketServer) {
    this.wss = wss;
    this.stateManager = LiveStateManager.getInstance();
    this.setupWebSocketServer();
    this.bindStateEvents();
  }

  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: NativeWebSocketClient, req?: IncomingMessage) => {
      const ip = req?.socket?.remoteAddress || (req?.headers?.['x-forwarded-for'] as string) || '127.0.0.1';
      const session: ClientSession = {
        ws,
        ip,
        subscriptions: new Set(),
        connectedAt: new Date(),
      };

      this.clients.set(ws, session);
      this.subscribeClientToTopic(ws, 'live:overview');
      this.stats.activeConnections = this.clients.size;

      // Send connection welcome and snapshot of all live matches
      const liveFixtures = this.stateManager.getAllInPlayFixtures().map((f) => this.stateManager.serializeFixture(f));
      this.sendToClient(ws, {
        type: 'WELCOME',
        message: 'Connected to xBET Real-Time Odds Stream',
        subscribedTopics: Array.from(session.subscriptions),
        liveMatches: liveFixtures,
      });

      ws.on('message', (messageBuffer: Buffer) => {
        try {
          const raw = messageBuffer.toString('utf8');
          if (raw.startsWith('rtdt') || raw.includes('\u001F')) {
            const parts = raw.split('\u001F');
            const cmd = parts[0];
            if (cmd === 'rtdt') {
              const user = parts[1] || 'guest';
              this.subscribeClientToTopic(ws, 'bm_sp');
              this.subscribeClientToTopic(ws, 'bm_sl');
              this.subscribeClientToTopic(ws, 'live:overview');
              if (ws.readyState === NativeWebSocketClient.OPEN) {
                ws.send(`info_pub\u001Fbm_sl\u001F${JSON.stringify({ status: 'connected', user })}`);
              }
            } else if (cmd === 'sub' && parts[1]) {
              this.subscribeClientToTopic(ws, parts[1]);
            }
            return;
          }

          const payload = JSON.parse(raw);
          this.handleClientMessage(session, payload);
        } catch {
          this.sendToClient(ws, { type: 'ERROR', message: 'Invalid payload' });
        }
      });

      ws.on('close', () => {
        this.cleanupClient(ws);
      });

      ws.on('error', (err) => {
        console.error(`[WebSocket] Client socket error:`, err);
      });
    });
  }

  public subscribeClientToTopic(ws: NativeWebSocketClient, topic: string): void {
    const session = this.clients.get(ws);
    if (session) {
      session.subscriptions.add(topic);
    }

    if (!this.topicSubscribers.has(topic)) {
      this.topicSubscribers.set(topic, new Set());
    }
    this.topicSubscribers.get(topic)!.add(ws);
    this.stats.activeTopicsCount = this.topicSubscribers.size;
  }

  public unsubscribeClientFromTopic(ws: NativeWebSocketClient, topic: string): void {
    const session = this.clients.get(ws);
    if (session) {
      session.subscriptions.delete(topic);
    }

    const set = this.topicSubscribers.get(topic);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        this.topicSubscribers.delete(topic);
      }
    }
    this.stats.activeTopicsCount = this.topicSubscribers.size;
  }

  private cleanupClient(ws: NativeWebSocketClient): void {
    const session = this.clients.get(ws);
    if (session) {
      for (const topic of session.subscriptions) {
        const set = this.topicSubscribers.get(topic);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            this.topicSubscribers.delete(topic);
          }
        }
      }
    }
    this.clients.delete(ws);
    this.stats.activeConnections = this.clients.size;
    this.stats.activeTopicsCount = this.topicSubscribers.size;
  }

  private handleClientMessage(session: ClientSession, payload: Record<string, unknown>): void {
    const action = String(payload.action || '').toUpperCase();

    switch (action) {
      case 'SUBSCRIBE': {
        const topic = String(payload.topic || '');
        if (topic) {
          this.subscribeClientToTopic(session.ws, topic);

          // If subscribed to a specific fixture, immediately send full snapshot of that fixture
          if (topic.startsWith('fixture:')) {
            const fixtureId = topic.replace('fixture:', '');
            const fixture = this.stateManager.getFixture(fixtureId);
            if (fixture) {
              this.sendToClient(session.ws, {
                type: 'FIXTURE_SNAPSHOT',
                topic,
                data: this.stateManager.serializeFixture(fixture),
              });
            }
          }

          this.sendToClient(session.ws, {
            type: 'SUBSCRIBED',
            topic,
            allSubscriptions: Array.from(session.subscriptions),
          });
        }
        break;
      }

      case 'UNSUBSCRIBE': {
        const topic = String(payload.topic || '');
        if (topic) {
          this.unsubscribeClientFromTopic(session.ws, topic);
          this.sendToClient(session.ws, {
            type: 'UNSUBSCRIBED',
            topic,
            allSubscriptions: Array.from(session.subscriptions),
          });
        }
        break;
      }

      case 'PING': {
        this.sendToClient(session.ws, { type: 'PONG', timestamp: Date.now() });
        break;
      }

      default:
        this.sendToClient(session.ws, { type: 'ERROR', message: `Unknown action: ${action}` });
    }
  }

  private bindStateEvents(): void {
    // When odds tick: broadcast delta to subscribers of live:overview and fixture:{id}
    this.stateManager.on('odds:tick', (delta: LiveOddsDelta) => {
      this.broadcastToTopic(`fixture:${delta.fixtureId}`, {
        type: 'ODDS_TICK',
        data: delta,
      });

      this.broadcastToTopic('live:overview', {
        type: 'ODDS_TICK',
        data: delta,
      });

      this.broadcastRawToTopic('bm_sl', `match_l\u001F${delta.fixtureId}\u001F${JSON.stringify(delta)}`);
      this.broadcastRawToTopic(`m${delta.fixtureId}`, `match_l\u001F${delta.fixtureId}\u001F${JSON.stringify(delta)}`);
    });

    // When score / clock changes: broadcast to subscribers
    this.stateManager.on('score:change', (delta: LiveScoreDelta) => {
      this.broadcastToTopic(`fixture:${delta.fixtureId}`, {
        type: 'SCORE_UPDATE',
        data: delta,
      });

      this.broadcastToTopic('live:overview', {
        type: 'SCORE_UPDATE',
        data: delta,
      });

      this.broadcastRawToTopic('bm_sl', `score_l\u001F${delta.fixtureId}\u001F${JSON.stringify(delta)}`);
    });
  }

  public broadcastRawToTopic(topic: string, rawMessage: string): void {
    const subscribers = this.topicSubscribers.get(topic);
    if (!subscribers || subscribers.size === 0) return;

    for (const ws of subscribers) {
      if (ws.readyState === NativeWebSocketClient.OPEN) {
        ws.send(rawMessage);
        this.stats.totalDeliveredMessages++;
      }
    }
  }

  public broadcastToTopic(topic: string, message: Record<string, unknown>): void {
    const subscribers = this.topicSubscribers.get(topic);
    if (!subscribers || subscribers.size === 0) return;

    const payloadStr = JSON.stringify(message);
    this.stats.totalBroadcasts++;

    for (const ws of subscribers) {
      if (ws.readyState === NativeWebSocketClient.OPEN) {
        ws.send(payloadStr);
        this.stats.totalDeliveredMessages++;
      }
    }
  }

  private sendToClient(ws: NativeWebSocketClient, message: Record<string, unknown>): void {
    if (ws.readyState === NativeWebSocketClient.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  public getStats(): GatewayStats {
    return {
      ...this.stats,
      activeConnections: this.clients.size,
      activeTopicsCount: this.topicSubscribers.size,
    };
  }
}
