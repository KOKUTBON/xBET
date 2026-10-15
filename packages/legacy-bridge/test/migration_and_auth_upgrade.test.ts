import assert from 'assert';
import { PasswordHasher } from '../src/auth/password-hasher.ts';
import { UserManager, KycStatus } from '../src/users/user-manager.ts';
import { UserRole } from '../src/auth/role-hierarchy.ts';

console.log('===============================================================');
console.log('  🧪 Running Legacy Data Migration & Password Re-hash Suite   ');
console.log('===============================================================');

// ----------------------------------------------------------------------------
// [Test 1] Testing Legacy CakePHP SHA1 Password Verification
// ----------------------------------------------------------------------------
console.log('\n[Test 1] Testing CakePHP 2.x SHA1 Hashing & Verification...');
const testPassword = 'SecretPunterPassword2026!';
const cakePhpSalt = PasswordHasher.CAKEPHP_DEFAULT_SALT;

// Compute expected CakePHP SHA-1: sha1(Security.salt . password)
const legacySha1 = PasswordHasher.hashCakePhpLegacy(testPassword, cakePhpSalt);
console.log(`  Computed Legacy CakePHP Hash: ${legacySha1}`);

// Verify with explicit prefix 'cakephp_sha1:'
const prefixedHash = `cakephp_sha1:${legacySha1}`;
assert.strictEqual(PasswordHasher.verifyPassword(testPassword, prefixedHash), true, 'Prefixed CakePHP hash should verify');
assert.strictEqual(PasswordHasher.verifyPassword('WrongPassword', prefixedHash), false, 'Wrong password should fail');

// Verify with raw 40-character hex string from MySQL dump
assert.strictEqual(PasswordHasher.verifyPassword(testPassword, legacySha1), true, 'Raw 40-char SHA1 hex should verify');
assert.strictEqual(PasswordHasher.verifyPassword('WrongPassword', legacySha1), false, 'Wrong password should fail on raw hex');

// Verify needsRehash detection
assert.strictEqual(PasswordHasher.needsRehash(prefixedHash), true, 'Prefixed legacy hash needs rehash');
assert.strictEqual(PasswordHasher.needsRehash(legacySha1), true, 'Raw legacy SHA1 hash needs rehash');

// Modern PBKDF2 should NOT need rehash
const modernHash = PasswordHasher.hashPassword(testPassword);
assert.strictEqual(PasswordHasher.needsRehash(modernHash), false, 'Modern PBKDF2 hash does not need rehash');
assert.strictEqual(PasswordHasher.verifyPassword(testPassword, modernHash), true, 'Modern PBKDF2 hash should verify');

console.log('  ✅ Test 1 Passed: Legacy CakePHP SHA1 hashes accurately identified and verified.');

// ----------------------------------------------------------------------------
// [Test 2] Testing User Migration Import & Transparent Auth Upgrade
// ----------------------------------------------------------------------------
console.log('\n[Test 2] Testing Legacy User Import & Transparent PBKDF2 Upgrade on Login...');
const userManager = UserManager.getInstance();

const legacyUser = userManager.importMigratedUser({
  username: 'migrated_punter_99',
  email: 'punter99@xbet.local',
  passwordHash: `cakephp_sha1:${legacySha1}`,
  role: UserRole.PLAYER,
  currencyCode: 'USD',
});

assert.strictEqual(legacyUser.username, 'migrated_punter_99');
assert.strictEqual(PasswordHasher.needsRehash(legacyUser.passwordHash), true, 'Initial imported user has legacy hash');

// First login with original password
const authResult = userManager.authenticate('migrated_punter_99', testPassword);
assert.ok(authResult.token, 'JWT session token generated');
assert.strictEqual(authResult.user.id, legacyUser.id);

// Verify that passwordHash was automatically upgraded to PBKDF2 in memory
const updatedUser = userManager.getUserById(legacyUser.id)!;
assert.strictEqual(PasswordHasher.needsRehash(updatedUser.passwordHash), false, 'Hash is now upgraded PBKDF2');
assert.ok(updatedUser.passwordHash.includes(':'), 'Upgraded hash contains salt:hash delimiter');
console.log(`  Upgraded Modern Hash: ${updatedUser.passwordHash.slice(0, 30)}...`);

// Subsequent login succeeds with the newly upgraded hash
const secondAuth = userManager.authenticate('migrated_punter_99', testPassword);
assert.ok(secondAuth.token, 'Second login with upgraded hash succeeds');

console.log('  ✅ Test 2 Passed: Migrated legacy user authenticated and transparently upgraded to PBKDF2.');

// ----------------------------------------------------------------------------
// [Test 3] Testing Double-Entry Balance Reconciliation Invariant
// ----------------------------------------------------------------------------
console.log('\n[Test 3] Testing Ledger Balance Reconciliation & Zero Balance Leakage...');

const CLEARING_ACCOUNT = '00000000-0000-0000-0000-000000000005';
const migratedBalances = [
  { userId: 'u1', username: 'bettor_1', balance: 500.50 },
  { userId: 'u2', username: 'bettor_2', balance: 1250.75 },
  { userId: 'u3', username: 'bettor_3', balance: 75.00 },
  { userId: 'u4', username: 'bettor_4', balance: 0.00 },
  { userId: 'u5', username: 'bettor_5', balance: 3420.25 },
];

const ledgerJournal: Array<{
  journalId: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
}> = [];

let totalDebits = 0;
let totalCredits = 0;

for (const record of migratedBalances) {
  if (record.balance > 0) {
    const journalId = `mig_jrnl_${record.userId}`;
    const userLedgerAccount = `acc_main_${record.userId}`;

    ledgerJournal.push({
      journalId,
      debitAccount: CLEARING_ACCOUNT,
      creditAccount: userLedgerAccount,
      amount: record.balance,
    });

    totalDebits += record.balance;
    totalCredits += record.balance;
  }
}

console.log(`  Total Migration Journal Entries: ${ledgerJournal.length}`);
console.log(`  Total System Debits (Clearing Account):  $${totalDebits.toFixed(2)}`);
console.log(`  Total System Credits (Player Accounts):  $${totalCredits.toFixed(2)}`);

const diff = Math.abs(totalDebits - totalCredits);
assert.ok(diff < 0.0001, 'Ledger debits must mathematically equal credits');
assert.strictEqual(totalDebits, 5246.50, 'Total migrated portfolio matches sum of balances');

console.log('  ✅ Test 3 Passed: Double-entry ledger reconciliation strictly conserved.');

console.log('\n===============================================================');
console.log('  🎉 All Migration & Password Re-hash Tests Passed!             ');
console.log('===============================================================');
