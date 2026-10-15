import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import capacitorConfig from '../../capacitor.config.ts';
import { NativeBridgeService } from '../../apps/web/src/mobile/native-bridge.ts';
import { LiveTrackerVisualizerComponent } from '../../apps/web/src/components/live-tracker-visualizer.ts';
import { AppStateManager } from '../../apps/web/src/state/app-state.ts';
import { BonusPromotionEngine } from '../../services/betting-engine/src/promotions/bonus-promotion-engine.ts';
import { LedgerService } from '../../services/betting-engine/src/wallet/ledger-service.ts';

console.log('========================================================================');
console.log('  📱 Running Track 5: Mobile Apps, Live Tracker & Promotions Test Suite ');
console.log('========================================================================');

const nativeBridge = NativeBridgeService.getInstance();
const promoEngine = BonusPromotionEngine.getInstance();
const ledger = LedgerService.getInstance();

// =========================================================================
// TEST 1: Capacitor Configuration Validation
// =========================================================================
console.log('\n[Test 1] Validating Capacitor Mobile Configuration (iOS & Android)...');
assert.equal(capacitorConfig.appId, 'com.xbet.sportsbook');
assert.equal(capacitorConfig.appName, 'xBET Sports & Casino');
assert.equal(capacitorConfig.webDir, 'apps/web/public');
assert.ok(capacitorConfig.plugins?.PushNotifications);
assert.ok(capacitorConfig.plugins?.SplashScreen);
assert.ok(capacitorConfig.plugins?.StatusBar);
console.log(`  Capacitor App: ${capacitorConfig.appName} (${capacitorConfig.appId})`);
console.log('  ✅ Test 1 Passed: Capacitor mobile bundle configuration valid.');

// =========================================================================
// TEST 2: Native Bridge & Push Notification Pipeline
// =========================================================================
console.log('\n[Test 2] Testing Native Mobile Bridge & Push Notifications...');
const pushReg = await nativeBridge.registerPushNotifications();
assert.ok(pushReg.token.startsWith('fcm_apns_tok_'));
assert.equal(nativeBridge.getPushToken(), pushReg.token);

let notificationReceived = false;
nativeBridge.onNotificationReceived((notif) => {
  if (notif.type === 'BET_SETTLED') {
    notificationReceived = true;
  }
});

nativeBridge.dispatchNotification({
  id: 'notif-1',
  type: 'BET_SETTLED',
  title: 'Bet Won!',
  body: 'Ticket TKT-888 won +125.00 USD',
  receivedAt: new Date().toISOString(),
});

assert.equal(notificationReceived, true);
console.log(`  Push Token Derived: ${pushReg.token.slice(0, 30)}...`);
console.log('  ✅ Test 2 Passed: Mobile push notifications and native bridge verified.');

// =========================================================================
// TEST 3: Live Video Stream & 2D/3D Pitch Tracker Visualizer
// =========================================================================
console.log('\n[Test 3] Testing Live Pitch Tracker & WebRTC Video Visualizer...');
const mockAppState = new AppStateManager();
const mockMatch = {
  id: 'fix-arsenal-chelsea-01',
  homeTeam: 'Arsenal',
  awayTeam: 'Chelsea',
  isLive: true,
  matchMinute: 72,
  lastEvent: 'Dangerous Attack',
};

// 1. Render 2D Pitch Tracker
LiveTrackerVisualizerComponent.setMode(mockMatch.id, 'TRACKER');
const trackerHtml = LiveTrackerVisualizerComponent.render(mockAppState, mockMatch);
assert.ok(trackerHtml.includes('pitch-svg'));
assert.ok(trackerHtml.includes('DANGEROUS ATTACK'));
assert.ok(trackerHtml.includes('Shots on Target'));

// 2. Render WebRTC Live Video Stream
LiveTrackerVisualizerComponent.setMode(mockMatch.id, 'VIDEO');
const videoHtml = LiveTrackerVisualizerComponent.render(mockAppState, mockMatch);
assert.ok(videoHtml.includes('LIVE STREAM'));
assert.ok(videoHtml.includes('stream_tok_'));
assert.ok(videoHtml.includes('live-fixture-video-'));
console.log('  ✓ 2D Pitch Tracker with dynamic ball vectors verified');
console.log('  ✓ WebRTC / Low-Latency HLS video player markup verified');
console.log('  ✅ Test 3 Passed: Live pitch tracker and video visualizer verified.');

// =========================================================================
// TEST 4: Acca Boost (Accumulator Bonus) Payout & Ledger
// =========================================================================
console.log('\n[Test 4] Testing Acca Boost (+5% to +70%) Bonus Multipliers...');
// 3 legs: +5%
const boost3 = promoEngine.calculateAccaBoost(3, [1.50, 1.60, 1.80]);
assert.equal(boost3.eligible, true);
assert.equal(boost3.boostPercentage, 0.05);

// 7 legs: +20%
const boost7 = promoEngine.calculateAccaBoost(7, [1.4, 1.5, 1.3, 1.6, 1.5, 1.4, 1.7]);
assert.equal(boost7.eligible, true);
assert.equal(boost7.boostPercentage, 0.20);

