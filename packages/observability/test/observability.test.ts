import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  MetricsRegistry,
  PlatformMetrics,
  Counter,
  Gauge,
  Histogram,
  Tracer,
  Span,
  ObservabilityMiddleware,
} from '../src/index.ts';

console.log('===============================================================');
console.log('  📊 Running Observability, Metrics & Distributed Tracing Tests');
console.log('===============================================================\n');

// ----------------------------------------------------------------------------
// Test 1: Prometheus Metrics Engine (Counters, Gauges, Histograms)
// ----------------------------------------------------------------------------
console.log('[Test 1] Testing Prometheus Metrics Engine & Text Exposition...');
const registry = MetricsRegistry.getInstance();

// 1. Counter
PlatformMetrics.httpRequestsTotal.inc({ service: 'betting-engine', method: 'POST', status: 200, route: '/api/v1/betting/bets' }, 15);
assert.strictEqual(PlatformMetrics.httpRequestsTotal.get({ service: 'betting-engine', method: 'POST', status: 200, route: '/api/v1/betting/bets' }), 15);

// 2. Gauge
PlatformMetrics.activeWebSocketConnections.set({ service: 'odds-engine', channel: 'live-odds' }, 1250);
assert.strictEqual(PlatformMetrics.activeWebSocketConnections.get({ service: 'odds-engine', channel: 'live-odds' }), 1250);

PlatformMetrics.activeWebSocketConnections.inc({ service: 'odds-engine', channel: 'live-odds' }, 50);
assert.strictEqual(PlatformMetrics.activeWebSocketConnections.get({ service: 'odds-engine', channel: 'live-odds' }), 1300);

// 3. Histogram
PlatformMetrics.httpRequestDuration.observe({ service: 'betting-engine', route: '/api/v1/betting/bets' }, 0.024);
PlatformMetrics.httpRequestDuration.observe({ service: 'betting-engine', route: '/api/v1/betting/bets' }, 0.045);
PlatformMetrics.httpRequestDuration.observe({ service: 'betting-engine', route: '/api/v1/betting/bets' }, 0.120);

const metricsText = registry.getMetricsAsText();
assert.ok(metricsText.includes('# HELP xbet_http_requests_total'));
assert.ok(metricsText.includes('# TYPE xbet_http_requests_total counter'));
assert.ok(metricsText.includes('xbet_active_websocket_connections{service="odds-engine",channel="live-odds"} 1300'));
assert.ok(metricsText.includes('xbet_http_request_duration_seconds_bucket'));
console.log('  ✅ Test 1 Passed: Prometheus metrics engine & OpenMetrics standard exposition verified.');

// ----------------------------------------------------------------------------
// Test 2: OpenTelemetry Distributed Tracing & W3C TraceContext Propagation
// ----------------------------------------------------------------------------
console.log('\n[Test 2] Testing OpenTelemetry Distributed Tracing & W3C TraceContext...');
const bettingTracer = new Tracer('betting-engine');
const ledgerTracer = new Tracer('financial-ledger');

// Trace full Bet Placement Flow across microservices
const rootSpan = bettingTracer.startSpan('place_bet', {
  attributes: {
    'bet.user_id': 'user-9912',
    'bet.stake': 100.0,
    'bet.odds': 2.50,
  },
});

assert.strictEqual(rootSpan.traceId.length, 32, 'Trace ID must be 32 hex characters');
assert.strictEqual(rootSpan.spanId.length, 16, 'Span ID must be 16 hex characters');

const traceparentHeader = rootSpan.toTraceparent();
assert.ok(traceparentHeader.startsWith(`00-${rootSpan.traceId}-${rootSpan.spanId}-01`));

// Child span in ledger service extracting trace context
const extractedContext = ledgerTracer.extractTraceContext(traceparentHeader);
assert.ok(extractedContext !== undefined);
assert.strictEqual(extractedContext.traceId, rootSpan.traceId);
assert.strictEqual(extractedContext.spanId, rootSpan.spanId);

