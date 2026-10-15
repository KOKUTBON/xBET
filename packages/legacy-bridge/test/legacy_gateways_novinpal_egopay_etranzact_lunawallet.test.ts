import { strict as assert } from 'assert';
import { PaymentGatewayRegistry, PaymentMethod } from '../src/payments/payment-gateway.ts';
import { PaymentWebhookDispatcher } from '../src/payments/payment-webhook-dispatcher.ts';
import { NovinPalDriver } from '../src/payments/drivers/novinpal-driver.ts';
import { EgoPayDriver } from '../src/payments/drivers/egopay-driver.ts';
import { EtranzactDriver } from '../src/payments/drivers/etranzact-driver.ts';
import { LunaWalletDriver } from '../src/payments/drivers/lunawallet-driver.ts';
import { DepositManager } from '../src/payments/deposit-manager.ts';
import { WithdrawManager } from '../src/payments/withdraw-manager.ts';
import { UserManager, KycStatus } from '../src/users/user-manager.ts';

console.log('===============================================================');
console.log('  💳 Running NovinPal, EgoPay, eTranzact & LunaWallet Test Suite');
console.log('===============================================================');

// Setup managers and dispatcher
const userManager = UserManager.getInstance();
const dispatcher = PaymentWebhookDispatcher.getInstance();
const depositManager = DepositManager.getInstance();
const withdrawManager = WithdrawManager.getInstance();

// Register test users
const user1 = userManager.registerUser({
  username: 'persian_bettor',
  email: 'persian@test.com',
  password: 'Password123!',
  role: 'PLAYER' as any,
  currencyCode: 'IRR',
});
userManager.updateKycStatus(user1.id, KycStatus.VERIFIED);

const user2 = userManager.registerUser({
  username: 'egopay_bettor',
  email: 'egopay@test.com',
  password: 'Password123!',
  role: 'PLAYER' as any,
  currencyCode: 'USD',
});
userManager.updateKycStatus(user2.id, KycStatus.VERIFIED);

const user3 = userManager.registerUser({
  username: 'etz_bettor',
  email: 'etz@test.com',
  password: 'Password123!',
  role: 'PLAYER' as any,
  currencyCode: 'USD',
});
userManager.updateKycStatus(user3.id, KycStatus.VERIFIED);

const user4 = userManager.registerUser({
  username: 'luna_bettor',
  email: 'luna@test.com',
  password: 'Password123!',
  role: 'PLAYER' as any,
  currencyCode: 'USD',
});
userManager.updateKycStatus(user4.id, KycStatus.VERIFIED);

// 1. Verify Payment Gateway Registry
console.log('\n[Test 1] Verifying Payment Gateway Registry metadata...');
const novinpalCfg = PaymentGatewayRegistry.getGateway(PaymentMethod.NOVINPAL);
assert.ok(novinpalCfg, 'NovinPal gateway config should exist');
assert.equal(novinpalCfg.minDeposit, 10000);

const egopayCfg = PaymentGatewayRegistry.getGateway(PaymentMethod.EGOPAY);
assert.ok(egopayCfg, 'EgoPay gateway config should exist');
assert.equal(egopayCfg.minDeposit, 5.0);

const etranzactCfg = PaymentGatewayRegistry.getGateway(PaymentMethod.ETRANZACT);
assert.ok(etranzactCfg, 'eTranzact gateway config should exist');
assert.equal(etranzactCfg.minDeposit, 10.0);

const lunawalletCfg = PaymentGatewayRegistry.getGateway(PaymentMethod.LUNAWALLET);
assert.ok(lunawalletCfg, 'LunaWallet gateway config should exist');
assert.equal(lunawalletCfg.minDeposit, 10.0);

console.log('  ✅ Test 1 Passed: All 4 legacy gateways registered in PaymentGatewayRegistry.');

// 2. Testing NovinPal Driver
console.log('\n[Test 2] Testing NovinPal Driver deposit, webhook, and Sheba payout...');
const novinpalDriver = new NovinPalDriver();
const novinpalDeposit = depositManager.createDeposit({
  userId: user1.id,
  amount: 2500000, // 2,500,000 IRR / Toman
  currencyCode: 'IRR',
  method: PaymentMethod.NOVINPAL,
});