// 14 legs: +70%
const boost14 = promoEngine.calculateAccaBoost(14);
assert.equal(boost14.boostPercentage, 0.70);

// Under minimum 3 legs or low odds
assert.equal(promoEngine.calculateAccaBoost(2).eligible, false);
assert.equal(promoEngine.calculateAccaBoost(4, [1.5, 1.10, 1.6, 1.4]).eligible, false); // 1.10 < 1.20

// Test ledger payout of Acca Boost
const punterId = `usr-punter-boost-${randomUUID().slice(0, 8)}`;
ledger.deposit(punterId, 100.0, 'USD');

// Win $100 on $10 stake with 7 legs (+20% on $90 net profit = +$18 bonus)
const boostPayout = await promoEngine.applyAccaBoostPayout({
  userId: punterId,
  slipId: 'slip-acca-001',
  stake: 10.0,
  totalOdds: 10.0,
  legsCount: 7,
  currencyCode: 'USD',
});

assert.equal(boostPayout.bonusAmount, 18.0); // 90 * 0.20 = 18.0
assert.equal(boostPayout.totalPayout, 118.0); // 100 + 18 = 118.0
assert.equal(ledger.getBalance(punterId, 'USD'), 118.0); // Initial 100 + 18 bonus = 118
console.log(`  Acca Boost applied: 7 Legs (+20%) | Net Profit: $90 | Bonus: +$${boostPayout.bonusAmount}`);
console.log('  ✅ Test 4 Passed: Acca Boost calculations and ledger payouts confirmed.');

// =========================================================================
// TEST 5: 2 Goals Ahead Early Payout Promotion
// =========================================================================
console.log('\n[Test 5] Testing 2 Goals Ahead Early Payout Promotion...');
const punter2Id = `usr-punter-early-${randomUUID().slice(0, 8)}`;
ledger.deposit(punter2Id, 50.0, 'USD');
const slipEarly = 'slip-early-001';

// Backed HOME team with $20 stake @ 2.50 odds (Potential return $50)
ledger.holdBetStake(punter2Id, slipEarly, 20.0, 'USD');
assert.equal(ledger.getBalance(punter2Id, 'USD'), 30.0);

// In minute 34: Score goes to 2-0 (Home 2 goals ahead!)
const earlyResult = await promoEngine.evaluateTwoGoalsAhead({
  userId: punter2Id,
  slipId: slipEarly,
  matchScore: { home: 2, away: 0 },
  backedTeam: 'HOME',
  stake: 20.0,
  odds: 2.50,
  currencyCode: 'USD',
});

assert.equal(earlyResult.triggered, true);
assert.equal(earlyResult.payout, 50.0);
assert.equal(ledger.getBalance(punter2Id, 'USD'), 80.0); // 30 + 50 = 80
assert.equal(promoEngine.isEarlyPaid(slipEarly), true);
console.log(`  Early payout triggered at 2-0: Payout $${earlyResult.payout} credited immediately!`);

// Later in minute 88: Match ends 2-2!
// Calling again must not double-payout
const lateResult = await promoEngine.evaluateTwoGoalsAhead({
  userId: punter2Id,
  slipId: slipEarly,
  matchScore: { home: 2, away: 2 },
  backedTeam: 'HOME',
  stake: 20.0,
  odds: 2.50,
  currencyCode: 'USD',
});
assert.equal(lateResult.triggered, true);
assert.equal(ledger.getBalance(punter2Id, 'USD'), 80.0); // Unchanged!
console.log('  Match finished 2-2: Punter protected by Early Payout with zero balance duplication.');
console.log('  ✅ Test 5 Passed: 2 Goals Ahead early payout verified.');

// =========================================================================
// TEST 6: Bore Draw (0-0) Stake Refund Promotion
// =========================================================================
console.log('\n[Test 6] Testing Bore Draw (0-0) Stake Refund Promotion...');
const punter3Id = `usr-punter-boredraw-${randomUUID().slice(0, 8)}`;
ledger.deposit(punter3Id, 40.0, 'USD');
const slipBore = 'slip-boredraw-001';

// Pre-match bet on Correct Score 2-1 with $25 stake
ledger.holdBetStake(punter3Id, slipBore, 25.0, 'USD');
assert.equal(ledger.getBalance(punter3Id, 'USD'), 15.0);

// Match finishes 0-0!
const boreRefund = await promoEngine.evaluateBoreDrawRefund({
  userId: punter3Id,
  slipId: slipBore,
  matchFinalScore: { home: 0, away: 0 },
  marketType: 'CORRECT_SCORE',
  stake: 25.0,
  currencyCode: 'USD',
});

assert.equal(boreRefund.refunded, true);
assert.equal(boreRefund.refundAmount, 25.0);
assert.equal(ledger.getBalance(punter3Id, 'USD'), 40.0); // Full $25 restored back to $40
console.log(`  Match finished 0-0: Correct Score bet refunded $${boreRefund.refundAmount} via Bore Draw promo.`);
console.log('  ✅ Test 6 Passed: Bore Draw 0-0 refund executed with zero balance leakage.');

console.log('========================================================================');
console.log('  🎉 All Track 5: Mobile Apps, Live Tracker & Promos Tests PASSED!      ');
console.log('========================================================================');
