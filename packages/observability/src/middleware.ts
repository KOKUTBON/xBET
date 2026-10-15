/**
 * Observability Middleware for HTTP & WebSocket Servers
 * Automatically intercepts incoming HTTP requests, records Prometheus metrics,
 * and attaches OpenTelemetry W3C trace spans.
 */

import { PlatformMetrics, MetricsRegistry } from './metrics.ts';
import { Tracer, Span } from './tracer.ts';

export interface ObservabilityRequest {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}

export interface ObservabilityResponse {
  statusCode?: number;
  setHeader?: (name: string, value: string) => void;
}

export class ObservabilityMiddleware {
  public readonly serviceName: string;
  private tracer: Tracer;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
    this.tracer = new Tracer(serviceName);
  }

  public getTracer(): Tracer {
    return this.tracer;
  }

  public handleHttpRequest(
    req: ObservabilityRequest,
    res: ObservabilityResponse,
    next: () => Promise<void> | void
  ): Promise<void> | void {
    const startTime = process.hrtime();
    const method = req.method || 'GET';
    const url = req.url || '/';
    const route = url.split('?')[0];

    // Handle /metrics endpoint directly
    if (route === '/metrics') {
      const text = MetricsRegistry.getInstance().getMetricsAsText();
      if (res.setHeader) {
        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      }
      res.statusCode = 200;
      return;
    }

    // Extract W3C TraceContext if present
    const rawTraceparent = typeof req.headers?.traceparent === 'string'
      ? req.headers.traceparent
      : Array.isArray(req.headers?.traceparent)
      ? req.headers.traceparent[0]
      : undefined;

    const parentContext = this.tracer.extractTraceContext(rawTraceparent);
    const span = this.tracer.startSpan(`HTTP ${method} ${route}`, {
      parentContext,
      attributes: {
        'http.method': method,
        'http.url': url,
        'http.route': route,
      },
    });

    if (res.setHeader) {
      res.setHeader('traceparent', span.toTraceparent());
    }

    const finalize = () => {
      const diff = process.hrtime(startTime);
      const durationSec = diff[0] + diff[1] / 1e9;
      const statusCode = res.statusCode || 200;

      PlatformMetrics.httpRequestsTotal.inc({
        service: this.serviceName,
        method,
        status: statusCode,
        route,
      });

      PlatformMetrics.httpRequestDuration.observe({
        service: this.serviceName,
        route,
      }, durationSec);

      span.setAttribute('http.status_code', statusCode);
      if (statusCode >= 400) {
        span.setStatus('ERROR', `HTTP ${statusCode}`);
      } else {
        span.setStatus('OK');
      }
      span.end();
    };

    const maybePromise = next();
    if (maybePromise && typeof maybePromise.then === 'function') {
      return maybePromise.then(finalize).catch((err) => {
        finalize();
        throw err;
      });
    } else {
      finalize();
    }
  }

  public trackWebSocketClient(channel: string = 'odds'): { close: () => void } {
    PlatformMetrics.activeWebSocketConnections.inc({ service: this.serviceName, channel });
    let closed = false;
    return {
      close: () => {
        if (!closed) {
          closed = true;
          PlatformMetrics.activeWebSocketConnections.dec({ service: this.serviceName, channel });
        }
      },
    };
  }
}
