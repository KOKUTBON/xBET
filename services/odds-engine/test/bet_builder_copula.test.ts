import assert from 'node:assert/strict';
import {
  CopulaMath,
  BetBuilderCopulaModel,
  type BuilderSelection,
} from '../src/domain/bet-builder-copula-model.ts';
import type { MatchContext } from '../src/domain/bivariate-poisson-model.ts';

console.log('===============================================================');
console.log('  📐 Running Copula Bet Builder (SGP) Mathematical Test Suite   ');
console.log('===============================================================');

// =========================================================================
// TEST 1: Copula Mathematical Axioms & CDF Invariants
// =========================================================================
console.log('\n[Test 1] Testing Standard Normal & Bivariate Copula Mathematics...');

// 1. Normal CDF
assert.ok(Math.abs(CopulaMath.normalCdf(0) - 0.5) < 1e-6);
assert.ok(Math.abs(CopulaMath.normalCdf(1.96) - 0.975002) < 1e-4);
assert.ok(Math.abs(CopulaMath.normalCdf(-1.96) - 0.024998) < 1e-4);

// 2. Inverse Normal (Probit)
assert.ok(Math.abs(CopulaMath.normalInverse(0.5) - 0.0) < 1e-6);
assert.ok(Math.abs(CopulaMath.normalInverse(0.975) - 1.95996) < 1e-4);

// 3. Gaussian Copula Independent Limit (rho = 0)
const indepCopula = CopulaMath.gaussianCopula(0.4, 0.5, 0.0);
assert.ok(Math.abs(indepCopula - 0.20) < 1e-3, `Expected 0.20, got ${indepCopula}`);

// 4. Gaussian Copula with Positive Correlation (rho = 0.5)
const posCopula = CopulaMath.gaussianCopula(0.4, 0.5, 0.5);
assert.ok(posCopula > 0.20, `Positively correlated copula (${posCopula}) must exceed independent (0.20)`);

// 5. Gaussian Copula with Negative Correlation (rho = -0.5)
const negCopula = CopulaMath.gaussianCopula(0.4, 0.5, -0.5);
assert.ok(negCopula < 0.20, `Negatively correlated copula (${negCopula}) must be less than independent (0.20)`);

// 6. Clayton Copula Tail Dependence
const clayton = CopulaMath.claytonCopula(0.6, 0.6, 2.0);
assert.ok(clayton > 0.36, `Clayton copula (${clayton}) must model positive tail dependence`);

console.log('  Normal CDF, Probit inverse, Gaussian, and Clayton copulas validated.');
console.log('  ✅ Test 1 Passed: Copula mathematical foundations confirmed.');

// =========================================================================
// TEST 2: Scoreline Positive Correlation (Home Win + Over 2.5 Goals)
// =========================================================================
console.log('\n[Test 2] Testing Positive Correlation: Arsenal Win + Over 2.5 Goals...');
const matchCtx: MatchContext = {
  fixtureId: 'fix-arsenal-chelsea',
  homeTeam: 'Arsenal',
  awayTeam: 'Chelsea',
  homeStrength: { attack: 1.30, defense: 0.90 },
  awayStrength: { attack: 1.05, defense: 1.10 },
  currentScore: { home: 0, away: 0 },
  minute: 0,
  redCards: { home: 0, away: 0 },
  stateSequence: 1,
};

const posSelections: BuilderSelection[] = [
  { id: 'sel-1', marketType: 'MATCH_WINNER', selectionName: 'HOME' },
  { id: 'sel-2', marketType: 'TOTAL_GOALS', selectionName: 'OVER', line: 2.5 },
];

const posResult = BetBuilderCopulaModel.priceSelections(matchCtx, posSelections);
assert.equal(posResult.isCompatible, true);
assert.equal(posResult.copulaUsed, 'SCORE_GRID_EXACT');

console.log('  Independent Probability:  ', (posResult.independentJointProbability * 100).toFixed(2) + '%');
console.log('  Correlated Probability:   ', (posResult.correlatedJointProbability * 100).toFixed(2) + '%');
console.log('  Independent Naive Odds:   ', posResult.independentOdds);
console.log('  Correlated Fair Odds:     ', posResult.correlatedFairOdds);
console.log('  Final Builder Odds (with margin):', posResult.finalBuilderOdds);

// In high-scoring favorite matches, Home Win is positively correlated with Over 2.5
// Therefore: P(Home & Over) > P(Home) * P(Over)
// Correlated Fair Odds MUST be lower than naive independent odds to eliminate punter positive edge!
assert.ok(
  posResult.correlatedJointProbability > posResult.independentJointProbability,
  'P(correlated) must exceed P(independent) for Home Win + Over 2.5'
);
assert.ok(
  posResult.correlatedFairOdds < posResult.independentOdds,
  'Correlated odds must be lower than independent naive odds'
);
console.log('  ✅ Test 2 Passed: Correlated odds correctly eliminate negative house edge on positive correlation.');

