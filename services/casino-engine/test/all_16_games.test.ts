/**
 * Comprehensive Test Suite for All 16 Legacy In-House Casino & Virtual Games
 */

import { ProvablyFairRNG } from '../src/rng/provably-fair.ts';
import { BlackjackEngine } from '../src/games/blackjack.ts';
import { EuropeanRouletteEngine } from '../src/games/roulette.ts';
import { BaccaratEngine } from '../src/games/baccarat.ts';
import { CaribbeanStudPokerEngine } from '../src/games/stud-poker.ts';
import { HighLowEngine } from '../src/games/high-low.ts';
import { KenoEngine } from '../src/games/keno.ts';
import { BingoEngine } from '../src/games/bingo.ts';
import { ScratchCardEngine } from '../src/games/scratch.ts';
import { SlotThemesRegistry } from '../src/games/slot-themes.ts';
import { VirtualRacingEngine } from '../src/games/virtual-racing.ts';

async function runAll16GamesTests() {
  console.log('===============================================================');
  console.log('  🎰 Testing All 16 Legacy In-House Casino & Virtual Games');
  console.log('===============================================================');

  const seeds = ProvablyFairRNG.generateSeedPair('seed-all-16-games');
  const userId = 'user-gamer-777';

  // 1. Blackjack
  console.log('\n[Game 1/16] Classic Blackjack...');
  const bj = BlackjackEngine.deal({ userId, wager: 25, serverSeed: seeds.serverSeed, clientSeed: seeds.clientSeed, nonce: 1 });
  console.log(`  ✅ 1. Blackjack: Player Score: ${bj.gameState.playerScore} | Dealer: ${bj.gameState.dealerScore}`);

  // 2. European Roulette
  console.log('\n[Game 2/16] European Roulette...');
  const roulette = EuropeanRouletteEngine.spin({ userId, bets: [{ type: 'RED', value: 'RED', amount: 20 }], serverSeed: seeds.serverSeed, clientSeed: seeds.clientSeed, nonce: 2 });
  console.log(`  ✅ 2. European Roulette: Ball #${roulette.gameState.winningNumber} (${roulette.gameState.winningColor}) | Payout: $${roulette.payout}`);

  // 3. Baccarat Pro
  console.log('\n[Game 3/16] Baccarat Professional...');
  const baccarat = BaccaratEngine.play({ userId, betSide: 'BANKER', wager: 50, serverSeed: seeds.serverSeed, clientSeed: seeds.clientSeed, nonce: 3 });
  console.log(`  ✅ 3. Baccarat: Winner: ${baccarat.gameState.winner} | Payout: $${baccarat.payout}`);

  // 4. Caribbean Stud Poker
  console.log('\n[Game 4/16] Caribbean Stud Poker...');
  const studDeal = CaribbeanStudPokerEngine.deal({ userId, anteWager: 10, serverSeed: seeds.serverSeed, clientSeed: seeds.clientSeed, nonce: 4 });
  const studCall = CaribbeanStudPokerEngine.call(studDeal.gameState, userId, studDeal.roundId);
  console.log(`  ✅ 4. Caribbean Stud: Player: ${studCall.gameState.playerEval.description} | Dealer: ${studCall.gameState.dealerEval.description} | ${studCall.gameState.message}`);

  // 5. High-Low
  console.log('\n[Game 5/16] High-Low...');
  const highlow = HighLowEngine.play({ userId, choice: 'HIGHER', wager: 15, serverSeed: seeds.serverSeed, clientSeed: seeds.clientSeed, nonce: 5 });
  console.log(`  ✅ 5. High-Low: Base Card: ${highlow.gameState.baseCard.value} vs Next Card: ${highlow.gameState.nextCard.value} | ${highlow.gameState.message}`);

  // 6. Classic Keno 80
  console.log('\n[Game 6/16] Classic Keno 80...');
  const keno = KenoEngine.play({ userId, pickedNumbers: [5, 12, 23, 45, 67], wager: 10, serverSeed: seeds.serverSeed, clientSeed: seeds.clientSeed, nonce: 6 });
  console.log(`  ✅ 6. Keno 80: Picked 5 numbers, Matched ${keno.gameState.matchedCount} hits (${keno.gameState.hitNumbers.join(', ') || 'None'}) | Payout: $${keno.payout}`);

  // 7. Classic Bingo
  console.log('\n[Game 7/16] Classic Bingo...');
  const bingo = BingoEngine.play({ userId, wager: 10, serverSeed: seeds.serverSeed, clientSeed: seeds.clientSeed, nonce: 7 });
  console.log(`  ✅ 7. Bingo: Completed Lines: ${bingo.gameState.completedLines} | Payout: $${bingo.payout}`);

  // 8. Instant Scratch Cards
  console.log('\n[Game 8/16] Instant Scratch Cards...');
  const scratch = ScratchCardEngine.play({ userId, wager: 5, serverSeed: seeds.serverSeed, clientSeed: seeds.clientSeed, nonce: 8 });
  console.log(`  ✅ 8. Scratch Cards: Winner: ${scratch.gameState.isWinner} | Payout: $${scratch.payout}`);

  // 9-14. Slots Suite
  const slotGames = ['slot_fruits', 'slot_chicken', 'slot_ramses', 'slot_space', 'slot_christmas', 'soccer_hero'];
  slotGames.forEach((slug, idx) => {
    const slot = SlotThemesRegistry.play(slug, { userId, wager: 10, serverSeed: seeds.serverSeed, clientSeed: seeds.clientSeed, nonce: 9 + idx });
    console.log(`  ✅ ${9 + idx}. Slot [${slug}]: Multiplier: ${slot.gameState.totalWinMultiplier}x | Payout: $${slot.payout}`);
  });

  // 15-16. Virtual Racing
  const virtualRacing = VirtualRacingEngine.getInstance();
  const races = virtualRacing.getUpcomingRaces();

  console.log('\n[Game 15/16] Virtual Greyhound Racing...');
  const greyhoundRace = virtualRacing.simulateRace(races[0].id, seeds.serverSeed, seeds.clientSeed, 15);
  console.log(`  ✅ 15. Virtual Greyhound: Winner: #${greyhoundRace.result!.winner.number} ${greyhoundRace.result!.winner.name} @ ${greyhoundRace.result!.winner.winOdds}`);

  console.log('\n[Game 16/16] Virtual Horse Racing...');
  const horseRace = virtualRacing.simulateRace(races[1].id, seeds.serverSeed, seeds.clientSeed, 16);
  console.log(`  ✅ 16. Virtual Horse Racing: Winner: #${horseRace.result!.winner.number} ${horseRace.result!.winner.name} @ ${horseRace.result!.winner.winOdds}`);

  console.log('\n===============================================================');
  console.log('  🎉 All 16 In-House Casino & Virtual Games Passed!             ');
  console.log('===============================================================');
  process.exit(0);
}

runAll16GamesTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