const novinpalSession = await novinpalDriver.createDepositSession(novinpalDeposit, { apiKey: 'sandbox_novinpal_api_key' });
assert.ok(novinpalSession.checkoutUrl?.includes('novinpal.com/pay/payment/'));
assert.ok(novinpalSession.metadata?.authority);

// Webhook callback simulation
const npWebhook = await novinpalDriver.processWebhook(
  { 'x-api-key': 'sandbox_novinpal_api_key' },
  {
    order_id: novinpalDeposit.transactionRef,
    au: novinpalSession.metadata?.authority,
    amount: 2500000,
    status: 1,
  }
);
assert.equal(npWebhook.success, true);
assert.equal(npWebhook.status, 'COMPLETED');
assert.equal(npWebhook.amount, 2500000);

const npWithdraw = withdrawManager.requestWithdrawal({
  userId: user1.id,
  amount: 1000000,
  currencyCode: 'IRR',
  method: PaymentMethod.NOVINPAL,
  payoutDetails: 'IR980120000000001234567890',
});
const npPayout = await novinpalDriver.processPayout(npWithdraw);
assert.equal(npPayout.status, 'PROCESSED');
assert.ok(npPayout.externalPayoutId?.startsWith('NP_PAYOUT_'));
console.log('  ✅ Test 2 Passed: NovinPal deposit session, callback & Sheba payout verified.');

// 3. Testing EgoPay Driver
console.log('\n[Test 3] Testing EgoPay Driver SCI, MD5 Hash, and Wallet Transfer...');
const egopayDriver = new EgoPayDriver();
const egopayDeposit = depositManager.createDeposit({
  userId: user2.id,
  amount: 150.0,
  currencyCode: 'USD',
  method: PaymentMethod.EGOPAY,
});

const egopaySession = await egopayDriver.createDepositSession(egopayDeposit, {
  storeId: 'EP_STORE_101',
  storePassword: 'secret_store_pass',
});
assert.ok(egopaySession.checkoutUrl?.includes('egopay.com/payments/pay'));
assert.ok(egopaySession.metadata?.paymentHash);

// Webhook simulation
const egoWebhook = await egopayDriver.processWebhook(
  {},
  {
    cf_1: egopayDeposit.transactionRef,
    sStatus: 'Completed',
    fAmount: 150.0,
    sCurrency: 'USD',
    sTransactionId: 'EP_TX_987654',
  }
);
assert.equal(egoWebhook.success, true);
assert.equal(egoWebhook.status, 'COMPLETED');
assert.equal(egoWebhook.amount, 150.0);

const egoWithdraw = withdrawManager.requestWithdrawal({
  userId: user2.id,
  amount: 75.0,
  currencyCode: 'USD',
  method: PaymentMethod.EGOPAY,
  payoutDetails: 'EP_ACCOUNT_WALLET_99',
});
const egoPayout = await egopayDriver.processPayout(egoWithdraw);
assert.equal(egoPayout.status, 'PROCESSED');
assert.ok(egoPayout.externalPayoutId?.startsWith('EP_OUT_'));
console.log('  ✅ Test 3 Passed: EgoPay SCI hash generation, webhook & payout verified.');

// 4. Testing eTranzact Multi-Network Driver
console.log('\n[Test 4] Testing eTranzact Driver Terminal Checksum, Switch callback...');
const etranzactDriver = new EtranzactDriver();
const etzDeposit = depositManager.createDeposit({
  userId: user3.id,
  amount: 500.0,
  currencyCode: 'USD',
  method: PaymentMethod.ETRANZACT,
});

const etzSession = await etranzactDriver.createDepositSession(etzDeposit, {
  terminalId: 'ETZ_MERCHANT_001',
  secretKey: 'etz_sec_key_xyz',
});
assert.ok(etzSession.checkoutUrl?.includes('etranzact.com/webpay/checkout'));
assert.ok(etzSession.metadata?.checksum);

// Webhook callback with SUCCESS: '0'
const etzWebhook = await etranzactDriver.processWebhook(
  {},
  {
    TRANSACTION_ID: etzDeposit.transactionRef,
    TRANS_NUM: 'ETZ_AUTH_778899',
    AMOUNT: 500.0,
    SUCCESS: '0',
    CURRENCY: 'USD',
  }
);
assert.equal(etzWebhook.success, true);
assert.equal(etzWebhook.status, 'COMPLETED');
assert.equal(etzWebhook.externalTransactionId, 'ETZ_AUTH_778899');

