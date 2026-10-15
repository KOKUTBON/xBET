import { createHash } from 'crypto';
import { LiveCasinoAggregator } from '../../../services/casino-engine/src/live-casino/live-casino-aggregator.ts';
import { LedgerService } from '../../../services/betting-engine/src/wallet/ledger-service.ts';
import { DepositManager } from '../src/payments/deposit-manager.ts';
import { PaymentWebhookDispatcher } from '../src/payments/payment-webhook-dispatcher.ts';
import { PaymentMethod } from '../src/payments/payment-gateway.ts';

async function runTest() {
  console.log('===============================================================');
  console.log('  🎰 Running Live Casino Aggregator & Regional Payments Suite  ');
  console.log('===============================================================');

  const liveCasino = LiveCasinoAggregator.getInstance();
  const ledger = LedgerService.getInstance();
  const depositMgr = DepositManager.getInstance();
  const dispatcher = PaymentWebhookDispatcher.getInstance();

  // Test 1: Live Dealer Table Launch Session Token & HMAC Signature
  console.log('\n[Test 1] Testing Live Dealer Session Launch...');
  const userId = 'usr-live-player-777';
  ledger.deposit(userId, 500.0, 'USD', 'INIT-TEST');

  const launchResult = liveCasino.createLaunchSession({
    userId,
    gameCode: 'live_electric_roulette',
    provider: 'STUDIO_ONE',
    currencyCode: 'USD',
    locale: 'eng',
  });

  console.log('  Session ID:', launchResult.sessionId);
  console.log('  Token:', launchResult.token);
  console.log('  Launch URL:', launchResult.launchUrl);

  if (!launchResult.token || !launchResult.launchUrl.includes('studio-one.example.com')) {
    throw new Error('Live Casino launch session creation failed');
  }

  const tokenValidation = liveCasino.validateToken(launchResult.token);
  console.log('  Token Valid:', tokenValidation.valid, '| User:', tokenValidation.userId);
  if (!tokenValidation.valid || tokenValidation.userId !== userId) {
    throw new Error('Launch token validation failed');
  }
  console.log('  ✅ Test 1 Passed: Live dealer launch session token and URL signed successfully.');

  // Test 2: Live Casino Seamless Wallet Debit (Bet Placement)
  console.log('\n[Test 2] Testing Seamless Wallet Debit (Live Table Bet)...');
  const roundId = 'rnd_live_998811';
  const txDebitId = 'tx_live_deb_101';

  const debitRes = liveCasino.handleDebit({
    userId,
    transactionId: txDebitId,
    roundId,
    amount: 100.0,
    gameCode: 'live_electric_roulette',
  });

  console.log('  Debit Result:', debitRes);
  if (!debitRes.success || debitRes.balance !== 400.0) {
    throw new Error(`Debit failed: expected balance $400, got $${debitRes.balance}`);
  }
  console.log('  ✅ Test 2 Passed: Table wager debited from wallet and held in ledger escrow.');

  // Test 3: Live Casino Seamless Wallet Credit (Winning Payout)
  console.log('\n[Test 3] Testing Seamless Wallet Credit (Winning Payout)...');
  const txCreditId = 'tx_live_cred_102';
  const creditRes = liveCasino.handleCredit({
    userId,
    transactionId: txCreditId,
    roundId,
    debitAmount: 100.0,
    payout: 350.0, // 35:1 straight-up win on a single-number roulette bet
  });

  console.log('  Credit Result:', creditRes);
  if (!creditRes.success || creditRes.balance !== 750.0) {
    throw new Error(`Credit failed: expected balance $750, got $${creditRes.balance}`);
  }
  console.log('  ✅ Test 3 Passed: Winning payout settled cleanly with double-entry balance $750.');

  // Test 4: Live Casino Seamless Wallet Rollback
  console.log('\n[Test 4] Testing Seamless Wallet Rollback / Void...');
  const txDebit2 = 'tx_live_deb_103';
  liveCasino.handleDebit({
    userId,
    transactionId: txDebit2,
    roundId: 'rnd_live_cancelled_01',
    amount: 50.0,
    gameCode: 'live_electric_roulette',
  });
  console.log('  Balance after second bet of $50:', ledger.getBalance(userId));

  const rollbackRes = liveCasino.handleRollback({
    userId,
    transactionId: txDebit2,
    roundId: 'rnd_live_cancelled_01',
    amount: 50.0,
  });

  console.log('  Balance after rollback refund:', rollbackRes.balance);
  if (!rollbackRes.success || rollbackRes.balance !== 750.0) {
    throw new Error(`Rollback failed: expected balance $750, got $${rollbackRes.balance}`);
  }
  console.log('  ✅ Test 4 Passed: Live table bet rollback refunded atomically to player.');

  // Test 5: PerfectMoney V2_HASH IPN Signature & Deposit Fulfillment
  console.log('\n[Test 5] Testing PerfectMoney V2_HASH IPN Webhook...');
  const pmDeposit = depositMgr.createDeposit({
    userId: 'usr-pm-user-808',
    amount: 250.0,
    currencyCode: 'USD',
    method: PaymentMethod.PERFECT_MONEY,
  });

  const pmSecret = 'perfect_money_passphrase_secret_key';
  dispatcher.setProviderSecret('PerfectMoney', pmSecret);

  // Generate valid V2_HASH
  const altPassphraseHash = createHash('md5').update(pmSecret).digest('hex').toUpperCase();
  const payeeAccount = 'U12345678';
  const payerAccount = 'U87654321';
  const batchNum = 'BATCH_PM_5948392';
  const timestamp = '1787155600';

  const rawHashString = [
    pmDeposit.transactionRef,
    payeeAccount,
    '250.00',
    'USD',
    batchNum,
    payerAccount,
    altPassphraseHash,
    timestamp,
  ].join(':');
  const validV2Hash = createHash('md5').update(rawHashString).digest('hex').toUpperCase();

  const pmWebhookPayload = {
    PAYMENT_ID: pmDeposit.transactionRef,
    PAYEE_ACCOUNT: payeeAccount,
    PAYMENT_AMOUNT: '250.00',
    PAYMENT_UNITS: 'USD',
    PAYMENT_BATCH_NUM: batchNum,
    PAYER_ACCOUNT: payerAccount,
    TIMESTAMPGMT: timestamp,
    V2_HASH: validV2Hash,
  };

  const pmRes = await dispatcher.handleWebhook('PerfectMoney', {}, pmWebhookPayload);
  console.log('  PerfectMoney Webhook Result:', pmRes);
  if (!pmRes.success || pmRes.status !== 'COMPLETED') {
    throw new Error('PerfectMoney valid webhook processing failed');
  }
  console.log('  ✅ Test 5 Passed: PerfectMoney V2_HASH verified and deposit fulfilled.');

  // Test 6: PerfectMoney Forged V2_HASH Rejection
  console.log('\n[Test 6] Testing PerfectMoney Forged V2_HASH Rejection...');
  const forgedPayload = {
    ...pmWebhookPayload,
    V2_HASH: 'INVALID_FORGED_HASH_99999',
  };
  const forgedRes = await dispatcher.handleWebhook('PerfectMoney', {}, forgedPayload);
  console.log('  Forged Webhook Result Success:', forgedRes.success, '| Status:', forgedRes.status);
  if (forgedRes.success) {
    throw new Error('Forged PerfectMoney webhook was accepted');
  }
  console.log('  ✅ Test 6 Passed: Forged PerfectMoney IPN rejected with 400.');

  // Test 7: WeCashUp Pan-African Mobile Money Webhook
  console.log('\n[Test 7] Testing WeCashUp African Mobile Money Webhook...');
  const wcuDeposit = depositMgr.createDeposit({
    userId: 'usr-africa-player-909',
    amount: 50.0,
    currencyCode: 'USD',
    method: PaymentMethod.WECASHUP_MOBILE_MONEY,
  });

  const wcuSecret = 'wecashup_secret_merchant_key_africa';
  dispatcher.setProviderSecret('WeCashUp', wcuSecret);

  const wcuPayload = {
    merchant_transaction_id: wcuDeposit.transactionRef,
    transaction_uid: 'wcu_mobile_tx_348910',
    transaction_status: 'PAID',
    transaction_amount: '50.00',
    transaction_currency: 'USD',
    merchant_secret: wcuSecret,
  };

  const wcuRes = await dispatcher.handleWebhook('WeCashUp', {}, wcuPayload);
  console.log('  WeCashUp Webhook Result:', wcuRes);
  if (!wcuRes.success || wcuRes.status !== 'COMPLETED') {
    throw new Error('WeCashUp valid webhook processing failed');
  }
  console.log('  ✅ Test 7 Passed: WeCashUp African Mobile Money webhook processed.');

  // Test 8: Double-Entry Ledger Mathematical Conservation
  console.log('\n[Test 8] Verifying Double-Entry Ledger Conservation...');
  const ledgerBalanced = ledger.verifyLedgerConservation();
  console.log('  Ledger Mathematical Balance Conserved:', ledgerBalanced);
  if (!ledgerBalanced) {
    throw new Error('Double-entry ledger debit/credit balance mismatch');
  }
  console.log('  ✅ Test 8 Passed: Full ledger integrity verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Live Casino & Regional Payment Gateway Tests Passed!  ');
  console.log('===============================================================');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
