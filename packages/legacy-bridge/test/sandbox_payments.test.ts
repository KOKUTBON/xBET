import assert from 'assert';
import { createHmac, createHash } from 'crypto';
import { PaymentWebhookDispatcher } from '../src/payments/payment-webhook-dispatcher.ts';
import { DepositManager } from '../src/payments/deposit-manager.ts';
import { PaymentMethod } from '../src/payments/payment-gateway.ts';
import { UserManager } from '../src/users/user-manager.ts';

console.log('===============================================================');
console.log('  🧪 Running Payment Gateways & Provider Sandbox Suite        ');
console.log('===============================================================');

const dispatcher = PaymentWebhookDispatcher.getInstance();
const depositManager = DepositManager.getInstance();
const userManager = UserManager.getInstance();

// ----------------------------------------------------------------------------
// [Test 1] Stripe Card Checkout Sandbox Webhook
// ----------------------------------------------------------------------------
console.log('\n[Test 1] Testing Stripe Checkout Webhook & Signature Verification...');
const stripeSecret = 'whsec_test_stripe_secret_sandbox_8899';
dispatcher.setProviderSecret('stripe', stripeSecret);

const user1 = userManager.registerUser({
  username: 'stripe_player_1',
  email: 'stripe1@xbet.local',
  password: 'Password123!',
});

const stripeDeposit = depositManager.createDeposit({
  userId: user1.id,
  amount: 150.0,
  currencyCode: 'USD',
  method: PaymentMethod.CARD_STRIPE,
});

const stripePayload = {
  id: 'evt_stripe_test_101',
  type: 'checkout.session.completed',
  data: {
    object: {
      id: 'cs_test_session_998877',
      client_reference_id: stripeDeposit.transactionRef,
      amount_total: 15000, // $150.00 in cents
      currency: 'usd',
      payment_status: 'paid',
    },
  },
};

const payloadString = JSON.stringify(stripePayload);
const timestamp = Math.floor(Date.now() / 1000);
const stripeSig = createHmac('sha256', stripeSecret).update(`${timestamp}.${payloadString}`).digest('hex');
const stripeHeader = `t=${timestamp},v1=${stripeSig}`;

const stripeResult = await dispatcher.handleWebhook('stripe', { 'stripe-signature': stripeHeader }, stripePayload);
assert.strictEqual(stripeResult.success, true, 'Stripe webhook should succeed');
assert.strictEqual(stripeResult.status, 'COMPLETED', 'Stripe deposit marked completed');
assert.strictEqual(stripeResult.amount, 150.0, 'Stripe deposit amount matches $150');

const updatedStripeDep = depositManager.getDepositByRef(stripeDeposit.transactionRef)!;
assert.strictEqual(updatedStripeDep.status, 'COMPLETED');
console.log(`  Stripe Deposit ${stripeDeposit.transactionRef} Completed ($150.00)`);
console.log('  ✅ Test 1 Passed: Stripe Checkout Sandbox webhook fulfilled.');

// ----------------------------------------------------------------------------
// [Test 2] PayPal IPN Sandbox Webhook
// ----------------------------------------------------------------------------
console.log('\n[Test 2] Testing PayPal Sandbox IPN Capture...');
const paypalDeposit = depositManager.createDeposit({
  userId: user1.id,
  amount: 75.0,
  currencyCode: 'USD',
  method: PaymentMethod.CREDIT_CARD,
});

const paypalPayload = {
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  id: 'WH-PAYPAL-998811',
  resource: {
    id: 'CAPTURE-PP-774411',
    custom_id: paypalDeposit.transactionRef,
    amount: {
      value: '75.00',
      currency_code: 'USD',
    },
    status: 'COMPLETED',
  },
};

const paypalResult = await dispatcher.handleWebhook('paypal', {}, paypalPayload);
assert.strictEqual(paypalResult.success, true, 'PayPal IPN should succeed');
assert.strictEqual(paypalResult.status, 'COMPLETED', 'PayPal deposit marked completed');

