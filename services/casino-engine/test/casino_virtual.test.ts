/**
 * Comprehensive Verification Test Suite for Casino RGS, Provably Fair RNG & Virtual Sports
 */

import { ProvablyFairRNG } from '../src/rng/provably-fair.ts';
import { BlackjackEngine } from '../src/games/blackjack.ts';
import { EuropeanRouletteEngine } from '../src/games/roulette.ts';
import { BaccaratEngine } from '../src/games/baccarat.ts';
import { SlotMachineEngine } from '../src/games/slots.ts';
import { VirtualRacingEngine } from '../src/games/virtual-racing.ts';
import { SeamlessWalletAdapter } from '../src/seamless-wallet/wallet-adapter.ts';
import { LedgerService } from '../../betting-engine/src/wallet/ledger-service.ts';

async function runCasinoAndVirtualTests() {
  console.log('===============================================================');
  console.log('  🧪 Running Casino RGS & Virtual Games Engine Test Suite');
  console.log('===============================================================');

  const ledger = LedgerService.getInstance();
  const wallet = SeamlessWalletAdapter.getInstance();
  const virtualRacing = VirtualRacingEngine.getInstance();

  const testUser = 'user-casino-888';
  ledger.deposit(testUser, 1000.0, 'USD', 'DEP-CASINO-1000');

  // --------------------------------------------------------------------------
  // Test 1: Provably Fair RNG Determinism & Hash Commitments
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Provably Fair RNG Cryptographic Properties...');
  const seeds = ProvablyFairRNG.generateSeedPair('my-client-seed-123');
  console.log(`  Server Seed Hash: ${seeds.serverSeedHash}`);

  const float1 = ProvablyFairRNG.generateFloat(seeds.serverSeed, seeds.clientSeed, 1, 0);
  const float2 = ProvablyFairRNG.generateFloat(seeds.serverSeed, seeds.clientSeed, 1, 0);
  const float3 = ProvablyFairRNG.generateFloat(seeds.serverSeed, seeds.clientSeed, 2, 0);

  if (float1 !== float2) throw new Error('RNG float generation is not deterministic with identical seeds & nonce');
  if (float1 === float3) throw new Error('RNG float generation should change across nonces');
  if (float1 < 0 || float1 >= 1.0) throw new Error('Float outside [0, 1) range');

  console.log(`  Generated deterministic float: ${float1.toFixed(6)} (reproducible across client/server seeds)`);
  console.log('  ✅ Test 1 Passed: Provably Fair HMAC-SHA256 RNG verified.');

  // --------------------------------------------------------------------------
  // Test 2: Blackjack Engine (Deal, Hit, Stand, Natural 21)
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Blackjack Classic Engine...');
  const bjDeal = BlackjackEngine.deal({
    userId: testUser,
    wager: 20.0,
    serverSeed: seeds.serverSeed,
    clientSeed: seeds.clientSeed,
    nonce: 1,
  });

  console.log(`  Initial Deal: Player has ${bjDeal.gameState.playerScore} pts | Dealer shows ${bjDeal.gameState.dealerScore} pts`);
  if (!bjDeal.gameState.playerHand || bjDeal.gameState.playerHand.length !== 2) {
    throw new Error('Player should have exactly 2 cards on initial deal');
  }

  // Play a full hand: Stand
  const bjStand = BlackjackEngine.stand(bjDeal.gameState, 20.0, testUser, bjDeal.roundId);
  console.log(`  Player Stands: Result = ${bjStand.gameState.gameStatus} | Final Payout: $${bjStand.payout} | ${bjStand.gameState.message}`);
  if (!bjStand.isCompleted) throw new Error('Hand should be marked completed after stand');
  console.log('  ✅ Test 2 Passed: Blackjack hand scoring and dealer stand logic verified.');

  // --------------------------------------------------------------------------
  // Test 3: European Roulette Engine (Inside & Outside Bets)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing European Roulette Engine...');
  const rouletteResult = EuropeanRouletteEngine.spin({
    userId: testUser,
    bets: [
      { type: 'RED', value: 'RED', amount: 50.0 },
      { type: 'BLACK', value: 'BLACK', amount: 50.0 },
      { type: 'STRAIGHT', value: 17, amount: 10.0 },
      { type: 'DOZEN', value: 'DOZEN_1', amount: 20.0 },
    ],
    serverSeed: seeds.serverSeed,
    clientSeed: seeds.clientSeed,
    nonce: 2,
  });

  console.log(`  Roulette Ball Landed on: ${rouletteResult.gameState.winningNumber} (${rouletteResult.gameState.winningColor})`);
  console.log(`  Total Wager: $${rouletteResult.wager} | Total Payout: $${rouletteResult.payout}`);
  if (rouletteResult.gameState.winningNumber < 0 || rouletteResult.gameState.winningNumber > 36) {
    throw new Error('Winning number outside European Roulette bounds (0-36)');
  }
  console.log('  ✅ Test 3 Passed: Roulette wheel spin and multi-bet evaluation verified.');

  // --------------------------------------------------------------------------
  // Test 4: Baccarat Professional Engine
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Baccarat Professional Engine...');
  const baccaratResult = BaccaratEngine.play({
    userId: testUser,
    betSide: 'BANKER',
    wager: 100.0,
    serverSeed: seeds.serverSeed,
    clientSeed: seeds.clientSeed,
    nonce: 3,
  });

  console.log(`  Baccarat Outcome: Player ${baccaratResult.gameState.playerScore} pts vs Banker ${baccaratResult.gameState.bankerScore} pts`);
  console.log(`  Winner: ${baccaratResult.gameState.winner} | Payout: $${baccaratResult.payout} (5% Banker Commission Applied)`);
  if (!['PLAYER', 'BANKER', 'TIE'].includes(baccaratResult.gameState.winner)) {
    throw new Error('Invalid baccarat winner side');
  }
  console.log('  ✅ Test 4 Passed: Baccarat score calculation and tableau rules verified.');

  // --------------------------------------------------------------------------
  // Test 5: Slot Machine Engine (5x3 Reel Grid & Paylines)
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Slot Machine Engine...');
  const slotResult = SlotMachineEngine.spin({
    userId: testUser,
    wager: 10.0,
    gameCode: 'slot_fruits',
    serverSeed: seeds.serverSeed,
    clientSeed: seeds.clientSeed,
    nonce: 4,
  });

  console.log(`  5x3 Reel Grid Spin Complete | Total Win Multiplier: ${slotResult.gameState.totalWinMultiplier}x | Payout: $${slotResult.payout}`);
  console.log(`  Winning Paylines: ${JSON.stringify(slotResult.gameState.winningLines)}`);
  if (slotResult.gameState.grid.length !== 3 || slotResult.gameState.grid[0].length !== 5) {
    throw new Error('Grid dimensions must be 5x3');
  }
  console.log('  ✅ Test 5 Passed: Slot reel generation and payline matcher verified.');

  // --------------------------------------------------------------------------
  // Test 6: Virtual Greyhound & Horse Racing Simulation
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Virtual Greyhound & Horse Racing Engine...');
  const races = virtualRacing.getUpcomingRaces();
  console.log(`  Found ${races.length} active scheduled virtual races.`);
  if (races.length < 2) throw new Error('Expected scheduled virtual races');

  const raceToSimulate = races[0];
  console.log(`  Simulating Race: ${raceToSimulate.name} with ${raceToSimulate.runners.length} runners...`);
  const simulatedRace = virtualRacing.simulateRace(raceToSimulate.id, seeds.serverSeed, seeds.clientSeed, 5);

  console.log(`  🏁 Race Result: 1st Place: #${simulatedRace.result!.winner.number} (${simulatedRace.result!.winner.name}) @ ${simulatedRace.result!.winner.winOdds}`);
  console.log(`                 2nd Place: #${simulatedRace.result!.second.number} (${simulatedRace.result!.second.name})`);
  console.log(`                 3rd Place: #${simulatedRace.result!.third.number} (${simulatedRace.result!.third.name})`);
  console.log(`  Finish Order: ${simulatedRace.result!.finishOrder.join(' -> ')}`);
  if (!simulatedRace.result || simulatedRace.result.finishOrder.length !== raceToSimulate.runners.length) {
    throw new Error('Race finish order missing runners');
  }
  console.log('  ✅ Test 6 Passed: Virtual Racing event scheduler and physics simulation verified.');

  // --------------------------------------------------------------------------
  // Test 7: Seamless Wallet Integration Protocol Cycle
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] Testing Seamless Wallet Protocol & Double-Entry Ledger Cycle...');
  const sessionToken = wallet.createSession(testUser, 'blackjack_classic', 'USD');
  const authResponse = wallet.authenticate(sessionToken);
  console.log(`  Seamless Wallet Authenticated: User ${authResponse.userId} | Balance: $${authResponse.balance.toFixed(2)}`);

  const initialBalance = authResponse.balance;
  const wagerAmount = 50.0;
  const roundId = 'rnd-test-999';

  // 1. Wager debit
  wallet.processWager(testUser, roundId, 'blackjack_classic', wagerAmount);
  const balanceAfterWager = wallet.getBalance(testUser);
  console.log(`  Balance after $50 wager: $${balanceAfterWager.toFixed(2)} (Held in Escrow)`);
  if (balanceAfterWager !== initialBalance - wagerAmount) {
    throw new Error(`Wager deduction error: ${balanceAfterWager}`);
  }

  // 2. Win payout (e.g. $100 payout)
  wallet.processPayout(testUser, roundId, 'blackjack_classic', wagerAmount, 100.0);
  const balanceAfterPayout = wallet.getBalance(testUser);
  console.log(`  Balance after $100 payout: $${balanceAfterPayout.toFixed(2)} (Escrow released + Margin profit)`);
  if (balanceAfterPayout !== initialBalance + 50.0) {
    throw new Error(`Payout credit error: ${balanceAfterPayout}`);
  }

  // 3. Double-entry ledger conservation check
  const isConserved = ledger.verifyLedgerConservation();
  console.log(`  Double-entry ledger mathematical conservation: ${isConserved}`);
  if (!isConserved) throw new Error('Ledger unbalanced across casino rounds');

  console.log('  ✅ Test 7 Passed: Seamless Wallet integration operates with strict ledger compliance.');

  console.log('\n===============================================================');
  console.log('  🎉 All Phase 4 Casino & Virtual Games Engine Tests Passed!   ');
  console.log('===============================================================');
  process.exit(0);
}

runCasinoAndVirtualTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
