/**
 * In-Process Verification Suite for Real-Time Odds Engine
 * Tests probability math, margin integrity, live simulator, state mutations, and delta generation.
 */

import { OddsCalculator } from './src/domain/odds-calculator.ts';
import { LiveStateManager } from './src/domain/live-state.ts';
import { LiveSportsSimulator } from './src/ingestion/live-simulator.ts';

async function runUnitAndIntegrationTests() {
  console.log('===============================================================');
  console.log('  🧪 Running Odds Engine Verification Suite');
  console.log('===============================================================');

  // Test 1: Odds Calculator Margin & Overround Math
  console.log('\n[Test 1] Testing Odds Calculation & Bookmaker Margin...');
  const probabilities = [
    { name: 'Home', fairProbability: 0.50 },
    { name: 'Draw', fairProbability: 0.28 },
    { name: 'Away', fairProbability: 0.22 },
  ];
  const targetMargin = 1.06; // 6% margin
  const odds = OddsCalculator.calculateDecimalOdds(probabilities, targetMargin);

  console.log('  Odds output:', odds);
  if (odds.length !== 3) throw new Error('Expected 3 selections');
  
  // Calculate total bookmaker overround: sum(1 / odd)
  const actualOverround = odds.reduce((sum, item) => sum + (1 / item.odds), 0);
  console.log(`  Actual Margin (Overround): ${(actualOverround * 100).toFixed(2)}% (Target: ${(targetMargin * 100).toFixed(2)}%)`);
  if (actualOverround < 1.04 || actualOverround > 1.08) {
    throw new Error(`Overround out of tolerance: ${actualOverround}`);
  }
  console.log('  ✅ Test 1 Passed: Overround margin mathematically guaranteed.');

  // Test 2: Live In-Play 1X2 Probabilities Decay & Home Lead Shift
  console.log('\n[Test 2] Testing In-Play 1X2 Probabilities Decay (Arsenal 2-0 Chelsea, 70\')...');
  const liveProbs = OddsCalculator.calculate1X2LiveProbabilities(2, 0, 70);
  const liveOdds = OddsCalculator.calculateDecimalOdds(liveProbs, 1.06);
  console.log('  In-Play 1X2 Odds at 70\' with 2-0 score:');
  for (const o of liveOdds) {
    console.log(`    - ${o.name}: ${o.odds.toFixed(2)} (Fair Prob: ${(o.probability * 100).toFixed(1)}%)`);
  }
  const homeOdd = liveOdds.find(o => o.name === 'Home')!.odds;
  const awayOdd = liveOdds.find(o => o.name === 'Away')!.odds;
  if (homeOdd >= awayOdd) {
    throw new Error('Home team leading 2-0 at 70min should have lower odds than away team');
  }
  console.log('  ✅ Test 2 Passed: Dynamic in-play odds correctly favor leading team.');

  // Test 3: Live State Manager & Event Emissions
  console.log('\n[Test 3] Testing LiveStateManager & Event Delta Emission...');
  const stateManager = LiveStateManager.getInstance();
  const simulator = new LiveSportsSimulator();
  simulator.initializeSampleMatches();

  const allInPlay = stateManager.getAllInPlayFixtures();
  console.log(`  Found ${allInPlay.length} in-play fixtures in state.`);
  if (allInPlay.length < 3) throw new Error('Expected 3 live fixtures');

  let receivedOddsTick = false;
  let receivedScoreChange = false;

  stateManager.on('odds:tick', (delta) => {
    receivedOddsTick = true;
    console.log(`    [Event] odds:tick received for [${delta.selectionName}]: ${delta.oldOdds} -> ${delta.newOdds}`);
  });

  stateManager.on('score:change', (delta) => {
    receivedScoreChange = true;
    console.log(`    [Event] score:change received: Clock=${delta.matchClock}, Score=${JSON.stringify(delta.score)}`);
  });

  // Mutate state to verify event triggering
  const testFix = allInPlay[0];
  const mkt = Array.from(testFix.markets.values())[0];
  const sel = Array.from(mkt.selections.values())[0];

  stateManager.updateOdds(testFix.id, mkt.id, sel.id, 1.95, 'ACTIVE');
  stateManager.updateMatchState(testFix.id, { home: 2, away: 1 }, 55, '55:00', 'LIVE', 'Goal scored');

  if (!receivedOddsTick) throw new Error('Failed to receive odds:tick event');
  if (!receivedScoreChange) throw new Error('Failed to receive score:change event');
  console.log('  ✅ Test 3 Passed: In-memory live state management and delta event dispatch work.');

  // Test 4: Fixture JSON Serialization
  console.log('\n[Test 4] Testing Fixture Serialization for REST / WebSocket payloads...');
  const serialized = stateManager.serializeFixture(testFix);
  if (!serialized.id || !Array.isArray(serialized.markets)) {
    throw new Error('Serialization format invalid');
  }
  console.log(`  Serialized fixture "${serialized.homeTeam} vs ${serialized.awayTeam}" with ${serialized.markets.length} active markets.`);
  console.log('  ✅ Test 4 Passed: REST / WebSocket JSON contract is valid.');

  console.log('\n===============================================================');
  console.log('  🎉 All Odds Engine Verification Checks Passed Successfully!  ');
  console.log('===============================================================');
  process.exit(0);
}

runUnitAndIntegrationTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
