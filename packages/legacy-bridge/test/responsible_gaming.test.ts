import { ResponsibleGamingManager } from '../src/responsible-gaming/responsible-gaming-manager.ts';

async function runTest() {
  console.log('===============================================================');
  console.log('  🛡️ Running Player Responsible Gaming & Self-Protection Suite ');
  console.log('===============================================================');

  const rgManager = ResponsibleGamingManager.getInstance();

  // Test 1: Immediate Deposit Limit Decreases
  console.log('\n[Test 1] Testing Immediate Deposit Limit Decreases...');
  const userId = 'usr-player-rg-101';
  
  // Set initial daily limit of $200
  const initResult = rgManager.setDepositLimits(userId, { dailyLimit: 200.0, weeklyLimit: 1000.0 });
  console.log('  Initial Limits:', initResult.profile.depositLimits);
  if (initResult.profile.depositLimits.dailyLimit !== 200.0) {
    throw new Error('Initial limit setting failed');
  }

  // Decrease limit to $100 -> Must take effect immediately
  const decreaseResult = rgManager.setDepositLimits(userId, { dailyLimit: 100.0 });
  console.log('  Decreased Limit (Immediate):', decreaseResult.profile.depositLimits.dailyLimit);
  if (decreaseResult.profile.depositLimits.dailyLimit !== 100.0) {
    throw new Error('Immediate limit decrease failed');
  }
  console.log('  ✅ Test 1 Passed: Limit decrease applied immediately with zero delay.');

  // Test 2: Mandatory 24-Hour Cooling-Off on Limit Increases
  console.log('\n[Test 2] Testing 24-Hour Cooling-Off Queue on Limit Increases...');
  const increaseResult = rgManager.setDepositLimits(userId, { dailyLimit: 500.0 });
  console.log('  Active Limit right after increase request:', increaseResult.profile.depositLimits.dailyLimit);
  console.log('  Queued Changes Count:', increaseResult.queuedChanges.length);

  // Active limit should STILL be $100 until 24h elapses
  if (increaseResult.profile.depositLimits.dailyLimit !== 100.0 || increaseResult.queuedChanges.length === 0) {
    throw new Error('Limit increase was applied prematurely without 24h cooling off');
  }

  // Simulate 25 hours passing
  const futureTime = new Date(Date.now() + 25 * 60 * 60 * 1000);
  rgManager.processPendingLimitChanges(userId, futureTime);
  const updatedProfile = rgManager.getOrCreateProfile(userId);
  console.log('  Active Limit after 24h cooling-off elapsed:', updatedProfile.depositLimits.dailyLimit);
  if (updatedProfile.depositLimits.dailyLimit !== 500.0) {
    throw new Error('Pending limit change failed to apply after 24h cooling-off');
  }
  console.log('  ✅ Test 2 Passed: 24-hour mandatory delay enforced on limit increases.');

  // Test 3: Deposit Velocity & Limit Cap Enforcement
  console.log('\n[Test 3] Testing Deposit Velocity & Limit Cap Enforcement...');
  const user2 = 'usr-player-rg-202';
  rgManager.setDepositLimits(user2, { dailyLimit: 250.0 });

  // Deposit $150 (Allowed)
  const dep1Check = rgManager.canDeposit(user2, 150.0);
  console.log('  Deposit $150 check allowed:', dep1Check.allowed);
  if (!dep1Check.allowed) throw new Error('Valid deposit within limit was rejected');
  rgManager.recordDeposit(user2, 150.0);

  // Deposit another $150 ($150 + $150 = $300 > $250 -> Should be rejected!)
  const dep2Check = rgManager.canDeposit(user2, 150.0);
  console.log('  Deposit $150 check exceeding daily cap allowed:', dep2Check.allowed, '| Reason:', dep2Check.reason);
  if (dep2Check.allowed) throw new Error('Deposit exceeding daily limit was allowed');
  console.log('  ✅ Test 3 Passed: Daily deposit limit enforced with strict rejection on overage.');

  // Test 4: Temporary Account Cool-Off (24 Hours)
  console.log('\n[Test 4] Testing Temporary Account Cool-Off Lockout...');
  const user3 = 'usr-player-rg-303';
  rgManager.setCoolOff(user3, 24, 'Player requested time-out');

  const coolOffLogin = rgManager.canLogin(user3);
  console.log('  Login during Cool-Off allowed:', coolOffLogin.allowed, '| Reason:', coolOffLogin.reason);
  if (coolOffLogin.allowed) throw new Error('User in cool-off was permitted to log in');

  const coolOffDeposit = rgManager.canDeposit(user3, 50.0);
  if (coolOffDeposit.allowed) throw new Error('User in cool-off was permitted to deposit');

  // Simulate cool-off expiration (+25 hours)
  const afterCoolOffTime = new Date(Date.now() + 25 * 60 * 60 * 1000);
  const afterCoolOffLogin = rgManager.canLogin(user3, afterCoolOffTime);
  console.log('  Login after Cool-Off expired allowed:', afterCoolOffLogin.allowed);
  if (!afterCoolOffLogin.allowed) throw new Error('User could not log in after cool-off expired');
  console.log('  ✅ Test 4 Passed: Temporary cool-off blocked access and expired automatically.');

  // Test 5: Permanent Self-Exclusion
  console.log('\n[Test 5] Testing Permanent Self-Exclusion...');
  const user4 = 'usr-player-rg-404';
  rgManager.setSelfExclusion(user4, 0, true, 'Permanent self-exclusion requested');

  const exclusionLogin = rgManager.canLogin(user4);
  console.log('  Login during Self-Exclusion allowed:', exclusionLogin.allowed, '| Reason:', exclusionLogin.reason);
  if (exclusionLogin.allowed) throw new Error('Self-excluded user was permitted to log in');

  const farFutureTime = new Date(Date.now() + 365 * 10 * 24 * 60 * 60 * 1000); // 10 years later
  const farFutureLogin = rgManager.canLogin(user4, farFutureTime);
  if (farFutureLogin.allowed) throw new Error('Permanent self-exclusion expired prematurely');
  console.log('  ✅ Test 5 Passed: Permanent self-exclusion lockout enforced indefinitely.');

  // Test 6: In-Play Reality Check Calculations
  console.log('\n[Test 6] Testing Session Reality Check Summary...');
  const sessionStart = new Date(Date.now() - 60 * 60 * 1000); // 60 minutes ago
  const realityCheck = rgManager.getRealityCheck('usr-player-rg-505', sessionStart, {
    totalBets: 12,
    totalWagered: 300.0,
    totalWon: 420.0,
  });

  console.log('  Reality Check Summary:', realityCheck);
  if (realityCheck.sessionDurationMinutes < 59 || realityCheck.netProfitLoss !== 120.0) {
    throw new Error('Reality check calculation mismatch');
  }
  console.log('  ✅ Test 6 Passed: Reality check session duration and net P&L calculated accurately.');

  console.log('\n===============================================================');
  console.log('  🎉 All Responsible Gaming & Player Protection Tests Passed!  ');
  console.log('===============================================================');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
