/**
 * Verification Test Suite for Payments, Deposits, Withdrawals & Bonus Rollover Engine
 */

import { UserManager, KycStatus } from '../src/users/user-manager.ts';
import { PaymentMethod, PaymentGatewayRegistry } from '../src/payments/payment-gateway.ts';
import { DepositManager } from '../src/payments/deposit-manager.ts';
import { WithdrawManager } from '../src/payments/withdraw-manager.ts';
import { RolloverTracker } from '../src/bonus/rollover-tracker.ts';

async function runPaymentsAndBonusTests() {
  console.log('===============================================================');
  console.log('  💳 Running Payments, Withdrawals & Bonus Rollover Test Suite');
  console.log('===============================================================');

  const userManager = UserManager.getInstance();
  const depositManager = DepositManager.getInstance();
  const withdrawManager = WithdrawManager.getInstance();
  const rolloverTracker = RolloverTracker.getInstance();

  // Create test user
  const user = userManager.registerUser({
    username: 'richard_bettor',
    email: 'richard@example.com',
    password: 'Password123!',
  });

  // --------------------------------------------------------------------------
  // Test 1: Payment Gateways Availability
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Checking Payment Gateway Configs...');
  const gateways = PaymentGatewayRegistry.getAvailableGateways();
  console.log(`  Found ${gateways.length} Gateways: ${gateways.map((g) => g.name).join(' | ')}`);
  if (gateways.length < 5) throw new Error('Expected at least 5 payment gateways');
  console.log('  ✅ Test 1 Passed: Payment gateways registered.');

  // --------------------------------------------------------------------------
  // Test 2: Deposit with Promo Bonus Code (WELCOME100)
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing $100 Deposit with Promo Code WELCOME100...');
  const deposit = depositManager.createDeposit({
    userId: user.id,
    method: PaymentMethod.CREDIT_CARD,
    amount: 100.0,
    bonusCode: 'WELCOME100',
  });

  console.log(`  Deposit Ref: ${deposit.transactionRef} | Amount: $${deposit.amount} | Bonus Granted: $${deposit.bonusAmount}`);
  if (deposit.status !== 'COMPLETED' || deposit.bonusAmount !== 100.0) {
    throw new Error('Deposit with bonus code failed');
  }

  const activeBonuses = rolloverTracker.getActiveBonuses(user.id);
  console.log(`  Active Bonus: ${activeBonuses[0].bonusCode} | Target Rollover: $${activeBonuses[0].targetWagerAmount} (5x)`);
  if (activeBonuses.length !== 1 || activeBonuses[0].targetWagerAmount !== 500.0) {
    throw new Error('Rollover requirement calculation incorrect');
  }
  console.log('  ✅ Test 2 Passed: Deposit and promo bonus match registered.');

  // --------------------------------------------------------------------------
  // Test 3: Withdrawal Constraint Checks (KYC & Unfinished Wagering)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Withdrawal Constraint Enforcement...');

  // Attempt 1: Should fail because KYC is UNVERIFIED
  try {
    withdrawManager.requestWithdrawal({
      userId: user.id,
      method: PaymentMethod.CREDIT_CARD,
      amount: 50.0,
      payoutDetails: 'Visa **** 4242',
    });
    throw new Error('Should have blocked unverified KYC withdrawal');
  } catch (err: any) {
    console.log(`  Blocked as expected (KYC): ${err.message}`);
    if (!err.message.includes('KYC_REQUIRED')) throw err;
  }

  // Update KYC to VERIFIED
  userManager.updateKycStatus(user.id, KycStatus.VERIFIED);

  // Attempt 2: Should fail because user has active bonus wagering ($500 needed)
  try {
    withdrawManager.requestWithdrawal({
      userId: user.id,
      method: PaymentMethod.CREDIT_CARD,
      amount: 50.0,
      payoutDetails: 'Visa **** 4242',
    });
    throw new Error('Should have blocked unfinished wagering withdrawal');
  } catch (err: any) {
    console.log(`  Blocked as expected (Wagering): ${err.message}`);
    if (!err.message.includes('WAGERING_UNFULFILLED')) throw err;
  }

  console.log('  ✅ Test 3 Passed: KYC and wagering constraints strictly enforced.');

  // --------------------------------------------------------------------------
  // Test 4: Rollover Wagering Progress & Automatic Bonus Release
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Simulating Qualifying Bets towards $500 Rollover...');

  // Bet 1: $200 settled @ 1.80 (Qualifies)
  let release = rolloverTracker.recordSettledBet(user.id, 200.0, 1.80);
  console.log(`  Settled $200 bet @ 1.80 -> Progress: $${activeBonuses[0].currentWageredAmount}/$${activeBonuses[0].targetWagerAmount}`);
  if (release.releasedBonusAmount !== 0) throw new Error('Bonus released prematurely');

  // Bet 2: $100 settled @ 1.20 (Under min odds 1.50 -> Should NOT count)
  release = rolloverTracker.recordSettledBet(user.id, 100.0, 1.20);
  console.log(`  Settled $100 bet @ 1.20 (Ignored, below 1.50) -> Progress: $${activeBonuses[0].currentWageredAmount}/$${activeBonuses[0].targetWagerAmount}`);
  if (activeBonuses[0].currentWageredAmount !== 200.0) throw new Error('Low odds bet was incorrectly counted');

  // Bet 3: $300 settled @ 2.10 (Completes remaining $300 rollover)
  release = rolloverTracker.recordSettledBet(user.id, 300.0, 2.10);
  console.log(`  Settled $300 bet @ 2.10 -> Released Bonus: $${release.releasedBonusAmount}`);
  if (release.releasedBonusAmount !== 100.0 || activeBonuses[0].status !== 'COMPLETED') {
    throw new Error('Bonus failed to complete upon meeting rollover');
  }
  console.log('  ✅ Test 4 Passed: Bonus wagering tracker and automatic cash release verified.');

  // --------------------------------------------------------------------------
  // Test 5: Successful Withdrawal Request & Admin Approval
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Clean Withdrawal Request & Admin Approval...');
  const withdrawal = withdrawManager.requestWithdrawal({
    userId: user.id,
    method: PaymentMethod.BANK_TRANSFER,
    amount: 150.0,
    payoutDetails: 'IBAN GB82WEST12345678901234',
  });

  console.log(`  Withdrawal Requested: ${withdrawal.transactionRef} | Amount: $${withdrawal.amount} | Status: ${withdrawal.status}`);
  if (withdrawal.status !== 'PENDING_APPROVAL') throw new Error('Initial withdrawal status mismatch');

  const approvedWithdrawal = withdrawManager.approveWithdrawal(withdrawal.id, 'admin-super-01');
  console.log(`  Withdrawal ${approvedWithdrawal.transactionRef} Approved by Admin: ${approvedWithdrawal.status}`);
  if (approvedWithdrawal.status !== 'APPROVED') throw new Error('Withdrawal approval failed');

  console.log('  ✅ Test 5 Passed: Full withdrawal and administrative review lifecycle verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Step 5 Payments, Withdrawals & Bonus Tests Passed!    ');
  console.log('===============================================================');
  process.exit(0);
}

runPaymentsAndBonusTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
