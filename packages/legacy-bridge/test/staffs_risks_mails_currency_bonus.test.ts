import assert from 'node:assert';
import {
  StaffsController,
  RisksController,
  MailsController,
  PaymentBonus,
  Currency,
  Group,
} from '../src/index.ts';

console.log('===============================================================');
console.log('  👥 Running Staffs, Risks, Mails, Bonus & Currency Tests       ');
console.log('===============================================================\n');

// ----------------------------------------------------------------------------
// Test 1: StaffsController (1:1 CakePHP StaffsController.php)
// ----------------------------------------------------------------------------
console.log('[Test 1] Testing StaffsController Hierarchical Queries & Add/Edit...');
const staffsCtrl = new StaffsController();

// 1. Admin querying all staff
const adminView = staffsCtrl.adminIndex({ id: 1, group_id: Group.ADMINISTRATOR_GROUP });
assert.ok(adminView.data.length >= 4);

// 2. Branch manager querying only their downline agents
const branchView = staffsCtrl.adminIndex({ id: 2, group_id: Group.BRANCH_GROUP });
assert.strictEqual(branchView.data.length, 1);
assert.strictEqual(branchView.data[0].username, 'agent_soho');

// 3. Admin adding a new cashier
const newStaff = staffsCtrl.adminAdd({
  username: 'cashier_chelsea',
  password_raw: 'Secret123!',
  group_id: Group.USER_GROUP,
  referal_id: 3,
});
assert.strictEqual(newStaff.username, 'cashier_chelsea');
assert.strictEqual(newStaff.status, 1);

// 4. Admin editing staff
const editedStaff = staffsCtrl.adminEdit(newStaff.id, { status: 0 });
assert.strictEqual(editedStaff.status, 0);
console.log('  ✅ Test 1 Passed: StaffsController hierarchy, referral tree, and CRUD operational.');

// ----------------------------------------------------------------------------
// Test 2: RisksController (1:1 CakePHP RisksController.php)
// ----------------------------------------------------------------------------
console.log('\n[Test 2] Testing RisksController Settings & High-Exposure Warnings...');
const risksCtrl = new RisksController();

// 1. Settings view by role
const branchRisk = risksCtrl.adminIndex({ id: 2, group_id: Group.BRANCH_GROUP });
assert.strictEqual(branchRisk.view, 'admin_index/branch_admin_index');
assert.strictEqual(branchRisk.settings.maxBet.value, 2500.0);

// 2. Admin Warnings Scanner
const mockTickets = [
  { id: 'T-1', odd: 105.0, stake: 50.0, potentialWin: 5250.0 }, // Big Odd & Big Win
  { id: 'T-2', odd: 1.50, stake: 2500.0, potentialWin: 3750.0 }, // Big Stake
  { id: 'T-3', odd: 2.00, stake: 20.0, potentialWin: 40.0 }, // Normal
];
const mockDeposits = [
  { id: 'D-1', amount: 5000.0, user: 'whale_user' }, // Big Deposit
  { id: 'D-2', amount: 50.0, user: 'regular_user' },
];
const mockWithdraws = [
  { id: 'W-1', amount: 3500.0, user: 'lucky_user' }, // Big Withdraw
];

const warnings = risksCtrl.adminWarnings(mockTickets, mockDeposits, mockWithdraws);
assert.strictEqual(warnings.bigOddTickets.length, 1);
assert.strictEqual(warnings.bigStakeTickets.length, 1);
assert.strictEqual(warnings.bigWinningTickets.length, 1);
assert.strictEqual(warnings.bigDeposits.length, 1);
assert.strictEqual(warnings.bigWithdraws.length, 1);
console.log('  ✅ Test 2 Passed: RisksController limits and high-exposure warnings scanner verified.');

