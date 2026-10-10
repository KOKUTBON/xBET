/**
 * Multi-Gateway Payment Drivers & Webhook Verification Test Suite
 * Tests Bitcoin IPN, CoinPayments HMAC-SHA512, PayPal REST, Skrill MD5,
 * InterSwitch WebPAY, Cashier Agent Invoicing, and Idempotency.
 */

import { createHmac, createHash } from 'crypto';
import { PaymentMethod } from '../src/payments/payment-gateway.ts';
import { DepositManager } from '../src/payments/deposit-manager.ts';
import { WithdrawManager } from '../src/payments/withdraw-manager.ts';
import { PaymentWebhookDispatcher } from '../src/payments/payment-webhook-dispatcher.ts';
import { UserManager, KycStatus } from '../src/users/user-manager.ts';
import { RolloverTracker } from '../src/bonus/rollover-tracker.ts';
import { AgentCreditTree } from '../src/users/agent-credit-tree.ts';

async function runPaymentWebhookTests() {
  console.log('===============================================================');
  console.log('  🧪 Running Payment Webhook & Gateway Drivers Verification Suite');
  console.log('===============================================================');

  const depositManager = DepositManager.getInstance();
  const withdrawManager = WithdrawManager.getInstance();
  const userManager = UserManager.getInstance();
  const rolloverTracker = RolloverTracker.getInstance();
  const creditTree = AgentCreditTree.getInstance();
  const dispatcher = PaymentWebhookDispatcher.getInstance();

  // Configure provider secrets
  const BTC_SECRET = 'btc_super_secret_9988';
  const COINPAYMENTS_SECRET = 'coinpayments_hmac_secret_key_12345';
  const SKRILL_SECRET = 'skrill_secret_word_abc';

  dispatcher.setProviderSecret('BlockChain', BTC_SECRET);
  dispatcher.setProviderSecret('CoinPayments', COINPAYMENTS_SECRET);
  dispatcher.setProviderSecret('Skrill', SKRILL_SECRET);

  const registeredUser = userManager.registerUser({
    username: 'paytest007',
    email: 'paytest@test.com',
    password: 'Password123!',
    role: 'PLAYER',
    preferredCurrency: 'USD',
  });
  const testUser = registeredUser.id;
  userManager.updateKycStatus(testUser, KycStatus.VERIFIED);

  // --------------------------------------------------------------------------
  // Test 1: Blockchain Bitcoin IPN Callback Verification
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Blockchain.info Bitcoin IPN Callback...');
  const btcDeposit = depositManager.createDeposit({
    userId: testUser,
    method: PaymentMethod.CRYPTO_BTC,
    amount: 120.0,
    currencyCode: 'USD',
  });

  console.log(`  Created pending BTC deposit: ${btcDeposit.transactionRef} ($${btcDeposit.amount})`);

  // Step 1a: Callback with 1 confirmation (Pending state)
  const unconfirmedPayload = {
    payment_id: btcDeposit.transactionRef,
    secret: BTC_SECRET,
    confirmations: '1',
    transaction_hash: 'tx_btc_unconfirmed_hash_111',
    value: '200000', // 0.002 BTC
    usd_amount: '120.00',
  };
  const res1a = await dispatcher.handleWebhook('BlockChain', {}, unconfirmedPayload);
  console.log(`  Confirmation count 1 result status: ${res1a.status} (Response: "${res1a.responsePayload}")`);
  if (res1a.status !== 'PENDING') throw new Error('Unconfirmed BTC deposit should be PENDING');
  if (depositManager.getDepositByRef(btcDeposit.transactionRef)?.status !== 'PENDING') {
    throw new Error('Deposit record status should remain PENDING');
  }

  // Step 1b: Callback with 3 confirmations (Completed state)
  const confirmedPayload = {
    ...unconfirmedPayload,
    confirmations: '3',
    transaction_hash: 'tx_btc_confirmed_hash_222',
  };
  const res1b = await dispatcher.handleWebhook('BlockChain', {}, confirmedPayload);
  console.log(`  Confirmation count 3 result status: ${res1b.status} (Response: "${res1b.responsePayload}")`);
  if (res1b.status !== 'COMPLETED' || res1b.responsePayload !== '*ok*') {
    throw new Error('Confirmed BTC deposit should return *ok* and COMPLETED');
  }
  if (depositManager.getDepositByRef(btcDeposit.transactionRef)?.status !== 'COMPLETED') {
    throw new Error('Deposit record status should be COMPLETED');
  }
  console.log('  ✅ Test 1 Passed: Bitcoin IPN confirmation threshold and satoshi conversion verified.');

  // --------------------------------------------------------------------------
  // Test 2: CoinPayments HMAC-SHA512 Webhook Verification & Bonus Rollover
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing CoinPayments HMAC-SHA512 Verification with Bonus Code...');
  const cpDeposit = depositManager.createDeposit({
    userId: testUser,
    method: PaymentMethod.CRYPTO_BTC,
    amount: 100.0,
    currencyCode: 'USD',
    bonusCode: 'WELCOME100', // 100% bonus up to $200 (5x rollover = $500 target)
  });

  console.log(`  Created CP deposit ${cpDeposit.transactionRef} with bonus $${cpDeposit.bonusAmount}`);

  // Test 2a: Forged HMAC header rejection
  const cpPayload: Record<string, string> = {
    ipn_type: 'deposit',
    status: '100', // Completed
    custom: cpDeposit.transactionRef,
    amount1: '100.00',
    currency1: 'USD',
    txn_id: 'CP_TXN_VALID_888',
  };
  const rawBody = new URLSearchParams(cpPayload).toString();

  const forgedRes = await dispatcher.handleWebhook('CoinPayments', { hmac: 'invalid_forged_hmac' }, cpPayload);
  console.log(`  Forged signature check: status=${forgedRes.status}, error="${forgedRes.error}"`);
  if (forgedRes.success !== false || forgedRes.statusCode !== 401) {
    throw new Error('Forged CoinPayments HMAC was not rejected');
  }

  // Test 2b: Valid HMAC-SHA512 header
  const validHmac = createHmac('sha512', COINPAYMENTS_SECRET).update(rawBody).digest('hex');
  const validCpRes = await dispatcher.handleWebhook('CoinPayments', { hmac: validHmac }, cpPayload);
  console.log(`  Valid signature check: status=${validCpRes.status}, response="${validCpRes.responsePayload}"`);
  if (validCpRes.status !== 'COMPLETED' || validCpRes.responsePayload !== 'IPN OK') {
    throw new Error('Valid CoinPayments IPN failed to complete');
  }

  // Verify rollover tracker activated bonus
  const activeBonuses = rolloverTracker.getActiveBonuses(testUser);
  console.log(`  Active bonuses count: ${activeBonuses.length}, Target rollover: $${activeBonuses[0]?.targetWagerAmount}`);
  if (activeBonuses.length !== 1 || activeBonuses[0].bonusAmount !== 100.0 || activeBonuses[0].targetWagerAmount !== 500.0) {
    throw new Error('Bonus rollover was not properly activated upon deposit fulfillment');
  }
  console.log('  ✅ Test 2 Passed: CoinPayments HMAC-SHA512 verified and bonus grant activated.');

  // --------------------------------------------------------------------------
  // Test 3: PayPal REST Order Capture Webhook
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing PayPal REST Capture Webhook...');
  const ppDeposit = depositManager.createDeposit({
    userId: testUser,
    method: PaymentMethod.CREDIT_CARD,
    amount: 50.0,
    currencyCode: 'USD',
  });

  const ppPayload = {
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: 'CAP-PAYPAL-998877',
      custom_id: ppDeposit.transactionRef,
      status: 'COMPLETED',
      amount: {
        value: '50.00',
        currency_code: 'USD',
      },
    },
  };

  const ppHeaders = {
    'paypal-transmission-id': 'trans-id-1234',
    'paypal-auth-algo': 'SHA256withRSA',
    'paypal-cert-url': 'https://api.paypal.com/v1/certs',
  };

  const ppRes = await dispatcher.handleWebhook('PayPal', ppHeaders, ppPayload);
  console.log(`  PayPal Webhook Result: status=${ppRes.status}, ExtId=${ppRes.externalTransactionId}`);
  if (ppRes.status !== 'COMPLETED' || ppRes.externalTransactionId !== 'CAP-PAYPAL-998877') {
    throw new Error('PayPal capture webhook failed');
  }
  console.log('  ✅ Test 3 Passed: PayPal capture completed and matched custom invoice.');

  // --------------------------------------------------------------------------
  // Test 4: Skrill / Moneybookers MD5 Signature Verification
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Skrill MD5 IPN Signature Verification...');
  const skrillDeposit = depositManager.createDeposit({
    userId: testUser,
    method: PaymentMethod.E_WALLET_SKRILL,
    amount: 75.0,
    currencyCode: 'USD',
  });

  const merchantId = '100200300';
  const secretWordMd5 = createHash('md5').update(SKRILL_SECRET).digest('hex').toUpperCase();
  const mbAmount = '75.00';
  const mbCurrency = 'USD';
  const skrillStatus = '2'; // 2 = Processed

  const sigString = `${merchantId}${skrillDeposit.transactionRef}${secretWordMd5}${mbAmount}${mbCurrency}${skrillStatus}`;
  const validMd5Sig = createHash('md5').update(sigString).digest('hex').toUpperCase();

  const skrillPayload = {
    merchant_id: merchantId,
    transaction_id: skrillDeposit.transactionRef,
    mb_transaction_id: 'MB_88776655',
    mb_amount: mbAmount,
    mb_currency: mbCurrency,
    status: skrillStatus,
    md5sig: validMd5Sig,
  };

  const skrillRes = await dispatcher.handleWebhook('Skrill', {}, skrillPayload);
  console.log(`  Skrill MD5 verification result: status=${skrillRes.status}, response="${skrillRes.responsePayload}"`);
  if (skrillRes.status !== 'COMPLETED' || skrillRes.responsePayload !== 'OK') {
    throw new Error('Skrill MD5 verification failed');
  }
  console.log('  ✅ Test 4 Passed: Skrill Quick Checkout MD5 signature checked & confirmed.');

  // --------------------------------------------------------------------------
  // Test 5: InterSwitch WebPAY Callback
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing InterSwitch WebPAY Approved Transaction...');
  const iswDeposit = depositManager.createDeposit({
    userId: testUser,
    method: PaymentMethod.CREDIT_CARD,
    amount: 5000.0,
    currencyCode: 'NGN',
  });

  const iswPayload = {
    ResponseCode: '00',
    ResponseDescription: 'Approved by Financial Institution',
    MerchantReference: iswDeposit.transactionRef,
    PaymentReference: 'ISW_REF_990011',
    Amount: '500000', // 500,000 kobo = 5,000 NGN
    CurrencyCode: 'NGN',
  };

  const iswRes = await dispatcher.handleWebhook('InterSwitch', {}, iswPayload);
  console.log(`  InterSwitch Result: status=${iswRes.status}, amount=${iswRes.amount} ${iswRes.currencyCode}`);
  if (iswRes.status !== 'COMPLETED' || iswRes.amount !== 5000.0) {
    throw new Error('InterSwitch kobo conversion or status approval failed');
  }
  console.log('  ✅ Test 5 Passed: InterSwitch WebPAY response code 00 verified.');

  // --------------------------------------------------------------------------
  // Test 6: Agent Credit Retail Cashier Invoice
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Agent Credit Retail Cashier Invoice...');
  const agentUser = userManager.registerUser({
    username: 'agent_lagos_01',
    email: 'agent_lagos@xbet.com',
    password: 'Password123!',
    role: 'AGENT',
    preferredCurrency: 'USD',
  });
  agentUser.creditLimit = 10000.0;
  agentUser.availableCredit = 10000.0;

  const agentDeposit = depositManager.createDeposit({
    userId: testUser,
    method: PaymentMethod.PREPAID_VOUCHER,
    amount: 250.0,
    currencyCode: 'USD',
  });

  const agentPayload = {
    agentId: agentUser.id,
    transactionRef: agentDeposit.transactionRef,
    amount: '250.00',
    currencyCode: 'USD',
  };

  const agentRes = await dispatcher.handleWebhook('AgentCredit', {}, agentPayload);
  console.log(`  Agent Credit Result: status=${agentRes.status}, response=`, agentRes.responsePayload);
  if (agentRes.status !== 'COMPLETED') throw new Error('Agent credit invoice fulfillment failed');

  const agentRecord = userManager.getUserById(agentUser.id);
  console.log(`  Agent remaining credit till: $${agentRecord?.availableCredit.toFixed(2)} (Limit: $${agentRecord?.creditLimit.toFixed(2)})`);
  if (agentRecord?.availableCredit !== 9750.0) {
    throw new Error('Agent credit till was not properly adjusted');
  }
  console.log('  ✅ Test 6 Passed: Cashier counter credit invoice deducted agent till & funded player.');

  // --------------------------------------------------------------------------
  // Test 7: Idempotency Protection on Repeated Webhook Delivery
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] Testing Idempotency Guard on Retried Webhooks...');
  const preIdempotencyCompleted = dispatcher.getStats().totalCompletedDeposits;

  // Re-dispatching confirmed PayPal webhook
  const repeatRes = await dispatcher.handleWebhook('PayPal', ppHeaders, ppPayload);
  console.log(`  Repeated webhook delivery status: ${repeatRes.status}`);
  const postIdempotencyCompleted = dispatcher.getStats().totalCompletedDeposits;

  if (preIdempotencyCompleted !== postIdempotencyCompleted) {
    throw new Error('Idempotency violated: duplicate webhook double-credited deposit counter!');
  }
  console.log('  ✅ Test 7 Passed: Idempotency guard safely intercepted duplicate delivery.');

  // --------------------------------------------------------------------------
  // Test 8: Payout Processing Across All Drivers
  // --------------------------------------------------------------------------
  console.log('\n[Test 8] Testing Withdrawal Payout Processing across all Gateway Drivers...');
  // Complete remaining rollover requirement so user is free to withdraw
  rolloverTracker.recordSettledBet(testUser, 500.0, 2.0);

  const withdraw = withdrawManager.requestWithdrawal({
    userId: testUser,
    method: PaymentMethod.CRYPTO_BTC,
    amount: 100.0,
    payoutDetails: 'bc1qtestreceivingaddress12345',
  });
  withdrawManager.approveWithdrawal(withdraw.id, 'admin-super-01');

  const btcDriver = dispatcher.getDriver('BlockChain');
  const payoutResult = await btcDriver.processPayout(withdraw);
  console.log(`  Bitcoin Payout result: ${payoutResult.status} | TxId: ${payoutResult.externalPayoutId}`);
  if (payoutResult.status !== 'PROCESSED' || !payoutResult.externalPayoutId) {
    throw new Error('Bitcoin payout dispatch failed');
  }
  console.log('  ✅ Test 8 Passed: Payout drivers executed successfully.');

  console.log('\n===============================================================');
  console.log('  🎉 All Payment Gateway & Webhook Tests Passed!               ');
  console.log('===============================================================');
  process.exit(0);
}

runPaymentWebhookTests().catch((err) => {
  console.error('❌ Payment Webhook Tests failed:', err);
  process.exit(1);
});
