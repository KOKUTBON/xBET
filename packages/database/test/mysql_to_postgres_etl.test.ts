import assert from 'node:assert';
import {
  MysqlToPostgresEtl,
  type LegacyUserRow,
  type LegacyTicketRow,
  type LegacyDepositRow,
} from '../src/index.ts';

console.log('===============================================================');
console.log('  🗄️  Running MySQL -> PostgreSQL Automated ETL Migration Tests ');
console.log('===============================================================\n');

// ----------------------------------------------------------------------------
// Test 1: User Record Transformation & Password Migration Flagging
// ----------------------------------------------------------------------------
console.log('[Test 1] Testing Legacy User MySQL Row Transformation...');
const etl = new MysqlToPostgresEtl();

const legacyUser: LegacyUserRow = {
  id: 42,
  username: 'rich_punter_99',
  password: 'd41d8cd98f00b204e9800998ecf8427e', // CakePHP SHA-1 placeholder
  email: 'PUNTER@EXAMPLE.COM',
  balance: 1450.50,
  group_id: 2, // Regular User
  referal_id: 3, // Agent ID
  status: 1, // Active
  created: '2022-05-14 12:30:00',
  modified: '2026-08-20 09:15:00',
};

const transformedUser = etl.transformUser(legacyUser);
assert.strictEqual(transformedUser.id, 'usr-000042');
assert.strictEqual(transformedUser.legacyId, 42);
assert.strictEqual(transformedUser.email, 'punter@example.com');
assert.strictEqual(transformedUser.role, 'PLAYER');
assert.strictEqual(transformedUser.referralId, 'usr-000003');
assert.strictEqual(transformedUser.isActive, true);
assert.strictEqual(transformedUser.isLegacyPassword, true);
assert.ok(transformedUser.passwordHash.startsWith('cakephp_sha1:'));
assert.ok(transformedUser.createdAt instanceof Date);
console.log('  ✅ Test 1 Passed: Legacy user transformed with normalized types & password flags.');

// ----------------------------------------------------------------------------
// Test 2: Ticket Record Transformation
// ----------------------------------------------------------------------------
console.log('\n[Test 2] Testing Legacy Ticket Row Transformation...');
const legacyTicket: LegacyTicketRow = {
  id: 7788,
  user_id: 42,
  date: '2026-08-20 14:00:00',
  amount: 100.0,
  odd: 3.5,
  return: 350.0,
  status: 1, // WON
  type: 1,   // COMBI
};

const transformedTicket = etl.transformTicket(legacyTicket);
assert.strictEqual(transformedTicket.id, 'tck-0007788');
assert.strictEqual(transformedTicket.legacyId, 7788);
assert.strictEqual(transformedTicket.userId, 'usr-000042');
assert.strictEqual(transformedTicket.stake, 100.0);
assert.strictEqual(transformedTicket.totalOdds, 3.5);
assert.strictEqual(transformedTicket.potentialReturn, 350.0);
assert.strictEqual(transformedTicket.status, 'WON');
assert.strictEqual(transformedTicket.type, 'COMBI');
console.log('  ✅ Test 2 Passed: Ticket transformed with type-safe enums and foreign key mappings.');

// ----------------------------------------------------------------------------
// Test 3: End-to-End Batch ETL Pipeline & Balance Parity Check
// ----------------------------------------------------------------------------
console.log('\n[Test 3] Testing Batch ETL Pipeline with Financial Parity Validation...');
const sampleUsers: LegacyUserRow[] = [
  { id: 1, username: 'admin', password: 'sha1password1', email: 'admin@xbet.local', balance: 0.0, group_id: 3, status: 1, created: '2020-01-01 00:00:00', modified: '2026-01-01 00:00:00' },
  { id: 2, username: 'agent_soho', password: 'sha1password2', email: 'soho@xbet.local', balance: 5000.0, group_id: 6, status: 1, created: '2021-01-01 00:00:00', modified: '2026-01-01 00:00:00' },
  { id: 3, username: 'punter_a', password: 'sha1password3', email: 'punter_a@xbet.local', balance: 750.0, group_id: 2, referal_id: 2, status: 1, created: '2022-01-01 00:00:00', modified: '2026-01-01 00:00:00' },
  { id: 4, username: 'punter_b', password: 'sha1password4', email: 'punter_b@xbet.local', balance: 250.0, group_id: 2, referal_id: 2, status: 1, created: '2022-01-01 00:00:00', modified: '2026-01-01 00:00:00' },
];

const sampleTickets: LegacyTicketRow[] = [
  { id: 101, user_id: 3, date: '2026-08-20 12:00:00', amount: 50.0, odd: 2.0, return: 100.0, status: 0, type: 0 },
  { id: 102, user_id: 4, date: '2026-08-20 12:15:00', amount: 20.0, odd: 4.5, return: 90.0, status: 1, type: 1 },
];

const sampleDeposits: LegacyDepositRow[] = [
  { id: 201, user_id: 3, amount: 800.0, type: 'STRIPE', status: 1, created: '2026-08-19 10:00:00' },
];

const summary = etl.runEtlPipeline(sampleUsers, sampleTickets, sampleDeposits, true);

assert.strictEqual(summary.dryRun, true);
assert.strictEqual(summary.usersExtracted, 4);
assert.strictEqual(summary.usersTransformed, 4);
assert.strictEqual(summary.ticketsExtracted, 2);
assert.strictEqual(summary.ticketsTransformed, 2);
assert.strictEqual(summary.depositsExtracted, 1);
assert.strictEqual(summary.totalBalanceConserved, 6000.0); // 0 + 5000 + 750 + 250 = 6,000.00
assert.strictEqual(summary.discrepancies.length, 0, 'Must have zero discrepancies');

console.log(`  Extracted & Transformed: ${summary.usersTransformed} Users, ${summary.ticketsTransformed} Tickets, ${summary.depositsExtracted} Deposits.`);
console.log(`  Total Balance Parity Conserved: $${summary.totalBalanceConserved.toFixed(2)} (Discrepancies: ${summary.discrepancies.length})`);
console.log(`  Pipeline completed in ${summary.executionTimeMs}ms.`);
console.log('  ✅ Test 3 Passed: Batch ETL migration validated with 100% mathematical parity.');

console.log('\n===============================================================');
console.log('  🎉 All MySQL -> PostgreSQL Migration Tests Passed!           ');
console.log('===============================================================');
