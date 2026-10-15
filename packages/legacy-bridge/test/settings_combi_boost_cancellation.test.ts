import { PlatformSettingsManager } from '../src/settings/platform-settings.ts';
import { CombiBonusCalculator } from '../../../services/betting-engine/src/bets/combi-bonus-calculator.ts';
import { TicketCancellationManager } from '../../../services/betting-engine/src/bets/ticket-cancellation-manager.ts';
import { LedgerService } from '../../../services/betting-engine/src/wallet/ledger-service.ts';
import type { BetSlipRecord } from '../../../services/betting-engine/src/bets/bet-placement-service.ts';

async function runTest() {
  console.log('===============================================================');
  console.log('  ⚙️ Running Platform Settings, Combi Boost & Cancellation Suite');
  console.log('===============================================================');

  const settingsMgr = PlatformSettingsManager.getInstance();
  const cancelMgr = TicketCancellationManager.getInstance();
  const ledger = LedgerService.getInstance();

  // Test 1: Dynamic Platform Settings Retrieval & Updates
  console.log('\n[Test 1] Testing Platform Settings Management...');
  const generalSettings = settingsMgr.getSettings('general');
  console.log('  Site Name:', generalSettings.siteName, '| Default Currency:', generalSettings.defaultCurrency);
  if (generalSettings.defaultCurrency !== 'USD') {
    throw new Error('Initial general settings default currency mismatch');
  }

  // Update Risk settings
  settingsMgr.updateSettings('risk', { maxWinningPerTicket: 150000.0, cancellationGraceWindowMinutes: 8 });
  const updatedRisk = settingsMgr.getSettings('risk');
  if (updatedRisk.maxWinningPerTicket !== 150000.0 || updatedRisk.cancellationGraceWindowMinutes !== 8) {
    throw new Error('Risk settings update failed');
  }
  console.log('  Updated max winning cap:', updatedRisk.maxWinningPerTicket, '| Grace window:', updatedRisk.cancellationGraceWindowMinutes, 'min');
  console.log('  ✅ Test 1 Passed: Dynamic settings retrieval and atomic mutations verified.');

  // Test 2: Combi Bonus Boost Accumulator Matrix
  console.log('\n[Test 2] Testing Combi Bonus Boost Calculations across Tiers...');
  
  // 3-leg Combi (No bonus boost)
  const boost3 = settingsMgr.getCombiBonusPercent(3);
  const calc3 = CombiBonusCalculator.calculate(100.0, 5.0, 3, boost3);
  console.log(`  3 Legs -> Boost: ${calc3.bonusPercent}% | Gross: $${calc3.grossReturn} | Bonus: $${calc3.bonusAmount} | Final: $${calc3.finalPayout}`);
  if (calc3.bonusPercent !== 0 || calc3.bonusAmount !== 0 || calc3.finalPayout !== 500.0) {
    throw new Error('3-leg combi calculation mismatch');
  }

  // 5-leg Combi (+7.5% boost)
  const boost5 = settingsMgr.getCombiBonusPercent(5);
  const calc5 = CombiBonusCalculator.calculate(100.0, 10.0, 5, boost5);
  console.log(`  5 Legs -> Boost: ${calc5.bonusPercent}% | Gross: $${calc5.grossReturn} | Bonus: $${calc5.bonusAmount} | Final: $${calc5.finalPayout}`);
  // Profit = $900 -> Bonus = $900 * 7.5% = $67.50 -> Total = $1067.50
  if (calc5.bonusPercent !== 7.5 || calc5.bonusAmount !== 67.5 || calc5.finalPayout !== 1067.5) {
    throw new Error('5-leg combi calculation mismatch');
  }

  // 10-leg Combi (+20% boost)
  const boost10 = settingsMgr.getCombiBonusPercent(10);
  const calc10 = CombiBonusCalculator.calculate(50.0, 50.0, 10, boost10);
  console.log(`  10 Legs -> Boost: ${calc10.bonusPercent}% | Gross: $${calc10.grossReturn} | Bonus: $${calc10.bonusAmount} | Final: $${calc10.finalPayout}`);
  // Profit = $2450 -> Bonus = $2450 * 20% = $490 -> Total = $2990.00
  if (calc10.bonusPercent !== 20.0 || calc10.bonusAmount !== 490.0 || calc10.finalPayout !== 2990.0) {
    throw new Error('10-leg combi calculation mismatch');
  }

  // 20-leg Combi (+100% Mega Boost)
  const boost20 = settingsMgr.getCombiBonusPercent(20);
  const calc20 = CombiBonusCalculator.calculate(10.0, 200.0, 20, boost20);
  console.log(`  20 Legs -> Boost: ${calc20.bonusPercent}% | Gross: $${calc20.grossReturn} | Bonus: $${calc20.bonusAmount} | Final: $${calc20.finalPayout}`);
  // Profit = $1990 -> Bonus = $1990 * 100% = $1990 -> Total = $3990.00
  if (calc20.bonusPercent !== 100.0 || calc20.bonusAmount !== 1990.0 || calc20.finalPayout !== 3990.0) {
    throw new Error('20-leg combi mega-boost calculation mismatch');
  }
  console.log('  ✅ Test 2 Passed: Progressive accumulator boost matrix verified.');

  // Test 3: Maximum Winning Payout Cap
  console.log('\n[Test 3] Testing Maximum Winning Payout Ceiling...');
  const excessiveCalc = CombiBonusCalculator.calculate(1000.0, 500.0, 10, 20.0, 150000.0);
  console.log(`  Uncapped Return: $${excessiveCalc.grossReturn + excessiveCalc.bonusAmount} | Capped Payout: $${excessiveCalc.finalPayout} (Cap: $${excessiveCalc.maxWinningCap})`);
  if (!excessiveCalc.isCapped || excessiveCalc.finalPayout !== 150000.0) {
    throw new Error('Max payout cap enforcement failed');
  }
  console.log('  ✅ Test 3 Passed: Payout liability ceiling strictly enforced.');

  // Test 4: Ticket Cancellation within Grace Window
  console.log('\n[Test 4] Testing Valid Ticket Cancellation (Grace Window & Ledger Refund)...');
  const userId = 'usr-cancel-test-01';
  ledger.deposit(userId, 500.0);
  
  // Place $100 bet: Escrow locked, balance = $400
  ledger.holdBetStake(userId, 'slip-cancel-101', 100.0);
  console.log(`  Initial balance after bet placement: $${ledger.getBalance(userId)} (Held in escrow)`);

  const futureKickoff = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour in future
  const validTicket: BetSlipRecord = {
    id: 'slip-cancel-101',
    slipNumber: 'SLIP-998811',
    userId,
    betType: 'SINGLE',
    stake: 100.0,
    totalOdds: 2.00,
    potentialPayout: 200.0,
    status: 'ACCEPTED',
    placedAt: new Date().toISOString(), // Placed just now
    legs: [
      {
        id: 'leg-1',
        fixtureId: 'fix-arsenal-chelsea',
        fixtureName: 'Arsenal vs Chelsea',
        marketId: 'mkt-1X2',
        marketName: '1X2',
        selectionId: 'sel-1',
        selectionName: 'Arsenal',
        lockedOdds: 2.00,
        status: 'PENDING',
        fixtureStartTime: futureKickoff,
      } as any,
    ],
  };

  const cancelResult = cancelMgr.cancelTicket(validTicket, 5);
  console.log('  Cancellation result:', cancelResult);
  if (!cancelResult.success || cancelResult.refundAmount !== 100.0 || cancelResult.newBalance !== 500.0) {
    throw new Error('Valid ticket cancellation failed to refund full stake');
  }
  if (validTicket.status !== 'CANCELLED') {
    throw new Error('Ticket status was not updated to CANCELLED');
  }
  console.log('  ✅ Test 4 Passed: Ticket cancelled and stake refunded cleanly to player balance.');

  // Test 5: Rejection of Cancellation after Grace Window Expired
  console.log('\n[Test 5] Testing Cancellation Rejection after Grace Period Expiry...');
  const expiredTicket: BetSlipRecord = {
    id: 'slip-expired-202',
    slipNumber: 'SLIP-998822',
    userId,
    betType: 'SINGLE',
    stake: 50.0,
    totalOdds: 3.00,
    potentialPayout: 150.0,
    status: 'ACCEPTED',
    placedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // Placed 15 mins ago
    legs: [{ fixtureName: 'Real Madrid vs Barca', fixtureStartTime: futureKickoff } as any],
  };

  const expiredCheck = cancelMgr.isCancellable(expiredTicket, 5);
  console.log('  Expired ticket cancellable check:', expiredCheck);
  if (expiredCheck.cancellable) {
    throw new Error('Expired ticket should not be cancellable');
  }
  console.log('  ✅ Test 5 Passed: Late cancellation rejected due to grace window expiration.');

  // Test 6: Rejection of Cancellation after Kickoff
  console.log('\n[Test 6] Testing Cancellation Rejection after Fixture Kickoff...');
  const kickedOffTicket: BetSlipRecord = {
    id: 'slip-kickoff-303',
    slipNumber: 'SLIP-998833',
    userId,
    betType: 'SINGLE',
    stake: 50.0,
    totalOdds: 2.50,
    potentialPayout: 125.0,
    status: 'ACCEPTED',
    placedAt: new Date().toISOString(), // Placed just now
    legs: [
      {
        fixtureName: 'Liverpool vs Man City',
        fixtureStartTime: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // Kicked off 10 mins ago!
      } as any,
    ],
  };

  const kickoffCheck = cancelMgr.isCancellable(kickedOffTicket, 5);
  console.log('  In-play ticket cancellable check:', kickoffCheck);
  if (kickoffCheck.cancellable) {
    throw new Error('In-play kicked off ticket should not be cancellable');
  }
  console.log('  ✅ Test 6 Passed: In-play cancellation rejected due to active match kickoff.');

  console.log('\n===============================================================');
  console.log('  🎉 All Platform Settings, Combi Boost & Cancellation Tests Passed!');
  console.log('===============================================================');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
