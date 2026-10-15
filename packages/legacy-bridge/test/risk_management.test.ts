/**
 * Advanced Risk Management & Fraud Detection Test Suite
 * Tests liability accumulation, velocity rate-limiting, multi-account collusion,
 * sharp bettor throttling, and backoffice fraud alert lifecycle.
 */

import { RiskEngine } from '../src/risk/risk-engine.ts';
import { PlayerRiskProfile, RiskLevel, RiskFlagType } from '../src/risk/risk-types.ts';

async function runRiskTests() {
  console.log('===============================================================');
  console.log('  🛡️ Running Advanced Risk Management & Fraud Test Suite       ');
  console.log('===============================================================');

  const riskEngine = RiskEngine.getInstance();
  riskEngine.updateConfig({
    defaultMaxStake: 5000.0,
    defaultMaxWin: 100000.0,
    defaultMaxFixtureLiability: 20000.0, // $20,000 max bookmaker payout liability
    velocityWindowSeconds: 10,
    maxBetsPerWindow: 3,
    collusionWindowSeconds: 60,
    sharpStakeMultiplier: 0.20, // $1,000 max stake for sharps
  });

  const normalUser = 'usr_recreational_01';
  const sharpUser = 'usr_sharp_syndicate_02';
  const suspendedUser = 'usr_fraud_banned_03';
  const sharedIp = '203.0.113.88';

  // --------------------------------------------------------------------------
  // Test 1: Standard Recreational Bet Evaluation
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Standard Recreational Bet Placement...');
  const recEval = riskEngine.evaluateBetPlacement({
    userId: normalUser,
    stake: 100.0,
    potentialPayout: 250.0,
    legs: [
      {
        fixtureId: 'fix-arsenal-chelsea',
        fixtureName: 'Arsenal vs Chelsea',
        marketName: '1X2',
        selectionName: 'Arsenal',
        odds: 2.50,
      },
    ],
    ipAddress: '198.51.100.1',
  });

  console.log(`  Allowed: ${recEval.allowed} | Risk Score: ${recEval.riskScore} | Flags: [${recEval.flags.join(', ')}]`);
  if (!recEval.allowed || recEval.riskScore > 20 || recEval.flags.length > 0) {
    throw new Error('Normal recreational bet was incorrectly flagged or rejected');
  }
  console.log('  ✅ Test 1 Passed: Recreational bet approved with minimal risk score.');

  // --------------------------------------------------------------------------
  // Test 2: Suspended Account Rejection
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Suspended Account Risk Guard...');
  riskEngine.setPlayerProfile(suspendedUser, PlayerRiskProfile.SUSPENDED);

  const suspEval = riskEngine.evaluateBetPlacement({
    userId: suspendedUser,
    stake: 50.0,
    potentialPayout: 100.0,
    legs: [
      {
        fixtureId: 'fix-arsenal-chelsea',
        fixtureName: 'Arsenal vs Chelsea',
        marketName: '1X2',
        selectionName: 'Draw',
        odds: 3.40,
      },
    ],
  });

  console.log(`  Allowed: ${suspEval.allowed} | Reason: "${suspEval.rejectionReason}"`);
  if (suspEval.allowed || !suspEval.flags.includes(RiskFlagType.ACCOUNT_SUSPENDED)) {
    throw new Error('Suspended account bet was not rejected');
  }
  console.log('  ✅ Test 2 Passed: Suspended account blocked immediately.');

  // --------------------------------------------------------------------------
  // Test 3: Sharp Punter Dynamic Stake Limitation
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Sharp Punter Profiling & Stake Throttling...');
  riskEngine.setPlayerProfile(sharpUser, PlayerRiskProfile.SHARP_PUNTER);

  const sharpEval = riskEngine.evaluateBetPlacement({
    userId: sharpUser,
    stake: 3000.0, // Above sharp cap ($1,000)
    potentialPayout: 6000.0,
    legs: [
      {
        fixtureId: 'fix-arsenal-chelsea',
        fixtureName: 'Arsenal vs Chelsea',
        marketName: '1X2',
        selectionName: 'Arsenal',
        odds: 2.0,
      },
    ],
  });

  console.log(`  Allowed: ${sharpEval.allowed} | Adjusted Max Stake: $${sharpEval.adjustedMaxStake} | Reason: "${sharpEval.rejectionReason}"`);
  if (sharpEval.allowed || sharpEval.adjustedMaxStake !== 1000.0) {
    throw new Error('Sharp punter was not throttled to 20% limit ($1,000)');
  }
  console.log('  ✅ Test 3 Passed: Sharp punter stake capped with dynamic limit feedback.');

  // --------------------------------------------------------------------------
  // Test 4: Bet Velocity Rate-Limiting (Bot Protection)
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Rapid-Fire Bet Velocity Limiter...');
  const rapidUser = 'usr_bot_speed_99';

  // Place 3 allowed bets in under 1 second
  for (let i = 1; i <= 3; i++) {
    riskEngine.recordBetPlacement({
      userId: rapidUser,
      stake: 20.0,
      legs: [{ fixtureId: `fix-rapid-${i}`, fixtureName: `Game ${i}`, marketName: '1X2', selectionName: 'Home', odds: 1.8 }],
    });
  }

  // Attempt 4th bet immediately
  const speedEval = riskEngine.evaluateBetPlacement({
    userId: rapidUser,
    stake: 20.0,
    potentialPayout: 36.0,
    legs: [{ fixtureId: 'fix-rapid-4', fixtureName: 'Game 4', marketName: '1X2', selectionName: 'Home', odds: 1.8 }],
  });

  console.log(`  4th Bet Allowed: ${speedEval.allowed} | Risk Score: ${speedEval.riskScore} | Flags: [${speedEval.flags.join(', ')}]`);
  if (speedEval.allowed || !speedEval.flags.includes(RiskFlagType.BET_VELOCITY_EXCEEDED)) {
    throw new Error('Velocity limiter did not trigger on 4th rapid bet');
  }
  console.log('  ✅ Test 4 Passed: Bet velocity rate limit guarded against bot spam.');

  // --------------------------------------------------------------------------
  // Test 5: Syndicate & Multi-Accounting Collision
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Multi-Accounting Collusion from Shared IP...');
  const playerA = 'player_syndicate_alpha';
  const playerB = 'player_syndicate_beta';

  const clFixture = {
    fixtureId: 'fix-cl-real-city',
    fixtureName: 'Real Madrid vs Manchester City',
    marketName: '1X2',
    selectionName: 'Real Madrid',
    odds: 2.50,
  };

  // Player A places bet from shared IP
  riskEngine.recordBetPlacement({
    userId: playerA,
    stake: 500.0,
    legs: [clFixture],
    ipAddress: sharedIp,
  });

  // Player B attempts same selection from same IP within 60s
  const collusionEval = riskEngine.evaluateBetPlacement({
    userId: playerB,
    stake: 500.0,
    potentialPayout: 1250.0,
    legs: [clFixture],
    ipAddress: sharedIp,
  });

  console.log(`  Flags: [${collusionEval.flags.join(', ')}] | Risk Score: ${collusionEval.riskScore}`);
  if (!collusionEval.flags.includes(RiskFlagType.MULTI_ACCOUNTING_COLLUSION) || collusionEval.riskScore < 50) {
    throw new Error('Multi-accounting collision not detected');
  }
  console.log('  ✅ Test 5 Passed: Collusion detected and critical fraud alert emitted.');

  // --------------------------------------------------------------------------
  // Test 6: Bookmaker Liability Exposure Accumulation & Capping
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Real-Time Fixture Liability Accumulation & Capping...');
  const hotFixture = {
    fixtureId: 'fix-liverpool-mancity',
    fixtureName: 'Liverpool vs Manchester City',
    marketName: '1X2',
    selectionName: 'Liverpool',
    odds: 3.0,
  };

  // Heavy market accumulation: $6,000 stake @ 3.0 = $18,000 payout liability (Cap is $20,000)
  riskEngine.recordBetPlacement({
    userId: 'usr_whale_1',
    stake: 6000.0,
    legs: [hotFixture],
  });

  const liabilityBefore = riskEngine.getMarketLiability(hotFixture.fixtureId, hotFixture.marketName, hotFixture.selectionName);
  console.log(`  Accumulated Exposure: $${liabilityBefore?.totalPotentialPayout} (${liabilityBefore?.currentExposurePercentage}% of cap)`);

  // Next bet of $2,000 stake @ 3.0 would add $6,000 liability (Total $24,000 > $20,000 limit)
  const capEval = riskEngine.evaluateBetPlacement({
    userId: 'usr_whale_2',
    stake: 2000.0,
    potentialPayout: 6000.0,
    legs: [hotFixture],
  });

  console.log(`  Allowed: ${capEval.allowed} | Adjusted Max Stake: $${capEval.adjustedMaxStake} | Reason: "${capEval.rejectionReason}"`);
  if (capEval.allowed || !capEval.flags.includes(RiskFlagType.HIGH_LIABILITY_EXPOSURE)) {
    throw new Error('Liability ceiling was not enforced');
  }
  // Remaining liability is $2,000 / (3.0 - 1) = $1,000 max stake
  if (capEval.adjustedMaxStake !== 1000.0) {
    throw new Error(`Expected adjusted stake of $1000, got $${capEval.adjustedMaxStake}`);
  }
  console.log('  ✅ Test 6 Passed: Bookmaker liability cap protected platform from over-exposure.');

  // --------------------------------------------------------------------------
  // Test 7: Backoffice Fraud Alert Lifecycle & Auditor Resolution
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] Testing Backoffice Fraud Alert Inbox & Resolution...');
  const openAlerts = riskEngine.getFraudAlerts(true);
  console.log(`  Unresolved Fraud Alerts Count: ${openAlerts.length}`);

  const criticalAlert = openAlerts.find((a) => a.riskLevel === RiskLevel.CRITICAL);
  console.log(`  Found Critical Alert: "${criticalAlert?.title}" (User: ${criticalAlert?.userId})`);

  if (!criticalAlert) throw new Error('Critical fraud alert missing from alert center');

  console.log('  Auditor resolving alert...');
  riskEngine.resolveFraudAlert(criticalAlert.id, 'auditor_compliance_officer_1');

  const remainingOpen = riskEngine.getFraudAlerts(true);
  console.log(`  Remaining Unresolved Alerts: ${remainingOpen.length}`);
  if (remainingOpen.length !== openAlerts.length - 1) {
    throw new Error('Fraud alert resolution failed');
  }
  console.log('  ✅ Test 7 Passed: Backoffice fraud alert center and resolution lifecycle verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Advanced Risk & Fraud Management Tests Passed!        ');
  console.log('===============================================================');
  process.exit(0);
}

runRiskTests().catch((err) => {
  console.error('❌ Risk Tests failed:', err);
  process.exit(1);
});
