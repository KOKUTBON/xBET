/**
 * 1:1 CakePHP WebSocket & REST Network Layer
 * Implements WebSocket connection multiplexing, channel broadcasting (odds, scores, tickets),
 * REST API token authorization, and multi-format serialization (JSON, XML, CSV).
 */

import { IncomingMessage, ServerResponse } from 'http';
import { createHash, randomUUID } from 'crypto';

// ============================================================================
// 1. WebSocket Protocol Broker
// ============================================================================
export interface WebSocketClientSession {
  id: string;
  channels: Set<string>;
  send: (payload: string) => void;
  isAlive: boolean;
}

export class WebSocketBroker {
  private static instance: WebSocketBroker;
  private clients: Map<string, WebSocketClientSession> = new Map();

  public static getInstance(): WebSocketBroker {
    if (!WebSocketBroker.instance) {
      WebSocketBroker.instance = new WebSocketBroker();
    }
    return WebSocketBroker.instance;
  }

  public registerClient(id: string, sendFn: (payload: string) => void): WebSocketClientSession {
    const session: WebSocketClientSession = {
      id,
      channels: new Set(['all', 'odds', 'scores']),
      send: sendFn,
      isAlive: true,
    };
    this.clients.set(id, session);
    return session;
  }

  public unregisterClient(id: string): void {
    this.clients.delete(id);
  }

  public subscribeChannel(clientId: string, channel: string): void {
    this.clients.get(clientId)?.channels.add(channel.toLowerCase());
  }

  public unsubscribeChannel(clientId: string, channel: string): void {
    this.clients.get(clientId)?.channels.delete(channel.toLowerCase());
  }

  public broadcast(channel: string, eventType: string, data: any): void {
    const payload = JSON.stringify({ type: eventType, channel, data, timestamp: new Date() });
    for (const client of this.clients.values()) {
      if (client.channels.has('*') || client.channels.has(channel.toLowerCase())) {
        try {
          client.send(payload);
        } catch (e) {
          console.error(`[WebSocketBroker] Failed sending to client ${client.id}:`, e);
        }
      }
    }
  }

  public getConnectedClientsCount(): number {
    return this.clients.size;
  }

  public generateHandshakeAccept(secKey: string): string {
    const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    return createHash('sha1').update(secKey + GUID).digest('base64');
  }
}

// ============================================================================
// 2. REST API Dispatcher & Content Negotiator
// ============================================================================
export interface RestApiRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: any;
  apiKey?: string;
  user?: any;
}

export interface RestApiResponse {
  statusCode: number;
  contentType: string;
  body: string;
}

export class RestApiDispatcher {
  private validApiKeys: Set<string> = new Set(['xbet-rest-api-key-2026', 'partner-secret-key-101']);

  public authenticate(req: RestApiRequest): boolean {
    const authHeader = req.headers['authorization'] || '';
    const apiKey = req.query['api_key'] || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader);
    if (apiKey && this.validApiKeys.has(apiKey)) {
      req.apiKey = apiKey;
      return true;
    }
    return false;
  }

  public formatResponse(data: any, format: 'json' | 'xml' | 'csv' = 'json'): RestApiResponse {
    if (format === 'xml') {
      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n`;
      for (const [k, v] of Object.entries(data)) {
        xml += `  <${k}>${typeof v === 'object' ? JSON.stringify(v) : v}</${k}>\n`;
      }
      xml += `</response>`;
      return { statusCode: 200, contentType: 'application/xml', body: xml };
    }

    if (format === 'csv') {
      const items = Array.isArray(data) ? data : [data];
      if (items.length === 0) return { statusCode: 200, contentType: 'text/csv', body: '' };
      const headers = Object.keys(items[0]);
      const rows = [headers.join(',')];
      for (const item of items) {
        rows.push(headers.map((h) => `"${String(item[h] ?? '').replace(/"/g, '""')}"`).join(','));
      }
      return { statusCode: 200, contentType: 'text/csv', body: rows.join('\n') };
    }

    return { statusCode: 200, contentType: 'application/json', body: JSON.stringify(data) };
  }
}
