/**
 * End-to-End Verification Test Suite for Frontend Web Components and Reactive State
 * Tests only features present in the original CakePHP project.
 */

import { AppStateManager } from './src/state/app-state.ts';
import { LiveMatchListComponent } from './src/components/live-match-list.ts';
import { BetslipComponent } from './src/components/betslip.ts';
import { CasinoLobbyComponent } from './src/components/casino-lobby.ts';
import { MatchDetailsComponent } from './src/components/match-details.ts';

async function runFrontendTests() {
  console.log('===============================================================');
  console.log('  🧪 Running Frontend Web Components & State Verification Suite');
  console.log('===============================================================');

  const appState = new AppStateManager();

  // --------------------------------------------------------------------------
  // Test 1: Reactive State & Navigation
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Navigation & Balance Management...');
  appState.setBalance(1500.0);
  if (appState.userBalance !== 1500.0) throw new Error('Balance update failed');

  appState.depositDemo(250.0);
  if (appState.userBalance !== 1750.0) throw new Error('Demo deposit failed');
  console.log(`  User Balance: $${appState.userBalance.toFixed(2)}`);

  appState.setActiveTab('casino');
  if (appState.activeTab !== 'casino') throw new Error('Tab switch failed');

  appState.setActiveTab('sports');
  if (appState.activeTab !== 'sports') throw new Error('Tab switch back to sports failed');

  appState.setActiveTab('virtual');
  if (appState.activeTab !== 'virtual') throw new Error('Tab switch to virtual failed');
  console.log('  ✅ Test 1 Passed: Reactive state updates & wallet balance work.');

  // --------------------------------------------------------------------------
  // Test 2: Live In-Play Fixtures Hydration & Real-Time Odds Delta
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Live Fixtures Hydration & Odds Updates...');
  const sampleFixture = {
    id: 'fix-101',
    tournamentName: 'Premier League',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    matchClock: '68:40',
    score: { home: 2, away: 0 },
    markets: [
      {
        id: 'mkt-101',
        marketType: 'MATCH_WINNER_1X2',
        selections: [
          { id: 'sel-ars', name: 'Home', odds: 1.25, previousOdds: null },
          { id: 'sel-drw', name: 'Draw', odds: 5.50, previousOdds: null },
          { id: 'sel-che', name: 'Away', odds: 12.00, previousOdds: null },
        ],
      },
    ],
  };

  appState.liveFixtures.set(sampleFixture.id, sampleFixture);

  // Trigger odds tick
  appState.updateOddsTick({
    fixtureId: 'fix-101',
    marketId: 'mkt-101',
    selectionId: 'sel-ars',
    newOdds: 1.20,
    oldOdds: 1.25,
  });

  const updatedArsOdd = sampleFixture.markets[0].selections[0].odds;
  if (updatedArsOdd !== 1.20) throw new Error('Odds delta failed to update fixture selection');
  console.log(`  Arsenal in-play odds shifted from 1.25 -> ${updatedArsOdd.toFixed(2)}`);

  // Render Live Match List HTML
  const matchHtml = LiveMatchListComponent.render(appState);
  if (!matchHtml.includes('Arsenal') || !matchHtml.includes('Chelsea')) {
    throw new Error('LiveMatchListComponent failed to render teams');
  }

  // Open Match Details View
  appState.openMatchDetails('fix-101');
  if (appState.activeFixtureId !== 'fix-101') throw new Error('Failed to set activeFixtureId on click');

  const matchDetailsHtml = MatchDetailsComponent.render(appState, 'fix-101');
  if (
    !matchDetailsHtml.includes('Correct Score') ||
    !matchDetailsHtml.includes('1X2')
  ) {
    throw new Error('MatchDetailsComponent failed to render basic markets');
  }

  // Close Match Details View
  appState.closeMatchDetails();
  if (appState.activeFixtureId !== null) throw new Error('Failed to reset activeFixtureId');

  console.log('  ✅ Test 2 Passed: Live match list, match details, and odds update verified.');

  // --------------------------------------------------------------------------
  // Test 3: Dynamic Betslip (Single & Multi/Combi)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Dynamic Betslip Selection & Multi-Leg Combis...');
  appState.toggleSelection({
    selectionId: 'sel-ars',
    selectionName: 'Arsenal',
    marketId: 'mkt-101',
    marketName: 'Full Time Result',
    fixtureId: 'fix-101',
    fixtureName: 'Arsenal vs Chelsea',
    odds: 1.20,
  });

  appState.toggleSelection({
    selectionId: 'sel-rm',
    selectionName: 'Real Madrid',
    marketId: 'mkt-102',
    marketName: 'Full Time Result',
    fixtureId: 'fix-102',
    fixtureName: 'Real Madrid vs Man City',
    odds: 2.50,
  });

  if (appState.slipItems.size !== 2 || appState.slipType !== 'COMBI') {
    throw new Error('Betslip auto-combi mode failed on multi-selection');
  }

  appState.setStake(50.0);
  const betslipHtml = BetslipComponent.render(appState);
  if (!betslipHtml.includes('Real Madrid') || !betslipHtml.includes('Arsenal') || !betslipHtml.includes('50')) {
    throw new Error('Betslip HTML failed to render selected picks');
  }
  console.log(`  Betslip rendered 2-leg Combi with $50 stake.`);
  console.log('  ✅ Test 3 Passed: Dynamic Betslip picks management and markup verified.');

  // --------------------------------------------------------------------------
  // Test 4: Casino Lobby (Simple Card Grid)
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Casino Lobby Card Grid...');
  appState.setActiveTab('casino');
  const casinoHtml = CasinoLobbyComponent.render(appState);
  if (!casinoHtml.includes('Blackjack') || !casinoHtml.includes('Roulette') || !casinoHtml.includes('Bingo')) {
    throw new Error('Casino lobby failed to render game cards');
  }
  if (!casinoHtml.includes("launchGame('blackjack'") || !casinoHtml.includes("launchGame('roulette'")) {
    throw new Error('Casino lobby game cards should launch the selected game');
  }
  appState.openGame('Classic Bingo 75', '/casino/bingo/index.html');
  if (appState.activeGameSlug !== 'bingo' || appState.activeTab !== 'game') {
    throw new Error('Header game shortcut must resolve to the playable engine');
  }
  appState.closeGame();
  console.log('  ✅ Test 4 Passed: Casino lobby and header game launch actions verified.');

  // --------------------------------------------------------------------------
  // Test 5: Sport Selection & Default Fixture Hydration
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Sport Selection & Default Fixtures...');
  appState.hydrateDefaultMatches();
  appState.selectSport(1);
  if (appState.selectedSportId !== 1 || appState.activeTab !== 'sports') {
    throw new Error('Sport selection failed');
  }

  // Verify default fixtures are hydrated
  if (appState.liveFixtures.size < 8) {
    throw new Error(`Expected at least 8 default fixtures, got ${appState.liveFixtures.size}`);
  }

  const arsFixture = appState.liveFixtures.get('fix-epl-002');
  if (!arsFixture || arsFixture.homeTeam !== 'Arsenal') {
    throw new Error('Default Arsenal fixture not hydrated');
  }
  console.log(`  ${appState.liveFixtures.size} fixtures hydrated, sport selection working.`);
  console.log('  ✅ Test 5 Passed: Sport selection and fixture hydration verified.');

  // --------------------------------------------------------------------------
  // Test 6: Slip Clear & Remove Selection
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Betslip Clear & Remove...');
  appState.removeSelection('sel-ars');
  if (appState.slipItems.size !== 1 || appState.slipType !== 'SINGLE') {
    throw new Error('Remove selection or auto-single failed');
  }

  appState.clearSlip();
  if (appState.slipItems.size !== 0) {
    throw new Error('Clear slip failed');
  }
  console.log('  ✅ Test 6 Passed: Betslip clear and remove verified.');

  // --------------------------------------------------------------------------
  // Test 7: Versioned Quotes, Live Market Suspensions & Locks
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] Testing Versioned Quotes & Live Market Suspension Lockout...');
  appState.applyVersionedQuote({
    fixtureId: 'fix-101',
    marketVersion: 3,
    quoteId: 'q-ver-003',
    status: 'ACTIVE',
    markets: {
      matchWinner: {
        status: 'ACTIVE',
        selections: [{ odds: 1.45 }, { odds: 4.10 }, { odds: 7.50 }],
      },
    },
  });

  const fix101 = appState.liveFixtures.get('fix-101');
  if (fix101.marketVersion !== 3 || fix101.quoteId !== 'q-ver-003') {
    throw new Error('Versioned quote failed to pin version and quoteId on fixture');
  }
  if (fix101.markets[0].selections[0].odds !== 1.45) {
    throw new Error('Versioned quote failed to update selection odds');
  }

  // Trigger live market suspension (e.g. VAR review)
  appState.setMarketSuspended('fix-101', true, 'VAR_REVIEW_IN_PROGRESS');
  if (!fix101.isSuspended || fix101.suspensionReason !== 'VAR_REVIEW_IN_PROGRESS') {
    throw new Error('Fixture failed to record suspension state and reason');
  }

  const suspendedHtml = LiveMatchListComponent.render(appState);
  if (!suspendedHtml.includes('VAR_REVIEW_IN_PROGRESS') || !suspendedHtml.includes('disabled')) {
    throw new Error('LiveMatchListComponent failed to lock oddButton during suspension');
  }

  // Unsuspend market
  appState.setMarketSuspended('fix-101', false);
  if (fix101.isSuspended) {
    throw new Error('Fixture failed to unsuspend');
  }
  console.log('  ✓ Applied Versioned Quote v3 (Quote ID: q-ver-003)');
  console.log('  ✓ Market suspended on VAR review: Buttons locked in UI');
  console.log('  ✓ Market unsuspended cleanly');
  console.log('  ✅ Test 7 Passed: Versioned quotes and market suspension locks verified.');

  // --------------------------------------------------------------------------
  // Test 8: Browser Login, Data Mode Separation & Server Quote Flow
  // --------------------------------------------------------------------------
  console.log('\n[Test 8] Testing Browser Login, Data Mode Separation & Quote Flow...');
  
  // 1. Data Mode Separation
  appState.setDataMode('SIMULATED');
  if (appState.dataMode !== 'SIMULATED') throw new Error('DataMode switch to SIMULATED failed');
  appState.setDataMode('REFERENCE_ONLY');
  if (appState.dataMode !== 'REFERENCE_ONLY') throw new Error('DataMode switch to REFERENCE_ONLY failed');
  appState.setDataMode('LICENSED_LIVE');
  if (appState.dataMode !== 'LICENSED_LIVE') throw new Error('DataMode switch to LICENSED_LIVE failed');
  appState.setDataMode('SIMULATED');

  // Explicit transport fixture: never authenticate from a failed network request.
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async (url:any)=>new Response(JSON.stringify(String(url).endsWith('/auth/login')?{token:'test-token',user:{id:'alice',username:'Alice_Punter',role:'PLAYER'}}:String(url).includes('/wallet/balance')?{balance:1000}:String(url).includes('/bets/user/')?{tickets:[]}:{quote:{quoteId:'server-issued-test-quote',expiresAt:Date.now()+5000,selection:{odds:1.25}}}),{status:200,headers:{'Content-Type':'application/json'}});
  // 2. Browser credential login
  await appState.login('Alice_Punter', 'test-password');
  if (!appState.isAuthenticated || appState.username !== 'Alice_Punter' || !appState.sessionToken) {
    throw new Error('Player login failed to set authenticated session');
  }
  console.log(`  ✓ Authenticated as ${appState.username} (${appState.userRole}) · Token: ${appState.sessionToken.slice(0, 16)}...`);

  // 3. Server Quote Acquisition & Timer
  const testPick = {
    selectionId: 'sel-ars',
    selectionName: 'Arsenal',
    marketId: 'mkt-101',
    marketName: 'Full Time Result',
    fixtureId: 'fix-101',
    fixtureName: 'Arsenal vs Chelsea',
    odds: 1.25,
  };
  appState.clearSlip();
  appState.toggleSelection(testPick);

  const quoteId = await appState.requestServerQuote(appState.slipItems.get('sel-ars')!);
  if (!quoteId || !appState.activeQuote) {
    throw new Error('Server quote acquisition failed');
  }
  if (appState.quoteCountdownSeconds <= 0) {
    throw new Error('Server quote countdown timer failed to start');
  }
  console.log(`  ✓ Server Quote #${quoteId.slice(0, 8)} locked @ ${appState.activeQuote.price} (${appState.quoteCountdownSeconds}s remaining)`);

  // 4. Betslip Markup with Locked Quote
  const betslipWithQuote = BetslipComponent.render(appState);
  if (!betslipWithQuote.includes('locked') || !betslipWithQuote.includes('remaining')) {
    throw new Error('Betslip HTML missing quote lock status badge');
  }

  // 5. Logout & Unauthenticated Gate
  appState.logout();
  if (appState.isAuthenticated || appState.activeQuote !== null) {
    throw new Error('Logout failed to reset authenticated state or clear active quote');
  }
  appState.toggleSelection(testPick);
  const unauthBetslip = BetslipComponent.render(appState);
  if (!unauthBetslip.includes('Sign in to lock quotes')) {
    throw new Error('Betslip HTML missing unauthenticated login prompt banner');
  }

  globalThis.fetch=originalFetch;
  console.log('  ✅ Test 8 Passed: Browser login, data-mode separation, and server quote flow verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Frontend Tests Passed!                               ');
  console.log('===============================================================');
  process.exit(0);
}

runFrontendTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
