/**
 * Test Suite for pilot secret validation and client-safe error mapping
 */

import assert from 'node:assert/strict';
import { assertPilotJwtSecret } from '../src/auth.ts';
import { toPublicError } from '../src/http-errors.ts';

console.log('===============================================================');
console.log('  🛡️ Running Pilot Hardening Test Suite');
console.log('===============================================================');

console.log('\n[Test 1] Rejecting missing, short and template JWT secrets...');
assert.throws(() => assertPilotJwtSecret(undefined));
assert.throws(() => assertPilotJwtSecret('short-secret'));
assert.throws(() => assertPilotJwtSecret('replace_with_secure_random_256_bit_jwt_secret'));
assert.throws(() => assertPilotJwtSecret('changeme_changeme_changeme_changeme_1234'));
assert.doesNotThrow(() => assertPilotJwtSecret('9f2c4e7a1b3d5f8e0a6c2b4d7e9f1a3c5b7d9e2f4a6c8b0d'));
console.log('  ✅ Test 1 Passed: Only random secrets of 32+ characters are accepted.');

console.log('\n[Test 2] Mapping errors to client-safe responses...');
assert.deepEqual(toPublicError(new Error('INSUFFICIENT_FUNDS: Available 1.00'), 'test'), { status: 400, body: { error: 'INSUFFICIENT_FUNDS: Available 1.00' } });
assert.deepEqual(toPublicError(new Error('INVALID_JSON_BODY'), 'test'), { status: 400, body: { error: 'INVALID_JSON_BODY' } });
const originalError = console.error;
console.error = () => {};
try {
  const dbError = Object.assign(new Error('duplicate key value violates unique constraint "points_users_username_key"'), { code: '23505' });
  assert.deepEqual(toPublicError(dbError, 'test'), { status: 500, body: { error: 'INTERNAL_ERROR' } });
  assert.deepEqual(toPublicError(new TypeError("Cannot read properties of undefined (reading 'id')"), 'test'), { status: 500, body: { error: 'INTERNAL_ERROR' } });
} finally {
  console.error = originalError;
}
console.log('  ✅ Test 2 Passed: Domain codes are returned; driver and runtime errors are hidden.');

console.log('\n===============================================================');
console.log('  🎉 All Pilot Hardening Tests Passed!');
console.log('===============================================================');