// ----------------------------------------------------------------------------
// Test 3: MailsController (1:1 CakePHP MailsController.php)
// ----------------------------------------------------------------------------
console.log('\n[Test 3] Testing MailsController Contact, Admin & Broadcast Actions...');
const mailsCtrl = new MailsController();

// 1. Public contact form
const contactRes = mailsCtrl.contact({
  name: 'John Doe',
  email: 'john@example.com',
  subject: 'Inquiry about VIP limits',
  message: 'Hello, how do I apply for VIP betting limits?',
});
assert.strictEqual(contactRes.success, true);

// 2. Admin single dispatch
const singleRes = mailsCtrl.adminIndex({
  to: 'player@example.com',
  subject: 'KYC Document Approved',
  content: 'Your passport has been verified successfully.',
});
assert.strictEqual(singleRes.success, true);

// 3. Admin broadcast to user list
const userEmails = ['user1@test.com', 'user2@test.com', 'invalid-email-address', 'user3@test.com'];
const broadcastRes = mailsCtrl.adminAll('Weekend Premier League Boost!', 'Check out enhanced odds!', userEmails);
assert.strictEqual(broadcastRes.success, true);
assert.strictEqual(broadcastRes.recipientCount, 3, 'Invalid email omitted from broadcast');
console.log('  ✅ Test 3 Passed: MailsController contact, single mail, and broadcast email lists validated.');

// ----------------------------------------------------------------------------
// Test 4: PaymentBonus (1:1 CakePHP PaymentBonus.php)
// ----------------------------------------------------------------------------
console.log('\n[Test 4] Testing PaymentBonus Model Code Lookups & Calculations...');
const paymentBonus = new PaymentBonus();

// 1. Valid bonus lookup
const bonus100 = paymentBonus.getBonus(null, 'WELCOME100');
assert.ok(bonus100 !== null);
assert.strictEqual(bonus100.bonus_multiplier, 2.0);

// 2. Bonus calculation with cap
// Deposit $100 -> Multiplier 2.0 -> (100 * 2.0 - 100) = $100 bonus -> Total $200
const calcNormal = paymentBonus.calculateBonus(bonus100, 100.0);
assert.strictEqual(calcNormal.bonusAmount, 100.0);
assert.strictEqual(calcNormal.totalAmount, 200.0);

// Deposit $300 -> Multiplier 2.0 -> (300 * 2.0 - 300) = $300 bonus -> Capped at $200 max_bonus -> Total $500
const calcCapped = paymentBonus.calculateBonus(bonus100, 300.0);
assert.strictEqual(calcCapped.bonusAmount, 200.0);
assert.strictEqual(calcCapped.totalAmount, 500.0);
console.log('  ✅ Test 4 Passed: PaymentBonus multiplier and max_bonus capping confirmed.');

// ----------------------------------------------------------------------------
// Test 5: Currency (1:1 CakePHP Currency.php)
// ----------------------------------------------------------------------------
console.log('\n[Test 5] Testing Currency Model Codes, Lists & Exchange Calculations...');
const currency = new Currency();

assert.strictEqual(currency.getCode(1), 'USD');
assert.strictEqual(currency.getCode(2), 'EUR');

const codesList = currency.getCodesList();
assert.strictEqual(codesList[1], 'USD');
assert.strictEqual(codesList[3], 'GBP');

// Multi-currency conversion ($100 USD -> EUR @ 0.92 = €92.00)
const convertedEur = currency.convert(100.0, 'USD', 'EUR');
assert.strictEqual(convertedEur, 92.0);

// NGN to USD (15,000 NGN @ 1500 rate = $10.00 USD)
const convertedUsd = currency.convert(15000.0, 'NGN', 'USD');
assert.strictEqual(convertedUsd, 10.0);

console.log('  ✅ Test 5 Passed: Currency codes, lists, and multi-currency conversions verified.');

console.log('\n===============================================================');
console.log('  🎉 All Converted Staffs, Risks, Mails, Bonus & Currency Tests Passed!');
console.log('===============================================================');