const childLedgerSpan = ledgerTracer.startSpan('ledger_reserve_escrow', {
  parentContext: extractedContext,
  attributes: {
    'ledger.debit_account': 'user-9912-main',
    'ledger.credit_account': 'escrow-holding',
    'ledger.amount': 100.0,
  },
});

childLedgerSpan.addEvent('funds_locked', { timestamp: new Date().toISOString() });
childLedgerSpan.setStatus('OK');
childLedgerSpan.end();

rootSpan.setStatus('OK');
rootSpan.end();

assert.strictEqual(childLedgerSpan.traceId, rootSpan.traceId, 'Child span must share root traceId');
assert.strictEqual(childLedgerSpan.parentSpanId, rootSpan.spanId, 'Child span must reference parent spanId');
console.log('  ✅ Test 2 Passed: OpenTelemetry traceparent headers, child span hierarchy, and span events validated.');

// ----------------------------------------------------------------------------
// Test 3: Observability HTTP & WebSocket Middleware
// ----------------------------------------------------------------------------
console.log('\n[Test 3] Testing Observability HTTP Middleware & /metrics Route...');
const middleware = new ObservabilityMiddleware('odds-engine');

let metricsHeaders: Record<string, string> = {};
let metricsStatusCode = 0;

middleware.handleHttpRequest(
  { method: 'GET', url: '/metrics' },
  {
    statusCode: 0,
    setHeader: (k, v) => { metricsHeaders[k] = v; },
  },
  () => {}
);
assert.ok(metricsHeaders['Content-Type'].includes('text/plain'));

// Track WebSocket client lifecycle
const wsTracker = middleware.trackWebSocketClient('inplay-radar');
const countBefore = PlatformMetrics.activeWebSocketConnections.get({ service: 'odds-engine', channel: 'inplay-radar' });
assert.strictEqual(countBefore, 1);

wsTracker.close();
const countAfter = PlatformMetrics.activeWebSocketConnections.get({ service: 'odds-engine', channel: 'inplay-radar' });
assert.strictEqual(countAfter, 0);
console.log('  ✅ Test 3 Passed: Middleware HTTP /metrics endpoint and WebSocket connection tracker operational.');

// ----------------------------------------------------------------------------
// Test 4: Dashboard & Prometheus Alerting Rules Validation
// ----------------------------------------------------------------------------
console.log('\n[Test 4] Validating Grafana Dashboards & Prometheus Alerting Configs...');
const dashboardsDir = path.join(import.meta.dirname, '../dashboards');
const alertsDir = path.join(import.meta.dirname, '../alerts');

const riskDash = JSON.parse(fs.readFileSync(path.join(dashboardsDir, 'trading-risk-dashboard.json'), 'utf-8'));
assert.strictEqual(riskDash.title, 'xBET - Trading Risk & Market Exposure Desk');
assert.ok(riskDash.panels.length >= 4);

const healthDash = JSON.parse(fs.readFileSync(path.join(dashboardsDir, 'platform-health-dashboard.json'), 'utf-8'));
assert.strictEqual(healthDash.title, 'xBET - Microservices Platform Health & Ingestion');

const ledgerDash = JSON.parse(fs.readFileSync(path.join(dashboardsDir, 'financial-ledger-audit-dashboard.json'), 'utf-8'));
assert.strictEqual(ledgerDash.title, 'xBET - Double-Entry Financial Ledger Conservation & Audit');

const alertsYaml = fs.readFileSync(path.join(alertsDir, 'prometheus-alerts.yaml'), 'utf-8');
assert.ok(alertsYaml.includes('alert: DoubleEntryLedgerLeakage'));
assert.ok(alertsYaml.includes('alert: HighMarketLiabilitySpike'));
assert.ok(alertsYaml.includes('alert: OddsFeedIngestionLag'));
console.log('  ✅ Test 4 Passed: 3 Grafana JSON dashboards and Prometheus alerting rules parsed & verified.');

console.log('\n===============================================================');
console.log('  🎉 All Phase 2 Observability & Tracing Tests Passed!         ');
console.log('===============================================================');