const etzWithdraw = withdrawManager.requestWithdrawal({
  userId: user3.id,
  amount: 200.0,
  currencyCode: 'USD',
  method: PaymentMethod.ETRANZACT,
  payoutDetails: '0123456789 (Access Bank)',
});
const etzPayout = await etranzactDriver.processPayout(etzWithdraw);
assert.equal(etzPayout.status, 'PROCESSED');
assert.ok(etzPayout.externalPayoutId?.startsWith('ETZ_OUT_'));
console.log('  ✅ Test 4 Passed: eTranzact switch checkout checksum, callback & payout verified.');

// 5. Testing LunaWallet Crypto Merchant Driver
console.log('\n[Test 5] Testing LunaWallet Crypto Merchant Driver & Confirmations...');
const lunawalletDriver = new LunaWalletDriver();
const lunaDeposit = depositManager.createDeposit({
  userId: user4.id,
  amount: 350.0,
  currencyCode: 'USD',
  method: PaymentMethod.LUNAWALLET,
});

const lunaSession = await lunawalletDriver.createDepositSession(lunaDeposit);
assert.ok(lunaSession.receivingAddress?.startsWith('luna1q'));
assert.ok(lunaSession.metadata?.requiredConfirmations === 3);

// Webhook with only 1 confirmation (Pending)
const pendingLunaWebhook = await lunawalletDriver.processWebhook(
  {},
  {
    payment_id: lunaDeposit.transactionRef,
    txid: '0x99aaff112233',
    amount: 350.0,
    confirmations: 1,
    currency: 'USD',
  }
);
assert.equal(pendingLunaWebhook.status, 'PENDING');

// Webhook with 3 confirmations (Completed)
const completedLunaWebhook = await lunawalletDriver.processWebhook(
  {},
  {
    payment_id: lunaDeposit.transactionRef,
    txid: '0x99aaff112233',
    amount: 350.0,
    confirmations: 3,
    currency: 'USD',
  }
);
assert.equal(completedLunaWebhook.status, 'COMPLETED');
assert.equal(completedLunaWebhook.externalTransactionId, '0x99aaff112233');

const lunaWithdraw = withdrawManager.requestWithdrawal({
  userId: user4.id,
  amount: 150.0,
  currencyCode: 'USD',
  method: PaymentMethod.LUNAWALLET,
  payoutDetails: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
});
const lunaPayout = await lunawalletDriver.processPayout(lunaWithdraw);
assert.equal(lunaPayout.status, 'PROCESSED');
console.log('  ✅ Test 5 Passed: LunaWallet confirmation thresholding, webhook & payout verified.');

// 6. Testing Webhook Dispatcher Sandbox Simulation for all 4
console.log('\n[Test 6] Testing Webhook Dispatcher simulation for all 4 new gateways...');
const sbNovinpal = dispatcher.simulateSandboxDeposit({
  userId: user1.id,
  provider: 'novinpal',
  amount: 500000,
});
assert.equal(sbNovinpal.webhookResult.status, 'COMPLETED');

const sbEgopay = dispatcher.simulateSandboxDeposit({
  userId: user2.id,
  provider: 'egopay',
  amount: 250,
});
assert.equal(sbEgopay.webhookResult.status, 'COMPLETED');

const sbEtranzact = dispatcher.simulateSandboxDeposit({
  userId: user3.id,
  provider: 'etranzact',
  amount: 1000,
});
assert.equal(sbEtranzact.webhookResult.status, 'COMPLETED');

const sbLuna = dispatcher.simulateSandboxDeposit({
  userId: user4.id,
  provider: 'lunawallet',
  amount: 750,
});
assert.equal(sbLuna.webhookResult.status, 'COMPLETED');

console.log('  ✅ Test 6 Passed: Webhook dispatcher sandbox deposit simulations completed.');

console.log('===============================================================');
console.log('  🎉 All 4 Legacy Payment Gateway Driver Tests Passed!         ');
console.log('===============================================================');