const updatedPaypalDep = depositManager.getDepositByRef(paypalDeposit.transactionRef)!;
assert.strictEqual(updatedPaypalDep.status, 'COMPLETED');
console.log(`  PayPal Deposit ${paypalDeposit.transactionRef} Completed ($75.00)`);
console.log('  ✅ Test 2 Passed: PayPal Sandbox IPN fulfilled.');

// ----------------------------------------------------------------------------
// [Test 3] CoinPayments Crypto Multi-Confirmation IPN
// ----------------------------------------------------------------------------
console.log('\n[Test 3] Testing CoinPayments Crypto IPN & HMAC-SHA512...');
const coinpaymentsSecret = 'cp_ipn_secret_sandbox_key_7788';
dispatcher.setProviderSecret('coinpayments', coinpaymentsSecret);

const cryptoDeposit = depositManager.createDeposit({
  userId: user1.id,
  amount: 500.0,
  currencyCode: 'USD',
  method: PaymentMethod.CRYPTO_BTC,
});

const cpPayload = {
  ipn_type: 'simple',
  txn_id: 'CP-BTC-TX-998822',
  item_name: cryptoDeposit.transactionRef,
  custom: cryptoDeposit.transactionRef,
  amount1: 500.0,
  currency1: 'USD',
  status: 100, // Status >= 100 is completed in CoinPayments
  status_text: 'Complete',
};

const cpRaw = Object.entries(cpPayload).map(([k, v]) => `${k}=${v}`).join('&');
const cpHmac = createHmac('sha512', coinpaymentsSecret).update(cpRaw).digest('hex');

const cpResult = await dispatcher.handleWebhook('coinpayments', { hmac: cpHmac }, cpPayload);
assert.strictEqual(cpResult.success, true, 'CoinPayments IPN should succeed');
assert.strictEqual(cpResult.status, 'COMPLETED');

const updatedCpDep = depositManager.getDepositByRef(cryptoDeposit.transactionRef)!;
assert.strictEqual(updatedCpDep.status, 'COMPLETED');
console.log(`  CoinPayments Crypto Deposit ${cryptoDeposit.transactionRef} Completed ($500.00)`);
console.log('  ✅ Test 3 Passed: CoinPayments HMAC-SHA512 IPN verified and fulfilled.');

// ----------------------------------------------------------------------------
// [Test 4] Webhook Idempotency Replay Guard
// ----------------------------------------------------------------------------
console.log('\n[Test 4] Testing Webhook Idempotency Guard on Replayed Callbacks...');
const initialCompletedCount = dispatcher.getStats().totalCompletedDeposits;

// Replay the exact same Stripe webhook
const replayedResult = await dispatcher.handleWebhook('stripe', { 'stripe-signature': stripeHeader }, stripePayload);
assert.strictEqual(replayedResult.status, 'COMPLETED');
const afterReplayCompletedCount = dispatcher.getStats().totalCompletedDeposits;

assert.strictEqual(afterReplayCompletedCount, initialCompletedCount, 'Duplicate webhook must not increment completed deposits count');
console.log(`  Idempotency Key guarded duplicate deposit fulfillment.`);
console.log('  ✅ Test 4 Passed: Idempotent replay protection verified.');

// ----------------------------------------------------------------------------
// [Test 5] Built-in Sandbox Mock Deposit Simulator
// ----------------------------------------------------------------------------
console.log('\n[Test 5] Testing Sandbox Mock Deposit Simulator...');
const simResult = dispatcher.simulateSandboxDeposit({
  userId: user1.id,
  provider: 'wecashup',
  amount: 200.0,
  currencyCode: 'USD',
});

assert.strictEqual(simResult.deposit.status, 'COMPLETED');
assert.strictEqual(simResult.deposit.amount, 200.0);
assert.strictEqual(simResult.webhookResult.success, true);
console.log(`  Simulated Instant Sandbox Deposit: ${simResult.deposit.transactionRef} ($200.00 via WeCashUp)`);
console.log('  ✅ Test 5 Passed: Sandbox deposit simulation operates cleanly.');

console.log('\n===============================================================');
console.log('  🎉 All Payment Gateways & Sandbox Tests Passed!              ');
console.log('===============================================================');
