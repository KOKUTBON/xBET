import assert from 'node:assert';
import { createHmac } from 'node:crypto';
import {
  RngAuditor,
  ResponsibleGamingGuard,
  WafSecurityGuard,
  SecretsManager,
} from '../src/index.ts';

console.log('===============================================================');
console.log('  🛡️ Running Regulatory Compliance & Security Hardening Tests   ');
console.log('===============================================================\n');

// ----------------------------------------------------------------------------
// Test 1: GLI-19 Random Number Generator (RNG) Statistical Audit
// ----------------------------------------------------------------------------
console.log('[Test 1] Testing GLI-19 RNG Statistical Compliance & Chi-Squared Test...');
const serverSeed = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const clientSeed = 'punter-random-client-seed-12345';

const auditResult = RngAuditor.auditRNGCompliance(serverSeed, clientSeed, 10000);
console.log(`  Sample Size: 10,000 | Mean: ${auditResult.mean} (Expected: 0.500) | Variance: ${auditResult.variance} (Expected: 0.0833)`);
console.log(`  Chi-Squared Statistic: ${auditResult.chiSquaredTest.chiSquared} (Critical @ 95%: ${auditResult.chiSquaredTest.criticalValue95})`);
console.log(`  Chi-Squared Test Passed: ${auditResult.chiSquaredTest.passed} | Serial Autocorrelation: ${auditResult.serialCorrelation}`);
assert.strictEqual(auditResult.isCompliantGLI19, true, 'RNG must satisfy GLI-19 statistical randomness criteria');
console.log('  ✅ Test 1 Passed: GLI-19 RNG statistical uniformity & Chi-squared tests passed.');

// ----------------------------------------------------------------------------
// Test 2: Responsible Gaming Reality Checks & 24h Cooling-Off Limits
// ----------------------------------------------------------------------------
console.log('\n[Test 2] Testing Responsible Gaming Reality Checks & 24h Cooling-Off...');
const rg = ResponsibleGamingGuard.getInstance();
const user1 = 'usr-rg-player-99';

// 1. Reality Check Timer
rg.startSession(user1, 30); // 30-minute interval
rg.recordActivity(user1, 150.0, 75.0); // Wager $150, Won $75 -> Net: -$75
const checkInitial = rg.checkRealityCheckDue(user1);
assert.strictEqual(checkInitial.due, false, 'Reality check should not trigger immediately');

// 2. Deposit Limit: Decrease applies immediately
const decreaseResult = rg.setLimit(user1, 'DEPOSIT', 'DAILY', 500.0);
assert.strictEqual(decreaseResult.appliedImmediately, true);
assert.strictEqual(decreaseResult.limit.amount, 500.0);

// 3. Deposit Limit: Increase requires 24h cooling-off window
const increaseResult = rg.setLimit(user1, 'DEPOSIT', 'DAILY', 1000.0);
assert.strictEqual(increaseResult.appliedImmediately, false);
assert.strictEqual(increaseResult.limit.amount, 500.0, 'Limit must remain at $500 during cooling off');
assert.strictEqual(increaseResult.limit.pendingChange?.newAmount, 1000.0);

// 4. Age Verification
assert.strictEqual(rg.validateAge('2000-05-15', 18), true, '26-year-old is of legal age');
assert.strictEqual(rg.validateAge('2015-01-01', 18), false, 'Minor is rejected');

// 5. Instant Self-Exclusion
rg.selfExclude(user1, 30, 'Take a break');
assert.strictEqual(rg.isUserSelfExcluded(user1), true, 'User is actively self-excluded');
console.log('  ✅ Test 2 Passed: Reality checks, 24h cooling-off limits, age validation, and self-exclusion verified.');

// ----------------------------------------------------------------------------
// Test 3: WAF Sliding-Window Rate Limiter & Replay Attack Prevention
// ----------------------------------------------------------------------------
console.log('\n[Test 3] Testing WAF Rate Limiting & Webhook Replay Attack Prevention...');
const waf = WafSecurityGuard.getInstance();

// 1. Rate Limiter (Max 5 requests / 10 seconds)
const ipKey = 'client-ip-192.168.1.10';
for (let i = 0; i < 5; i++) {
  const check = waf.checkRateLimit(ipKey, { maxRequests: 5, windowSeconds: 10 });
  assert.strictEqual(check.allowed, true);
}
const blockedCheck = waf.checkRateLimit(ipKey, { maxRequests: 5, windowSeconds: 10 });
assert.strictEqual(blockedCheck.allowed, false, '6th request in window must be blocked');

// 2. HMAC-SHA256 Webhook Verification
const webhookSecret = 'whsec_prod_super_secret_key_12345';
const webhookPayload = JSON.stringify({ event: 'charge.succeeded', amount: 5000 });
const timestamp = Math.floor(Date.now() / 1000).toString();
const validSignature = createHmac('sha256', webhookSecret)
  .update(`${timestamp}.${webhookPayload}`)
  .digest('hex');

const verifySuccess = waf.verifyWebhookSignature(
  webhookPayload,
  validSignature,
  webhookSecret,
  timestamp,
  'nonce-abc-101'
);
assert.strictEqual(verifySuccess.valid, true, 'Valid HMAC signature and timestamp must pass');

// 3. Replay Attack Prevention (Same Nonce)
const verifyReplay = waf.verifyWebhookSignature(
  webhookPayload,
  validSignature,
  webhookSecret,
  timestamp,
  'nonce-abc-101'
);
assert.strictEqual(verifyReplay.valid, false, 'Duplicate nonce must be rejected as replay attack');
assert.ok(verifyReplay.reason?.includes('Duplicate webhook nonce'));

// 4. Stale Timestamp (> 5 min)
const staleTimestamp = (Math.floor(Date.now() / 1000) - 400).toString();
const staleSignature = createHmac('sha256', webhookSecret)
  .update(`${staleTimestamp}.${webhookPayload}`)
  .digest('hex');
const verifyStale = waf.verifyWebhookSignature(
  webhookPayload,
  staleSignature,
  webhookSecret,
  staleTimestamp,
  'nonce-abc-102'
);
assert.strictEqual(verifyStale.valid, false, 'Stale timestamp outside 5-min window must be rejected');

// 5. Security Headers
const headers = waf.getSecurityHeaders();
assert.strictEqual(headers['X-Frame-Options'], 'DENY');
assert.ok(headers['Strict-Transport-Security'].includes('max-age'));
console.log('  ✅ Test 3 Passed: WAF rate limiter, replay attack defense, and security headers verified.');

// ----------------------------------------------------------------------------
// Test 4: Secrets Manager & Key Rotation
// ----------------------------------------------------------------------------
console.log('\n[Test 4] Testing SecretsManager & Key Rotation Lifecycle...');
const secrets = SecretsManager.getInstance();

secrets.setSecret('JWT_SECRET', 'initial_secret_key');
assert.strictEqual(secrets.getSecret('JWT_SECRET'), 'initial_secret_key');

const rotated = secrets.rotateKey('JWT_SECRET');
assert.strictEqual(rotated.version, 2, 'Rotated secret increments version');
assert.strictEqual(secrets.getSecret('JWT_SECRET'), rotated.value);
assert.strictEqual(rotated.value.length, 64, '32-byte hex string is 64 chars');
console.log('  ✅ Test 4 Passed: Secrets manager storage and cryptographic key rotation verified.');

console.log('\n===============================================================');
console.log('  🎉 All Phase 4 Compliance & Security Tests Passed!           ');
console.log('===============================================================');