// =========================================================================
// TEST 3: Scoreline Negative Correlation (Draw + Over 2.5 Goals)
// =========================================================================
console.log('\n[Test 3] Testing Negative Correlation: Draw + Over 2.5 Goals...');
const negSelections: BuilderSelection[] = [
  { id: 'sel-3', marketType: 'MATCH_WINNER', selectionName: 'DRAW' },
  { id: 'sel-4', marketType: 'TOTAL_GOALS', selectionName: 'OVER', line: 2.5 },
];

const negResult = BetBuilderCopulaModel.priceSelections(matchCtx, negSelections);
assert.equal(negResult.isCompatible, true);

console.log('  Independent Probability:  ', (negResult.independentJointProbability * 100).toFixed(2) + '%');
console.log('  Correlated Probability:   ', (negResult.correlatedJointProbability * 100).toFixed(2) + '%');
console.log('  Independent Naive Odds:   ', negResult.independentOdds);
console.log('  Final Builder Odds:       ', negResult.finalBuilderOdds);

// Draws are predominantly 0-0 or 1-1 (Under 2.5). Draws with 3+ goals (2-2, 3-3) are rare!
// Therefore: P(Draw & Over 2.5) < P(Draw) * P(Over 2.5)
assert.ok(
  negResult.correlatedJointProbability < negResult.independentJointProbability,
  'P(correlated) must be lower than P(independent) for Draw + Over 2.5'
);
assert.ok(
  negResult.correlatedFairOdds > negResult.independentOdds,
  'Correlated fair odds must be higher than naive independent odds'
);
console.log('  ✅ Test 3 Passed: Negative correlation correctly rewards punter with higher odds for rare joint outcomes.');

// =========================================================================
// TEST 4: Mutually Exclusive Selection Rejection
// =========================================================================
console.log('\n[Test 4] Testing Mutually Exclusive Conflict Detection & Rejection...');

// Case A: Conflicting Match Winners (Home Win + Away Win on same match)
const conflicting1X2: BuilderSelection[] = [
  { id: 'c-1', marketType: 'MATCH_WINNER', selectionName: 'HOME' },
  { id: 'c-2', marketType: 'MATCH_WINNER', selectionName: 'AWAY' },
];
const conflictRes1 = BetBuilderCopulaModel.priceSelections(matchCtx, conflicting1X2);
assert.equal(conflictRes1.isCompatible, false);
assert.ok(conflictRes1.rejectionReason?.includes('CONTRADICTING_MATCH_WINNER'));
console.log('  Case A correctly rejected: Home Win + Away Win');

// Case B: Contradicting Totals (Over 2.5 + Under 1.5)
const conflictingTotals: BuilderSelection[] = [
  { id: 'c-3', marketType: 'TOTAL_GOALS', selectionName: 'OVER', line: 2.5 },
  { id: 'c-4', marketType: 'TOTAL_GOALS', selectionName: 'UNDER', line: 1.5 },
];
const conflictRes2 = BetBuilderCopulaModel.priceSelections(matchCtx, conflictingTotals);
assert.equal(conflictRes2.isCompatible, false);
assert.ok(conflictRes2.rejectionReason?.includes('MUTUALLY_EXCLUSIVE_TOTALS'));
console.log('  Case B correctly rejected: Over 2.5 + Under 1.5');
console.log('  ✅ Test 4 Passed: Mutually exclusive selections safely blocked from pricing.');

// =========================================================================
// TEST 5: Hybrid Copula with Player Anytime Goalscorer
// =========================================================================
console.log('\n[Test 5] Testing Hybrid Gaussian Copula: Bukayo Saka to Score + Arsenal to Win...');
const hybridSelections: BuilderSelection[] = [
  { id: 'h-1', marketType: 'MATCH_WINNER', selectionName: 'HOME' },
  {
    id: 'h-2',
    marketType: 'PLAYER_ANYTIME_SCORER',
    selectionName: 'Bukayo Saka',
    individualOdds: 2.60, // ~38.4% implied probability
    playerTeam: 'HOME',
  },
];

const hybridResult = BetBuilderCopulaModel.priceSelections(matchCtx, hybridSelections);
assert.equal(hybridResult.isCompatible, true);
assert.equal(hybridResult.copulaUsed, 'HYBRID_COPULA');
assert.ok(hybridResult.effectiveCorrelation > 0, 'Home player scoring must positively correlate with Home Win');

console.log('  Effective Correlation (rho):', hybridResult.effectiveCorrelation);
console.log('  Independent Joint Odds:     ', hybridResult.independentOdds);
console.log('  Final Correlated SGP Odds:  ', hybridResult.finalBuilderOdds);
console.log('  ✅ Test 5 Passed: Hybrid Copula successfully prices Player Prop + Match Winner.');

console.log('===============================================================');
console.log('  🎉 All Copula Bet Builder Mathematical Tests Passed!         ');
console.log('===============================================================');
