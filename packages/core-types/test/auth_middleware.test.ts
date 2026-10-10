/**
 * Test Suite for Shared Auth Token Manager & RBAC Middleware
 */

import { AuthTokenManager, AuthMiddleware, UserRole } from '../src/auth.ts';
import { IncomingMessage, ServerResponse } from 'http';

async function runAuthMiddlewareTests() {
  console.log('===============================================================');
  console.log('  🔐 Running Shared Auth & RBAC Middleware Test Suite');
  console.log('===============================================================');

  // --------------------------------------------------------------------------
  // Test 1: JWT Session Creation & Cryptographic Signature Verification
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing JWT Token Generation & Verification...');
  const user = {
    id: 'usr-punter-007',
    username: 'james_bond',
    role: UserRole.PLAYER,
    currencyCode: 'GBP',
  };

  const token = AuthTokenManager.createSession(user, 1); // 1 hour token
  console.log(`  Generated JWT: ${token.substring(0, 35)}...`);

  const verified = AuthTokenManager.verifySession(token);
  if (!verified) throw new Error('Token verification failed');
  if (verified.userId !== user.id || verified.role !== UserRole.PLAYER) {
    throw new Error('Token payload mismatch');
  }

  // Tampered token test
  const tamperedToken = token.slice(0, -5) + 'XXXXX';
  const tamperedVerified = AuthTokenManager.verifySession(tamperedToken);
  if (tamperedVerified !== null) throw new Error('Tampered token should not verify');

  console.log('  ✅ Test 1 Passed: JWT creation, verification, and tamper protection verified.');

  // --------------------------------------------------------------------------
  // Test 2: Role Hierarchy & Access Levels
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Role Hierarchy & Privilege Elevation...');
  // Super admin can do everything
  if (!AuthTokenManager.isAuthorized(UserRole.SUPER_ADMIN, UserRole.PLAYER)) throw new Error('Admin should satisfy player');
  if (!AuthTokenManager.isAuthorized(UserRole.ADMINISTRATOR, UserRole.AGENT)) throw new Error('Admin should satisfy agent');
  if (!AuthTokenManager.isAuthorized(UserRole.AGENT, UserRole.PLAYER)) throw new Error('Agent should satisfy player');

  // Player cannot perform admin actions
  if (AuthTokenManager.isAuthorized(UserRole.PLAYER, UserRole.ADMINISTRATOR)) throw new Error('Player cannot satisfy admin');
  if (AuthTokenManager.isAuthorized(UserRole.CASHIER, UserRole.ADMINISTRATOR)) throw new Error('Cashier cannot satisfy admin');

  console.log('  ✅ Test 2 Passed: Role hierarchy and RBAC authorization tiers verified.');

  // --------------------------------------------------------------------------
  // Test 3: AuthMiddleware HTTP Header Extraction & Enforcement
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing HTTP AuthMiddleware Integration...');
  const mockReqValid = {
    headers: { authorization: `Bearer ${token}` },
    url: '/api/v1/bets/place',
  } as unknown as IncomingMessage;

  const mockReqInvalid = {
    headers: { authorization: `Bearer bad_token_123` },
    url: '/api/v1/bets/place',
  } as unknown as IncomingMessage;

  const mockReqMissing = {
    headers: {},
    url: '/api/v1/bets/place',
  } as unknown as IncomingMessage;

  const validSession = AuthMiddleware.authenticate(mockReqValid);
  if (!validSession || validSession.username !== 'james_bond') throw new Error('Valid request failed authentication');

  const invalidSession = AuthMiddleware.authenticate(mockReqInvalid);
  if (invalidSession !== null) throw new Error('Invalid token should return null');

  const missingSession = AuthMiddleware.authenticate(mockReqMissing);
  if (missingSession !== null) throw new Error('Missing token should return null');

  console.log('  ✅ Test 3 Passed: AuthMiddleware successfully parsed and validated headers.');

  console.log('\n===============================================================');
  console.log('  🎉 All Shared Auth & RBAC Middleware Tests Passed!          ');
  console.log('===============================================================');
  process.exit(0);
}

runAuthMiddlewareTests().catch((err) => {
  console.error('❌ Auth test failed:', err);
  process.exit(1);
});
