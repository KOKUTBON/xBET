/**
 * End-to-End Verification Test Client for Real-Time Odds Engine & WebSocket Gateway
 */

async function runVerification() {
  console.log('--- Step 1: Testing REST API ---');

  // Test /api/v1/health
  const healthRes = await fetch('http://127.0.0.1:4000/api/v1/health');
  const healthData = await healthRes.json();
  console.log('[REST] /api/v1/health status:', healthData.status, 'In-Play Matches:', healthData.inPlayCount);

  if (healthData.status !== 'OK') {
    throw new Error('Health check failed');
  }

  // Test /api/v1/fixtures/in-play
  const fixturesRes = await fetch('http://127.0.0.1:4000/api/v1/fixtures/in-play');
  const fixturesData = await fixturesRes.json();
  console.log('[REST] /api/v1/fixtures/in-play returned matches:', fixturesData.count);

  if (fixturesData.count < 3) {
    throw new Error('Expected at least 3 live matches');
  }

  console.log('--- Step 2: Testing WebSocket Stream ---');
  const ws = new WebSocket('ws://127.0.0.1:4000/ws');
  let receivedWelcome = false;
  let receivedSnapshot = false;
  let receivedOddsTick = false;
  let receivedScoreUpdate = false;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      if (!receivedWelcome || !receivedOddsTick) {
        reject(new Error(`WebSocket test timed out. Welcome: ${receivedWelcome}, OddsTick: ${receivedOddsTick}`));
      } else {
        resolve();
      }
    }, 6000);

    ws.onopen = () => {
      console.log('[WS Client] Connected to WebSocket server!');
      // Subscribe to specific match
      ws.send(JSON.stringify({ action: 'SUBSCRIBE', topic: 'fixture:fix-ucl-001' }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string);
      console.log(`[WS Client] Received message type: ${msg.type}`);

      if (msg.type === 'WELCOME') {
        receivedWelcome = true;
      }
      if (msg.type === 'FIXTURE_SNAPSHOT') {
        receivedSnapshot = true;
        console.log(`[WS Client] Match snapshot received: ${msg.data.homeTeam} vs ${msg.data.awayTeam}`);
      }
      if (msg.type === 'ODDS_TICK') {
        receivedOddsTick = true;
        console.log(`[WS Client] Live Odds Delta received: [${msg.data.selectionName}] -> ${msg.data.newOdds}`);
      }
      if (msg.type === 'SCORE_UPDATE') {
        receivedScoreUpdate = true;
        console.log(`[WS Client] Score / Clock Update: Clock=${msg.data.matchClock}, Score=${JSON.stringify(msg.data.score)}`);
      }

      if (receivedWelcome && receivedSnapshot && receivedOddsTick && receivedScoreUpdate) {
        clearTimeout(timeout);
        ws.close();
        resolve();
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
  });

  console.log('--- ✅ All Phase 2 REST & WebSocket Verification Checks Passed! ---');
  process.exit(0);
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
