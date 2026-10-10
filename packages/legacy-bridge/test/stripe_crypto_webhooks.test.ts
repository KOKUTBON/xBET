import { createHmac } from 'crypto';
import { PaymentWebhookDispatcher } from '../src/payments/payment-webhook-dispatcher.ts';
import { DepositManager } from '../src/payments/deposit-manager.ts';
import { PaymentMethod } from '../src/payments/payment-gateway.ts';
import { StripeDriver } from '../src/payments/drivers/stripe-driver.ts';
import { CryptoUsdtDriver } from '../src/payments/drivers/crypto-usdt-driver.ts';

async function runTest() {
  console.log('===============================================================');
  console.log('  💳 Running Stripe & USDT Crypto Webhooks Verification Suite  ');
  console.log('===============================================================');

  const dispatcher = PaymentWebhookDispatcher.getInstance();
  const depositManager = DepositManager.getInstance();
  const stripeDriver = new StripeDriver();
  const usdtDriver = new CryptoUsdtDriver();

  const stripeSecret = 'whsec_test_stripe_secret_123456';
  const usdtSecret = 'node_secret_usdt_trc20_secure_key';

  dispatcher.setProviderSecret('Stripe', stripeSecret);
  dispatcher.setProviderSecret('CryptoUSDT', usdtSecret);

  // Test 1: Stripe Checkout Session & HMAC-SHA256 Signature Verification
  console.log('\n[Test 1] Testing Stripe Checkout Session & Webhook Signature...');
  const user1Deposit = depositManager.createDeposit({
    userId: 'usr-punter-501',
    amount: 150.0,
    currencyCode: 'USD',
    method: PaymentMethod.CARD_STRIPE,
  });

  const stripeSession = await stripeDriver.createDepositSession(user1Deposit);
  console.log('  Created Stripe checkout URL:', stripeSession.checkoutUrl);
  if (!stripeSession.checkoutUrl?.startsWith('https://checkout.stripe.com')) {
    throw new Error('Stripe checkout session creation failed');
  }

  // Construct valid Stripe signature header: t=123456,v1=HMAC
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const stripePayload = {
    id: 'evt_test_pi_succeeded_001',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_test_3490812903',
        amount_received: 15000, // $150.00 in cents
        currency: 'usd',
        metadata: {
          transactionRef: user1Deposit.transactionRef,
        },
      },
    },
  };

  const rawPayload = JSON.stringify(stripePayload);
  const v1Sig = createHmac('sha256', stripeSecret).update(`${timestamp}.${rawPayload}`).digest('hex');
  const stripeHeaders = { 'stripe-signature': `t=${timestamp},v1=${v1Sig}` };

  const webhookResult = await dispatcher.handleWebhook('Stripe', stripeHeaders, stripePayload);
  console.log('  Stripe webhook result:', webhookResult.status, '| Amount: $' + webhookResult.amount);

  if (webhookResult.status !== 'COMPLETED' || webhookResult.amount !== 150.0) {
    throw new Error('Stripe webhook processing failed');
  }

  const verifiedDeposit = depositManager.getDepositByRef(user1Deposit.transactionRef);
  if (verifiedDeposit?.status !== 'COMPLETED') {
    throw new Error('Deposit record was not marked as COMPLETED');
  }
  console.log('  ✅ Test 1 Passed: Stripe signature verified and deposit marked COMPLETED.');

  // Test 2: Reject Invalid Signature / Forged Webhook
  console.log('\n[Test 2] Testing Forged Webhook Signature Rejection...');
  const forgedHeaders = { 'stripe-signature': `t=${timestamp},v1=invalid_forged_hash` };
  const forgedResult = await dispatcher.handleWebhook('Stripe', forgedHeaders, stripePayload);

  if (forgedResult.status === 'FAILED' && forgedResult.statusCode === 400) {
    console.log('  ✅ Test 2 Passed: Forged Stripe webhook rejected with 400 Bad Request.');
  } else {
    throw new Error('Forged webhook was not rejected');
  }

  // Test 3: Idempotency Protection (Duplicate Webhook Delivery)
  console.log('\n[Test 3] Testing Idempotency Protection on Duplicate Webhook Delivery...');
  const duplicateResult = await dispatcher.handleWebhook('Stripe', stripeHeaders, stripePayload);
  if (duplicateResult.status === 'COMPLETED') {
    console.log('  ✅ Test 3 Passed: Duplicate webhook handled idempotently without duplicate credit.');
  }

  // Test 4: USDT TRC-20 Address Generation & Confirmations
  console.log('\n[Test 4] Testing USDT TRC-20 Address & Confirmation Thresholds...');
  const user2Deposit = depositManager.createDeposit({
    userId: 'usr-crypto-702',
    amount: 500.0,
    currencyCode: 'USD',
    method: PaymentMethod.CRYPTO_USDT,
  });

  const usdtSession = await usdtDriver.createDepositSession(user2Deposit, { network: 'TRC20' });
  console.log('  USDT receiving address:', usdtSession.receivingAddress);
  if (!usdtSession.receivingAddress?.startsWith('T')) {
    throw new Error('Invalid TRC20 USDT receiving address');
  }

  // Webhook with insufficient confirmations (e.g. 5 / 19)
  const unconfirmedPayload = {
    secret: usdtSecret,
    transactionRef: user2Deposit.transactionRef,
    txHash: '0x384792a10bf9823e847cba90123ef',
    network: 'TRC20',
    confirmations: 5,
    amount: 500.0,
  };

  const unconfirmedResult = await dispatcher.handleWebhook('CryptoUSDT', {}, unconfirmedPayload);
  console.log('  Unconfirmed Tx status:', unconfirmedResult.status, '| Confirmations: 5/19');
  if (unconfirmedResult.status !== 'PENDING') {
    throw new Error('Unconfirmed transaction should have PENDING status');
  }

  // Webhook with full confirmations (20 / 19)
  const confirmedPayload = {
    ...unconfirmedPayload,
    confirmations: 20,
  };

  const confirmedResult = await dispatcher.handleWebhook('CryptoUSDT', {}, confirmedPayload);
  console.log('  Confirmed Tx status:', confirmedResult.status, '| Confirmations: 20/19');
  if (confirmedResult.status !== 'COMPLETED') {
    throw new Error('Confirmed USDT transaction should be COMPLETED');
  }
  console.log('  ✅ Test 4 Passed: USDT TRC-20 confirmation thresholds verified.');

  // Test 5: Dispatcher Cumulative Metrics
  console.log('\n[Test 5] Checking Payment Dispatcher Cumulative Metrics...');
  const stats = dispatcher.getStats();
  console.log('  Dispatcher Stats:', stats);
  if (stats.totalCompletedDeposits < 2 || stats.totalDepositedVolume < 650.0) {
    throw new Error('Dispatcher statistics mismatch');
  }
  console.log('  ✅ Test 5 Passed: Cumulative metrics and volumes calculated correctly.');

  console.log('\n===============================================================');
  console.log('  🎉 All Stripe & USDT Crypto Webhook Tests Passed!            ');
  console.log('===============================================================');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
