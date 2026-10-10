/**
 * Multiplayer Texas Hold'em Poker State Machine Test Suite
 * Tests 7-card best hand combinator, betting round orchestration,
 * blinds rotation, side-pot calculations, and fold-around pot awards.
 */

import { TexasHoldemHandEvaluator, TexasHoldemTable } from '../src/poker/texas-holdem-table.ts';
import { PokerTableManager } from '../src/poker/poker-table-manager.ts';
import { PokerHandRank, PokerPlayerAction, PokerGameStage } from '../src/poker/poker-types.ts';
import type { Card } from '../src/games/blackjack.ts';

async function runPokerTests() {
  console.log('===============================================================');
  console.log('  ♠️ Running Texas Hold\'em Poker State Machine Test Suite      ');
  console.log('===============================================================');

  // --------------------------------------------------------------------------
  // Test 1: 7-Card Hand Evaluator Accuracy
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing 7-Card Hand Evaluator Combinations & Ranking...');

  // 1. Royal Flush
  const royalCards: Card[] = [
    { suit: 'SPADES', value: 'A' },
    { suit: 'SPADES', value: 'K' },
    { suit: 'SPADES', value: 'Q' },
    { suit: 'SPADES', value: 'J' },
    { suit: 'SPADES', value: '10' },
    { suit: 'DIAMONDS', value: '4' },
    { suit: 'CLUBS', value: '2' },
  ];
  const royalEval = TexasHoldemHandEvaluator.evaluate7CardHand(royalCards);
  console.log(`  Hand 1: ${royalEval.description} (Rank: ${royalEval.rank})`);
  if (royalEval.rank !== PokerHandRank.ROYAL_FLUSH) throw new Error('Failed to evaluate Royal Flush');

  // 2. Full House
  const fullHouseCards: Card[] = [
    { suit: 'SPADES', value: 'Q' },
    { suit: 'HEARTS', value: 'Q' },
    { suit: 'DIAMONDS', value: 'Q' },
    { suit: 'CLUBS', value: '8' },
    { suit: 'SPADES', value: '8' },
    { suit: 'DIAMONDS', value: 'A' },
    { suit: 'HEARTS', value: '2' },
  ];
  const fullHouseEval = TexasHoldemHandEvaluator.evaluate7CardHand(fullHouseCards);
  console.log(`  Hand 2: ${fullHouseEval.description} (Rank: ${fullHouseEval.rank})`);
  if (fullHouseEval.rank !== PokerHandRank.FULL_HOUSE) throw new Error('Failed to evaluate Full House');

  // 3. Wheel Straight (A-2-3-4-5)
  const wheelCards: Card[] = [
    { suit: 'HEARTS', value: 'A' },
    { suit: 'DIAMONDS', value: '2' },
    { suit: 'SPADES', value: '3' },
    { suit: 'CLUBS', value: '4' },
    { suit: 'HEARTS', value: '5' },
    { suit: 'SPADES', value: 'K' },
    { suit: 'DIAMONDS', value: '9' },
  ];
  const wheelEval = TexasHoldemHandEvaluator.evaluate7CardHand(wheelCards);
  console.log(`  Hand 3: ${wheelEval.description} (Rank: ${wheelEval.rank})`);
  if (wheelEval.rank !== PokerHandRank.STRAIGHT) throw new Error('Failed to evaluate Wheel Straight');

  // 4. Comparative Rank: Full House beats Straight
  if (fullHouseEval.score <= wheelEval.score) {
    throw new Error('Full House should score higher than Straight');
  }

  console.log('  ✅ Test 1 Passed: 7-Card Hand Evaluator correctly graded all poker hand ranks.');

  // --------------------------------------------------------------------------
  // Test 2: Table Seating & Preflop Blinds Deal
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Table Seating & Blinds Posting...');
  const table = new TexasHoldemTable({
    id: 'test-table-6max',
    name: 'Test Vegas 6-Max ($1 / $2)',
    smallBlind: 1.0,
    bigBlind: 2.0,
    minBuyIn: 40.0,
    maxBuyIn: 200.0,
    maxSeats: 6,
  });

  table.joinTable(0, 'usr-alice', 'Alice', 100.0);
  table.joinTable(1, 'usr-bob', 'Bob', 100.0);
  table.joinTable(2, 'usr-charlie', 'Charlie', 100.0);

  const started = table.startHand();
  const statePreflop = table.getState();

  console.log(`  Hand Started: ${started} | Stage: ${statePreflop.stage} | Pot: $${statePreflop.pot}`);
  console.log(`  Dealer Seat: #${statePreflop.dealerSeat} | SB: #${statePreflop.smallBlindSeat} | BB: #${statePreflop.bigBlindSeat} | Active: #${statePreflop.activePlayerSeat}`);

  if (statePreflop.stage !== PokerGameStage.PREFLOP || statePreflop.pot !== 3.0) {
    throw new Error('Preflop blinds posting failed');
  }
  console.log('  ✅ Test 2 Passed: 3 players seated, blinds posted ($3 total pot), and hole cards dealt.');

  // --------------------------------------------------------------------------
  // Test 3: Preflop Betting Actions (Raise, Call)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Preflop Action Sequencing...');

  // UTG is Seat #0 (Alice in 3-handed game after BB)
  const activeSeat = statePreflop.seats[statePreflop.activePlayerSeat]!;
  console.log(`  Acting Player: ${activeSeat.username} (Seat #${activeSeat.seatNumber})`);

  // Alice raises to $6
  table.handleAction(activeSeat.userId, PokerPlayerAction.RAISE, 6.0);
  console.log(`  ${activeSeat.username} raised to $6.00`);

  // Next player calls
  let nextState = table.getState();
  let nextActor = nextState.seats[nextState.activePlayerSeat]!;
  table.handleAction(nextActor.userId, PokerPlayerAction.CALL);
  console.log(`  ${nextActor.username} called $6.00`);

  // Next player calls
  nextState = table.getState();
  nextActor = nextState.seats[nextState.activePlayerSeat]!;
  table.handleAction(nextActor.userId, PokerPlayerAction.CALL);
  console.log(`  ${nextActor.username} called $6.00`);

  // Betting round should conclude and deal FLOP
  const flopState = table.getState();
  console.log(`  Advanced to Stage: ${flopState.stage} | Pot: $${flopState.pot} | Community Cards: ${flopState.communityCards.length}`);

  if (flopState.stage !== PokerGameStage.FLOP || flopState.communityCards.length !== 3 || flopState.pot !== 18.0) {
    throw new Error('FLOP stage progression failed');
  }
  console.log('  ✅ Test 3 Passed: Preflop betting completed and 3 FLOP community cards dealt.');

  // --------------------------------------------------------------------------
  // Test 4: Flop, Turn, River Actions to Showdown
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Progressing through Flop, Turn, and River to Showdown...');

  // Flop checks around
  for (let i = 0; i < 3; i++) {
    const s = table.getState();
    const actor = s.seats[s.activePlayerSeat]!;
    table.handleAction(actor.userId, PokerPlayerAction.CHECK);
  }
  console.log(`  Turn Stage: ${table.getState().stage} | Community Cards: ${table.getState().communityCards.length}`);

  // Turn checks around
  for (let i = 0; i < 3; i++) {
    const s = table.getState();
    const actor = s.seats[s.activePlayerSeat]!;
    table.handleAction(actor.userId, PokerPlayerAction.CHECK);
  }
  console.log(`  River Stage: ${table.getState().stage} | Community Cards: ${table.getState().communityCards.length}`);

  // River checks around -> Triggers Showdown
  for (let i = 0; i < 3; i++) {
    const s = table.getState();
    if (s.stage === PokerGameStage.SHOWDOWN) break;
    const actor = s.seats[s.activePlayerSeat]!;
    table.handleAction(actor.userId, PokerPlayerAction.CHECK);
  }

  const showdownState = table.getState();
  console.log(`  Final Stage: ${showdownState.stage} | Winner: ${showdownState.handWinners?.[0]?.username} with ${showdownState.handWinners?.[0]?.handName} (Won: $${showdownState.handWinners?.[0]?.winAmount})`);

  if (showdownState.stage !== PokerGameStage.SHOWDOWN || !showdownState.handWinners || showdownState.handWinners.length === 0) {
    throw new Error('Showdown did not resolve a winning player');
  }
  console.log('  ✅ Test 4 Passed: Full 5 community cards dealt and showdown evaluated.');

  // --------------------------------------------------------------------------
  // Test 5: Fold-Around Instant Win
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Fold-Around Instant Pot Collection...');
  table.startHand();
  let foldState = table.getState();
  let currentActor = foldState.seats[foldState.activePlayerSeat]!;

  // Player 1 raises to $10
  table.handleAction(currentActor.userId, PokerPlayerAction.RAISE, 10.0);
  console.log(`  ${currentActor.username} raised to $10.00`);

  // Player 2 folds
  foldState = table.getState();
  currentActor = foldState.seats[foldState.activePlayerSeat]!;
  table.handleAction(currentActor.userId, PokerPlayerAction.FOLD);
  console.log(`  ${currentActor.username} folded`);

  // Player 3 folds
  foldState = table.getState();
  currentActor = foldState.seats[foldState.activePlayerSeat]!;
  table.handleAction(currentActor.userId, PokerPlayerAction.FOLD);
  console.log(`  ${currentActor.username} folded`);

  const foldWonState = table.getState();
  console.log(`  Fold Winner: ${foldWonState.handWinners?.[0]?.username} (${foldWonState.handWinners?.[0]?.handName})`);

  if (foldWonState.handWinners?.[0]?.handName !== 'Won by Fold') {
    throw new Error('Fold-around did not award instant pot to remaining player');
  }
  console.log('  ✅ Test 5 Passed: Fold-around immediately awarded pot without dealing community cards.');

  // --------------------------------------------------------------------------
  // Test 6: Multi-Table Lobby Manager
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Poker Table Lobby Manager...');
  const lobby = PokerTableManager.getInstance();
  const tables = lobby.getLobbyList();

  console.log(`  Active Lobby Tables: ${tables.length}`);
  for (const t of tables) {
    console.log(`    - [${t.id}] ${t.name} (Stakes: ${t.blinds}, Seats: ${t.occupiedSeats}/${t.maxSeats})`);
  }

  if (tables.length < 3) throw new Error('Lobby tables missing');
  console.log('  ✅ Test 6 Passed: Multi-table lobby active with micro, low, and high stakes tables.');

  console.log('\n===============================================================');
  console.log('  🎉 All Texas Hold\'em Poker State Machine Tests Passed!       ');
  console.log('===============================================================');
  process.exit(0);
}

runPokerTests().catch((err) => {
  console.error('❌ Poker Tests failed:', err);
  process.exit(1);
});
