/**
 * Comprehensive Sports Feed Ingestion Test Suite
 * Tests EnetPulse, OddService/Betradar XML and JSON ingestion,
 * live delta propagation, and resulting state transitions.
 */

import { EnetPulseAdapter } from '../src/ingestion/adapters/enetpulse-adapter.ts';
import { OddServiceAdapter } from '../src/ingestion/adapters/oddservice-adapter.ts';
import { FeedIngestionService } from '../src/ingestion/feed-ingestion-service.ts';
import { LiveStateManager } from '../src/domain/live-state.ts';

async function runFeedIngestionTests() {
  console.log('===============================================================');
  console.log('  🧪 Running Multi-Provider Sports Feed Ingestion Test Suite');
  console.log('===============================================================');

  const stateManager = LiveStateManager.getInstance();
  const feedService = FeedIngestionService.getInstance();
  const enetAdapter = new EnetPulseAdapter();
  const oddServiceAdapter = new OddServiceAdapter();

  // --------------------------------------------------------------------------
  // Test 1: EnetPulse XML Fixture Feed Parsing
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing EnetPulse XML Feed Ingestion...');
  const sampleEnetPulseXml = `
    <query-response>
      <events>
        <event id="1001" sport_id="1" sport_name="Soccer" tournament_id="50" tournament_name="Premier League" startdate="2026-08-20 18:00:00" status="live" minute="35" home_score="1" away_score="0">
          <participant id="10" name="Manchester United" />
          <participant id="20" name="Liverpool" />
          <market id="m1" name="1X2" type="1X2">
            <odd id="o1" name="1" value="2.10" status="active" />
            <odd id="o2" name="X" value="3.40" status="active" />
            <odd id="o3" name="2" value="3.80" status="active" />
          </market>
          <market id="m2" name="Over/Under 2.5" type="OVER_UNDER" line="2.5">
            <odd id="o4" name="Over 2.5" value="1.75" status="active" />
            <odd id="o5" name="Under 2.5" value="2.05" status="active" />
          </market>
        </event>
      </events>
    </query-response>
  `;

  const parsedEnetFixtures = enetAdapter.parseFixtures(sampleEnetPulseXml);
  console.log(`  Parsed ${parsedEnetFixtures.length} EnetPulse fixtures from XML.`);
  if (parsedEnetFixtures.length !== 1) throw new Error('Failed to parse EnetPulse fixture');
  const fix1 = parsedEnetFixtures[0];
  if (fix1.homeTeam !== 'Manchester United' || fix1.awayTeam !== 'Liverpool' || fix1.markets.length !== 2) {
    throw new Error('EnetPulse fixture data mismatch');
  }
  console.log(`  ✅ Match: ${fix1.homeTeam} vs ${fix1.awayTeam} | Markets: ${fix1.markets.length}`);

  // Ingest into Feed Service
  feedService.ingestFixtures('EnetPulse', sampleEnetPulseXml);
  const liveFix1 = stateManager.getFixture('enet-fix-1001');
  if (!liveFix1 || liveFix1.homeTeam !== 'Manchester United') {
    throw new Error('EnetPulse fixture not loaded into LiveStateManager');
  }
  console.log('  ✅ Test 1 Passed: EnetPulse XML parsed and loaded into in-memory live state.');

  // --------------------------------------------------------------------------
  // Test 2: OddService / Betradar XML Feed Ingestion
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing OddService / Betradar XML Feed Ingestion...');
  const sampleOddServiceXml = `
    <Sport ID="1" Name="Soccer">
      <Category ID="5" Name="Spain">
        <Tournament ID="200" Name="La Liga">
          <Match ID="5002" Date="2026-08-20 21:00:00" Status="Live" HomeTeam="Real Madrid" AwayTeam="Barcelona" HomeScore="2" AwayScore="2" Minute="72">
            <OfferType ID="1" Name="1X2">
              <Odd ID="11" Name="1" Value="2.40" Status="active" />
              <Odd ID="12" Name="X" Value="3.10" Status="active" />
              <Odd ID="13" Name="2" Value="2.90" Status="active" />
            </OfferType>
            <OfferType ID="6" Name="Both Teams to Score">
              <Odd ID="14" Name="Yes" Value="1.45" Status="active" />
              <Odd ID="15" Name="No" Value="2.65" Status="active" />
            </OfferType>
          </Match>
        </Tournament>
      </Category>
    </Sport>
  `;

  feedService.ingestFixtures('OddService', sampleOddServiceXml);
  const liveFix2 = stateManager.getFixture('odds-fix-5002');
  if (!liveFix2 || liveFix2.homeTeam !== 'Real Madrid' || liveFix2.markets.size !== 2) {
    throw new Error('OddService match not loaded into LiveStateManager');
  }
  console.log(`  ✅ Match: ${liveFix2.homeTeam} vs ${liveFix2.awayTeam} (${liveFix2.tournamentName}) | Score: ${liveFix2.score.home}-${liveFix2.score.away}`);
  console.log('  ✅ Test 2 Passed: OddService / Betradar hierarchy parsed successfully.');

  // --------------------------------------------------------------------------
  // Test 3: Real-Time Live Odds Delta Stream Ingestion
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Real-Time Live Odds Delta Updates & WebSocket Emits...');
  let deltaReceived = false;

  stateManager.once('odds:tick', (delta) => {
    console.log(`  [Event] Received odds:tick event for ${delta.selectionName}: ${delta.oldOdds} -> ${delta.newOdds}`);
    deltaReceived = true;
  });

  // Push live delta: Real Madrid odds drop from 2.40 to 1.85 following a goal
  feedService.ingestLiveDeltas('OddService', {
    fixtureId: '5002',
    marketId: '1',
    selectionId: '11',
    odds: 1.85,
    status: 'ACTIVE',
  });

  if (!deltaReceived) throw new Error('Live odds delta event was not emitted');
  const updatedMkt = liveFix2.markets.get('odds-mkt-5002-1');
  const updatedSel = updatedMkt?.selections.get('odds-sel-5002-11');
  if (!updatedSel || updatedSel.odds !== 1.85 || updatedSel.previousOdds !== 2.40) {
    throw new Error('Live odds state not updated correctly');
  }
  console.log('  ✅ Test 3 Passed: Real-time odds tick processed with previous-odds history.');

  // --------------------------------------------------------------------------
  // Test 4: Official Scorecard Ingestion & Match Finish Resulting
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Official Match Result Scorecard Ingestion...');
  let resultingEventEmitted = false;

  feedService.once('fixture:resulted', (scorecard) => {
    console.log(`  [Event] fixture:resulted emitted for ${scorecard.fixtureExternalId} -> Score: ${scorecard.homeScore}-${scorecard.awayScore}`);
    resultingEventEmitted = true;
  });

  feedService.ingestScorecards('OddService', {
    fixtureId: '5002',
    homeScore: 3,
    awayScore: 2,
    status: 'FINISHED',
  });

  if (!resultingEventEmitted) throw new Error('Resulting scorecard event not emitted');
  if (liveFix2.status !== 'FINISHED' || liveFix2.score.home !== 3 || liveFix2.score.away !== 2) {
    throw new Error('Match final score not updated');
  }
  console.log('  ✅ Test 4 Passed: Match transitioned to FINISHED and emitted result event for settlement.');

  // --------------------------------------------------------------------------
  // Test 5: Ingestion Health & Metrics
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Checking Feed Ingestion Metrics...');
  const stats = feedService.getStats();
  console.log('  Feed Stats:', stats);
  if (stats.totalFixturesLoaded < 2 || stats.totalOddsDeltasProcessed < 1 || stats.totalScorecardsProcessed < 1) {
    throw new Error('Stats counters mismatch');
  }
  console.log('  ✅ Test 5 Passed: Provider metrics and throughput counters verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Sports Feed Ingestion Tests Passed!                   ');
  console.log('===============================================================');
  process.exit(0);
}

runFeedIngestionTests().catch((err) => {
  console.error('❌ Feed Ingestion Tests failed:', err);
  process.exit(1);
});
