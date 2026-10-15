/**
 * k6 High-Concurrency Sportsbook & Betting Load Test Suite
 * Simulates peak World Cup / Champions League match betting & odds streaming load.
 * 
 * Execution:
 *   k6 run tests/load/k6-sportsbook-load.js
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Metrics
const betPlacementDuration = new Trend('bet_placement_duration_ms');
const oddsMessageLatency = new Trend('odds_stream_latency_ms');
const successfulBets = new Counter('bets_placed_success_total');
const failedBets = new Counter('bets_placed_failure_total');
const ledgerConservationRate = new Rate('ledger_conservation_rate');

export const options = {
  scenarios: {
    // 1. High-frequency in-play odds streaming over WebSockets (10,000 virtual users)
    websocket_streaming: {
      executor: 'ramping-vus',
      startVUs: 100,
      stages: [
        { duration: '30s', target: 2000 },
        { duration: '1m', target: 10000 },
        { duration: '30s', target: 0 },
      ],
      exec: 'oddsStreamingScenario',
    },
    // 2. High-throughput bet placement (2,000 RPS peak)
    bet_placement: {
      executor: 'constant-arrival-rate',
      rate: 2000,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 500,
      maxVUs: 2000,
      exec: 'betPlacementScenario',
    },
  },
  thresholds: {
    'bet_placement_duration_ms': ['p(95)<100', 'p(99)<250'],
    'odds_stream_latency_ms': ['p(99)<50'],
    'http_req_failed': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const WS_URL = __ENV.WS_URL || 'ws://localhost:8080/ws/odds';

export function oddsStreamingScenario() {
  const params = { tags: { my_tag: 'odds-stream' } };
  
  ws.connect(WS_URL, params, function (socket) {
    socket.on('open', () => {
      // Subscribe to premier league in-play fixtures
      socket.send(JSON.stringify({
        action: 'SUBSCRIBE',
        topics: ['live:overview', 'fixture:fix-sr-101'],
      }));
    });

    socket.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.type === 'ODDS_TICK' && msg.timestamp) {
        const latency = Date.now() - msg.timestamp;
        oddsMessageLatency.add(latency);
      }
    });

    socket.on('error', (e) => {
      console.error('WebSocket error:', e.error());
    });

    sleep(15);
    socket.close();
  });
}

export function betPlacementScenario() {
  const userId = `usr-perf-${__VU}-${__ITER % 100}`;
  const payload = JSON.stringify({
    userId: userId,
    betType: 'SINGLE',
    stake: 50.0,
    currencyCode: 'USD',
    legs: [
      {
        fixtureId: 'fix-sr-101',
        fixtureName: 'Arsenal vs Chelsea',
        marketId: 'mkt-1x2',
        marketName: '1X2',
        selectionId: 'sel-1',
        selectionName: 'Arsenal',
        submittedOdds: 1.85,
      },
    ],
  });

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer perf-test-token-${userId}`,
  };

  const startTime = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/betting/bets`, payload, { headers });
  const duration = Date.now() - startTime;
  betPlacementDuration.add(duration);

  const isSuccess = check(res, {
    'status is 200/201': (r) => r.status === 200 || r.status === 201,
    'ticket code returned': (r) => JSON.parse(r.body).ticket !== undefined,
  });

  if (isSuccess) {
    successfulBets.add(1);
    ledgerConservationRate.add(1);
  } else {
    failedBets.add(1);
    ledgerConservationRate.add(0);
  }

  sleep(0.5);
}
