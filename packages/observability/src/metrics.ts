/**
 * Production Prometheus Metrics Engine
 * Implements Counters, Gauges, Histograms, and OpenMetrics / Prometheus v2.0 text exposition.
 */

export type MetricLabels = Record<string, string | number>;

function formatLabels(labels?: MetricLabels): string {
  if (!labels || Object.keys(labels).length === 0) return '';
  const pairs = Object.entries(labels).map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`);
  return `{${pairs.join(',')}}`;
}

export class Counter {
  public readonly name: string;
  public readonly help: string;
  public readonly labelNames: string[];
  private values: Map<string, number> = new Map();

  constructor(name: string, help: string, labelNames: string[] = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
  }

  public inc(labels?: MetricLabels, value: number = 1): void {
    if (value < 0) throw new Error('Counter cannot be decremented');
    const key = formatLabels(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + value);
  }

  public get(labels?: MetricLabels): number {
    const key = formatLabels(labels);
    return this.values.get(key) || 0;
  }

  public toPrometheusText(): string {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} counter\n`;
    if (this.values.size === 0) {
      out += `${this.name} 0\n`;
    } else {
      for (const [labels, val] of this.values.entries()) {
        out += `${this.name}${labels} ${val}\n`;
      }
    }
    return out;
  }
}

export class Gauge {
  public readonly name: string;
  public readonly help: string;
  public readonly labelNames: string[];
  private values: Map<string, number> = new Map();

  constructor(name: string, help: string, labelNames: string[] = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
  }

  public set(labels: MetricLabels | undefined, value: number): void {
    const key = formatLabels(labels);
    this.values.set(key, value);
  }

  public inc(labels?: MetricLabels, value: number = 1): void {
    const key = formatLabels(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + value);
  }

  public dec(labels?: MetricLabels, value: number = 1): void {
    const key = formatLabels(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current - value);
  }

  public get(labels?: MetricLabels): number {
    const key = formatLabels(labels);
    return this.values.get(key) || 0;
  }

  public toPrometheusText(): string {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} gauge\n`;
    if (this.values.size === 0) {
      out += `${this.name} 0\n`;
    } else {
      for (const [labels, val] of this.values.entries()) {
        out += `${this.name}${labels} ${val}\n`;
      }
    }
    return out;
  }
}

export class Histogram {
  public readonly name: string;
  public readonly help: string;
  public readonly labelNames: string[];
  public readonly buckets: number[];
  private counts: Map<string, Map<number, number>> = new Map();
  private sums: Map<string, number> = new Map();
  private totalCounts: Map<string, number> = new Map();

  constructor(
    name: string,
    help: string,
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    labelNames: string[] = []
  ) {
    this.name = name;
    this.help = help;
    this.buckets = [...buckets].sort((a, b) => a - b);
    this.labelNames = labelNames;
  }

  public observe(labels: MetricLabels | undefined, value: number): void {
    const key = formatLabels(labels);
    if (!this.counts.has(key)) {
      const bMap = new Map<number, number>();
      for (const b of this.buckets) bMap.set(b, 0);
      this.counts.set(key, bMap);
      this.sums.set(key, 0);
      this.totalCounts.set(key, 0);
    }

    const bMap = this.counts.get(key)!;
    for (const b of this.buckets) {
      if (value <= b) {
        bMap.set(b, (bMap.get(b) || 0) + 1);
      }
    }

    this.sums.set(key, (this.sums.get(key) || 0) + value);
    this.totalCounts.set(key, (this.totalCounts.get(key) || 0) + 1);
  }

  public toPrometheusText(): string {
    let out = `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} histogram\n`;
    for (const [labels, bMap] of this.counts.entries()) {
      const baseLabels = labels.length > 2 ? labels.slice(1, -1) + ',' : '';
      for (const b of this.buckets) {
        out += `${this.name}_bucket{${baseLabels}le="${b}"} ${bMap.get(b) || 0}\n`;
      }
      out += `${this.name}_bucket{${baseLabels}le="+Inf"} ${this.totalCounts.get(labels) || 0}\n`;
      out += `${this.name}_sum${labels} ${this.sums.get(labels) || 0}\n`;
      out += `${this.name}_count${labels} ${this.totalCounts.get(labels) || 0}\n`;
    }
    return out;
  }
}

export class MetricsRegistry {
  private static instance: MetricsRegistry;
  private metrics: Map<string, Counter | Gauge | Histogram> = new Map();

  public static getInstance(): MetricsRegistry {
    if (!MetricsRegistry.instance) {
      MetricsRegistry.instance = new MetricsRegistry();
    }
    return MetricsRegistry.instance;
  }

  public register<T extends Counter | Gauge | Histogram>(metric: T): T {
    this.metrics.set(metric.name, metric);
    return metric;
  }

  public getMetric<T extends Counter | Gauge | Histogram>(name: string): T | undefined {
    return this.metrics.get(name) as T;
  }

  public getMetricsAsText(): string {
    let output = '';
    for (const metric of this.metrics.values()) {
      output += metric.toPrometheusText() + '\n';
    }
    return output;
  }
}

// Global Platform Metrics
export const PlatformMetrics = {
  httpRequestsTotal: new Counter(
    'xbet_http_requests_total',
    'Total count of handled HTTP requests',
    ['service', 'method', 'status', 'route']
  ),
  httpRequestDuration: new Histogram(
    'xbet_http_request_duration_seconds',
    'HTTP request latency in seconds',
    [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    ['service', 'route']
  ),
  activeWebSocketConnections: new Gauge(
    'xbet_active_websocket_connections',
    'Number of currently active streaming WebSocket clients',
    ['service', 'channel']
  ),
  oddsUpdateThroughput: new Counter(
    'xbet_odds_update_throughput_total',
    'Total odds feed ticks processed and broadcast',
    ['provider', 'sport']
  ),
  betsPlacedTotal: new Counter(
    'xbet_bets_placed_total',
    'Total number of tickets and bets placed',
    ['bet_type', 'status']
  ),
  betsSettledTotal: new Counter(
    'xbet_bets_settled_total',
    'Total bets processed through automated settlement',
    ['outcome']
  ),
  ledgerTransactionDuration: new Histogram(
    'xbet_ledger_transaction_duration_ms',
    'Double-entry transaction execution latency in milliseconds',
    [0.5, 1, 2, 5, 10, 25, 50, 100],
    ['transaction_type']
  ),
  ledgerTotalDebits: new Gauge(
    'xbet_ledger_total_debits_usd',
    'System-wide total active debit conservation balance',
    ['currency']
  ),
  ledgerTotalCredits: new Gauge(
    'xbet_ledger_total_credits_usd',
    'System-wide total active credit conservation balance',
    ['currency']
  ),
  casinoActiveSessions: new Gauge(
    'xbet_casino_active_sessions',
    'Number of active casino game sessions',
    ['game_type']
  ),
  pokerActiveTables: new Gauge(
    'xbet_poker_active_tables',
    'Active Texas Holdem tables in lobby',
    ['stakes']
  ),
};

// Register all metrics to global registry
const registry = MetricsRegistry.getInstance();
for (const m of Object.values(PlatformMetrics)) {
  registry.register(m);
}
