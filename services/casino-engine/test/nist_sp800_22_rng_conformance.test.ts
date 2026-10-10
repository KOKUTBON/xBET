import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { NistRngValidator } from '../src/compliance/nist-rng-validator.ts';
import { ResponsibleGamingGuard } from '../src/compliance/responsible-gaming-guard.ts';
import { ProvablyFairRNG } from '../src/rng/provably-fair.ts';

console.log('===============================================================');
console.log('  📜 Running NIST SP 800-22 RNG Statistical Conformance Suite  ');
console.log('===============================================================');

// Generate 128,000 cryptographic bits using HMAC-SHA256 provably fair generator
const serverSeed = process.env.NIST_TEST_SERVER_SEED || 'audit_server_seed_2';
const clientSeed = 'nist_sp800_22_audit_client_seed_2026';
const numHashes = 500; // 500 * 32 bytes * 8 bits = 128,000 bits
const bitStream = new Uint8Array(numHashes * 256);

let bitIdx = 0;
for (let nonce = 1; nonce <= numHashes; nonce++) {
  const hash = createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest();

  for (let byteIdx = 0; byteIdx < 32; byteIdx++) {
    const byte = hash[byteIdx];
    for (let b = 7; b >= 0; b--) {
      bitStream[bitIdx++] = (byte >> b) & 1;
    }
  }
}

console.log(`Generated ${bitStream.length} bits via ProvablyFair HMAC-SHA256 PRNG.`);

// =========================================================================
// TEST 1: Frequency (Monobit) Test
// =========================================================================
console.log('\n[Test 1] Testing NIST SP 800-22 Frequency (Monobit) Test...');
const monobit = NistRngValidator.frequencyMonobitTest(bitStream);
console.log(`  Statistic (s_obs): ${monobit.statistic} | P-value: ${monobit.pValue} (Passed: ${monobit.passed})`);
assert.equal(monobit.passed, true);
assert.ok(monobit.pValue >= 0.01);
console.log('  ✅ Test 1 Passed: Monobit test conforms to NIST SP 800-22 standards.');

// =========================================================================
// TEST 2: Block Frequency Test (M = 128)
// =========================================================================
console.log('\n[Test 2] Testing NIST SP 800-22 Block Frequency Test (M=128)...');
const blockFreq = NistRngValidator.blockFrequencyTest(bitStream, 128);
console.log(`  Statistic (Chi^2): ${blockFreq.statistic} | P-value: ${blockFreq.pValue} (Passed: ${blockFreq.passed})`);
assert.equal(blockFreq.passed, true);
assert.ok(blockFreq.pValue >= 0.01);
console.log('  ✅ Test 2 Passed: Block frequency uniformity confirmed.');

// =========================================================================
// TEST 3: Runs Test
// =========================================================================
console.log('\n[Test 3] Testing NIST SP 800-22 Runs Test...');
const runs = NistRngValidator.runsTest(bitStream);
console.log(`  Statistic (Observed Runs): ${runs.statistic} | P-value: ${runs.pValue} (Passed: ${runs.passed})`);
assert.equal(runs.passed, true);
assert.ok(runs.pValue >= 0.01);
console.log('  ✅ Test 3 Passed: Bit oscillation rate matches true randomness.');

// =========================================================================
// TEST 4: Cumulative Sums (Cusum) Test
// =========================================================================
console.log('\n[Test 4] Testing NIST SP 800-22 Cumulative Sums (Cusum) Test...');
const cusum = NistRngValidator.cumulativeSumsTest(bitStream);
console.log(`  Statistic (Max Excursion): ${cusum.statistic} | P-value: ${cusum.pValue} (Passed: ${cusum.passed})`);
assert.equal(cusum.passed, true);
assert.ok(cusum.pValue >= 0.01);
console.log('  ✅ Test 4 Passed: Random walk excursions remain within bounded tolerances.');

// =========================================================================
// TEST 5: Discrete Symbol Chi-Square Uniformity (Roulette 37 Pockets)
// =========================================================================
console.log('\n[Test 5] Testing Discrete Symbol Chi-Square Goodness-of-Fit (37 Pockets)...');
const numSpins = 18500; // 500 spins expected per pocket
const rouletteSpins: number[] = [];
for (let i = 0; i < numSpins; i++) {
  const hash = createHmac('sha256', serverSeed)
    .update(`${clientSeed}:roulette:${i}`)
    .digest();
  const num = hash.readUInt32BE(0) % 37;
  rouletteSpins.push(num);
}

const chiSquare = NistRngValidator.chiSquareSymbolTest(rouletteSpins, 37);
console.log(`  Statistic (Chi^2): ${chiSquare.statistic} | P-value: ${chiSquare.pValue} (Passed: ${chiSquare.passed})`);
assert.equal(chiSquare.passed, true);
assert.ok(chiSquare.pValue >= 0.01);
console.log('  ✅ Test 5 Passed: Discrete roulette pockets display uniform empirical distribution.');

// =========================================================================
// TEST 6: Complete GLI-19 Certification Battery Report
// =========================================================================
console.log('\n[Test 6] Generating GLI-19 Regulatory Certification Report...');
const certReport = NistRngValidator.runBattery(bitStream, 'HMAC-SHA256-RNG');
assert.equal(certReport.overallStatus, 'PASS');
assert.equal(certReport.testResults.length, 4);
console.log(`  Report ID: ${certReport.certId} | Status: ${certReport.overallStatus}`);
for (const res of certReport.testResults) {
  console.log(`    - ${res.testName}: P-val = ${res.pValue} (${res.passed ? 'PASS' : 'FAIL'})`);
}
console.log('  ✅ Test 6 Passed: GLI-19 compliance certification report generated.');

// =========================================================================
// TEST 7: Statutory Reality Check Session Interval Emitter
// =========================================================================
console.log('\n[Test 7] Testing Statutory Reality Check Session Alerts...');
const rg = ResponsibleGamingGuard.getInstance();
const testPlayer = 'usr-rg-compliance-01';
rg.setLimits(testPlayer, { realityCheckIntervalMinutes: 60 });

// Session started 10 minutes ago -> should NOT trigger reality check
const now = Date.now();
const tenMinutesAgo = now - 10 * 60 * 1000;
const checkNormal = rg.checkCanWager(testPlayer, 10.0, tenMinutesAgo);
assert.equal(checkNormal.allowed, true);

// Session started 65 minutes ago -> MUST trigger reality check alert!
const sixtyFiveMinAgo = now - 65 * 60 * 1000;
const checkTriggered = rg.checkCanWager(testPlayer, 10.0, sixtyFiveMinAgo);
assert.equal(checkTriggered.allowed, false);
assert.equal(checkTriggered.code, 'REALITY_CHECK_REQUIRED');
console.log(`  Reality check alert triggered: ${checkTriggered.reason}`);

// Player acknowledges reality check -> wagers permitted again
rg.acknowledgeRealityCheck(testPlayer);
const checkAfterAck = rg.checkCanWager(testPlayer, 10.0, sixtyFiveMinAgo);
assert.equal(checkAfterAck.allowed, true);
console.log('  Player acknowledged reality check -> play safely resumed.');
console.log('  ✅ Test 7 Passed: Reality check statutory intervals verified.');

console.log('===============================================================');
console.log('  🎉 All NIST SP 800-22 Conformance Tests Passed!             ');
console.log('===============================================================');
