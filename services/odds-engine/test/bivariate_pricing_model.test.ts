import assert from 'node:assert/strict';
import {
  BivariatePoissonModel,
  type MatchContext,
} from '../src/domain/bivariate-poisson-model.ts';
import { VersionedQuoteService } from '../src/canonical/versioned-quote-service.ts';
import type { FootballState } from '../../../../packages/core-types/src/canonical-event.ts';

async function runBivariatePricingModelTests() {
  console.log('===============================================================');
  console.log('  ⚽ Running Bivariate Poisson Pricing & Quote Pipeline Suite');
  console.log('===============================================================');

  // --------------------------------------------------------------------------
  // Test 1: Mathematical Invariants & Probability Sum Conservation
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Joint Probability Grid Invariants & Normalization...');
  const baseContext: MatchContext = {
    fixtureId: 'fix-arsenal-chelsea',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    homeStrength: { attack: 1.25, defense: 0.90 },
    awayStrength: { attack: 1.10, defense: 1.05 },
    currentScore: { home: 0, away: 0 },
    minute: 0,
    redCards: { home: 0, away: 0 },
    stateSequence: 1,
  };

  const modelOutput = BivariatePoissonModel.evaluate(baseContext, 1.06);

  // Verify joint grid sums to 1.0 within numerical float tolerance
  const sumProb = modelOutput.jointScoreGrid.reduce((sum, cell) => sum + cell.probability, 0);
  assert.ok(Math.abs(sumProb - 1.0) < 1e-6, `Joint grid must sum to 1.0, got ${sumProb}`);

  // 1X2 Probabilities must sum to 1.0
  const m1x2 = modelOutput.markets.matchWinner.selections;
  const sum1x2 = m1x2.reduce((sum, s) => sum + s.fairProbability, 0);
  assert.ok(Math.abs(sum1x2 - 1.0) < 1e-4, `1X2 fair probabilities must sum to 1.0, got ${sum1x2}`);

  // Over/Under 2.5 Probabilities must sum to 1.0
  const mOU25 = modelOutput.markets.totalGoals25.selections;
  const sumOU25 = mOU25.reduce((sum, s) => sum + s.fairProbability, 0);
  assert.ok(Math.abs(sumOU25 - 1.0) < 1e-4, `Over/Under fair probabilities must sum to 1.0, got ${sumOU25}`);

  console.log(`  ✓ 1X2 Odds (Margin 1.06): Home @ ${m1x2[0].odds} | Draw @ ${m1x2[1].odds} | Away @ ${m1x2[2].odds}`);
  console.log(`  ✓ Total Goals 2.5: Over @ ${mOU25[0].odds} | Under @ ${mOU25[1].odds}`);
  console.log('  ✅ Test 1 Passed: Probability grid normalization and market invariants verified.');

  // --------------------------------------------------------------------------
  // Test 2: In-Play Time Decay Dynamics (0-0 Score Progression)
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing In-Play Clock Progression & Draw/Under Convergence...');
  const minute0 = BivariatePoissonModel.evaluate({ ...baseContext, minute: 0 });
  const minute45 = BivariatePoissonModel.evaluate({ ...baseContext, minute: 45 });
  const minute80 = BivariatePoissonModel.evaluate({ ...baseContext, minute: 80 });

  const pDraw0 = minute0.markets.matchWinner.selections[1].fairProbability;
  const pDraw45 = minute45.markets.matchWinner.selections[1].fairProbability;
  const pDraw80 = minute80.markets.matchWinner.selections[1].fairProbability;

  assert.ok(pDraw45 > pDraw0, 'Draw probability must increase at 45 min for 0-0 scoreline');
  assert.ok(pDraw80 > pDraw45, 'Draw probability must strongly increase at 80 min for 0-0 scoreline');

  const pUnder0 = minute0.markets.totalGoals25.selections[1].fairProbability;
  const pUnder45 = minute45.markets.totalGoals25.selections[1].fairProbability;
  const pUnder80 = minute80.markets.totalGoals25.selections[1].fairProbability;

  assert.ok(pUnder45 > pUnder0, 'Under 2.5 probability must increase as time elapses without goals');
  assert.ok(pUnder80 > pUnder45, 'Under 2.5 probability must dominate late in match');

  console.log(`  ✓ Draw Fair Probability: Min 0: ${(pDraw0 * 100).toFixed(1)}% -> Min 45: ${(pDraw45 * 100).toFixed(1)}% -> Min 80: ${(pDraw80 * 100).toFixed(1)}%`);
  console.log(`  ✓ Under 2.5 Fair Probability: Min 0: ${(pUnder0 * 100).toFixed(1)}% -> Min 45: ${(pUnder45 * 100).toFixed(1)}% -> Min 80: ${(pUnder80 * 100).toFixed(1)}%`);
  console.log('  ✅ Test 2 Passed: Time decay curves mathematically confirmed.');

  // --------------------------------------------------------------------------
  // Test 3: Red Card Tactical Shading & Asymmetry
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Red Card Disciplinary Impact on Team Expectancy...');
  const noRed = BivariatePoissonModel.evaluate({ ...baseContext, minute: 30, redCards: { home: 0, away: 0 } });
  const homeRed = BivariatePoissonModel.evaluate({ ...baseContext, minute: 30, redCards: { home: 1, away: 0 } });

  const pHomeNoRed = noRed.markets.matchWinner.selections[0].fairProbability;
  const pHomeWithRed = homeRed.markets.matchWinner.selections[0].fairProbability;
  const pAwayWithRed = homeRed.markets.matchWinner.selections[2].fairProbability;
  const pAwayNoRed = noRed.markets.matchWinner.selections[2].fairProbability;

  assert.ok(pHomeWithRed < pHomeNoRed, 'Home win probability must drop significantly after Home red card');
  assert.ok(pAwayWithRed > pAwayNoRed, 'Away win probability must rise significantly after Home red card');

  console.log(`  ✓ Home Win Prob: 11v11: ${(pHomeNoRed * 100).toFixed(1)}% -> 10v11: ${(pHomeWithRed * 100).toFixed(1)}%`);
  console.log(`  ✓ Away Win Prob: 11v11: ${(pAwayNoRed * 100).toFixed(1)}% -> 10v11: ${(pAwayWithRed * 100).toFixed(1)}%`);
  console.log('  ✅ Test 3 Passed: Red card impact correctly shifts goal expectancies.');

  // --------------------------------------------------------------------------
  // Test 4: Versioned Authoritative Quotes & Monotonic Versioning
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Versioned Quote Generation & Monotonic Market Versions...');
  const quoteService = VersionedQuoteService.getInstance();

  const mockState: FootballState = {
    fixtureId: 'fix-arsenal-chelsea',
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    status: 'IN_PLAY',
    score: { home: 1, away: 0 },
    minute: 25,
    period: 'FIRST_HALF',
    redCards: { home: 0, away: 0 },
    marketSuspended: false,
    sequence: 5,
    lastEventId: 'evt-005',
    lastProcessedAt: new Date().toISOString(),
  };

  const q1 = quoteService.generateQuote(mockState);
  assert.equal(q1.marketVersion, 1);
  assert.equal(q1.stateSequence, 5);
  assert.equal(q1.status, 'ACTIVE');

  // Next event arrives: Monotonic version MUST increment
  const updatedState: FootballState = {
    ...mockState,
    score: { home: 1, away: 1 },
    minute: 34,
    sequence: 6,
  };
  const q2 = quoteService.generateQuote(updatedState);
  assert.equal(q2.marketVersion, 2, 'Market version must increment monotonically');
  assert.equal(q2.stateSequence, 6);

  // Validate quote acceptance
  const validCheck = quoteService.validateForAcceptance(q2.quoteId);
  assert.equal(validCheck.valid, true, 'Latest active quote must be valid for acceptance');

  // Superseded quote q1 must fail acceptance
  const oldCheck = quoteService.validateForAcceptance(q1.quoteId);
  assert.equal(oldCheck.valid, false);
  assert.equal(oldCheck.reason, 'MARKET_VERSION_SUPERSEDED', 'Superseded quote version must be rejected');

  // Stale/Suspended quote check
  const suspendedState: FootballState = {
    ...updatedState,
    marketSuspended: true,
    suspensionReason: 'VAR_REVIEW_IN_PROGRESS',
    sequence: 7,
  };
  const q3 = quoteService.generateQuote(suspendedState);
  assert.equal(q3.status, 'SUSPENDED');
  assert.equal(q3.maxStake, 0);

  const suspendedCheck = quoteService.validateForAcceptance(q3.quoteId);
  assert.equal(suspendedCheck.valid, false);
  assert.equal(suspendedCheck.reason, 'VAR_REVIEW_IN_PROGRESS');

  console.log(`  ✓ Monotonic versions: Quote 1 (v${q1.marketVersion}) -> Quote 2 (v${q2.marketVersion})`);
  console.log(`  ✓ Suspended Quote 3 rejected: Reason: ${suspendedCheck.reason}`);
  console.log('  ✅ Test 4 Passed: Versioned quote lifecycle and monotonic validation verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Bivariate Poisson Pricing & Quote Tests PASSED!      ');
  console.log('===============================================================\n');
}

runBivariatePricingModelTests().catch((err) => {
  console.error('\n❌ Bivariate Pricing Test Suite Failed:', err);
  process.exit(1);
});
