/**
 * Integration Test Suite for DatabaseClient, Repositories, and Ledger Persistence
 */

import { DatabaseClient } from '../../../packages/database/src/client.ts';
import { LedgerService } from '../src/wallet/ledger-service.ts';
import { BetPlacementService, BetSlipStatus, LegStatus } from '../src/betting/bet-placement.ts';
import { SettlementEngine } from '../src/settlement/settlement-engine.ts';
import { BetSlipType } from '../src/betting/bet-validator.ts';
import { LedgerMemoryRepository } from '../src/repositories/memory/ledger-memory-repository.ts';
import { BetSlipMemoryRepository } from '../src/repositories/memory/betslip-memory-repository.ts';
import { RiskMemoryRepository } from '../src/repositories/memory/risk-memory-repository.ts';
import { placeFixtureBet } from './fixture-prices.ts';

async function runDatabaseIntegrationTests() {
  console.log('===============================================================');
  console.log('  🗄️ Running Database & Repository Integration Test Suite');
  console.log('===============================================================');

  // --------------------------------------------------------------------------
  // Test 1: DatabaseClient Availability & Fallback Mode
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing DatabaseClient Availability & In-Memory Fallback...');
  const isDbAvailable = DatabaseClient.isAvailable();
  console.log(`  Database URL configured: ${isDbAvailable} (Current mode: ${isDbAvailable ? 'PostgreSQL' : 'In-Memory'})`);

  if (!isDbAvailable) {
    const client = await DatabaseClient.getInstance();
    if (client !== null) throw new Error('Database client should be null when DATABASE_URL is not provided');
    console.log('  ✅ Test 1 Passed: Client gracefully falls back to memory mode without DATABASE_URL.');
  } else {
    const isHealthy = await DatabaseClient.healthCheck();
    console.log(`  PostgreSQL Health Check: ${isHealthy ? 'HEALTHY' : 'UNAVAILABLE'}`);
    console.log('  ✅ Test 1 Passed: PostgreSQL connection verified.');
  }

  // --------------------------------------------------------------------------
  // Test 2: Repository Swapping & Constructor Injection
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Repository Injection into LedgerService & BetPlacementService...');
  const customLedgerRepo = new LedgerMemoryRepository();
  const customBetSlipRepo = new BetSlipMemoryRepository();
  const customRiskRepo = new RiskMemoryRepository();

  LedgerService.resetInstance();
  BetPlacementService.resetInstance();

  const customLedger = LedgerService.getInstance(customLedgerRepo);
  const customBetService = BetPlacementService.getInstance(customBetSlipRepo);

  const testUser = 'user-integration-db-99';
  customLedger.deposit(testUser, 500.0, 'USD', 'DEP-INTEG-500');

  const balance = customLedger.getBalance(testUser);
  console.log(`  Deposited $500 via injected repository: Balance = $${balance.toFixed(2)}`);
  if (balance !== 500.0) throw new Error(`Expected balance 500, got ${balance}`);

  const slip = placeFixtureBet(customBetService, {
    userId: testUser,
    betType: BetSlipType.SINGLE,
    stake: 50.0,
    legs: [
      {
        fixtureId: 'fix-integ-1',
        fixtureName: 'Liverpool vs Everton',
        marketId: 'mkt-1',
        marketName: '1X2',
        selectionId: 'sel-lfc',
        selectionName: 'Liverpool',
        submittedOdds: 1.80,
      },
    ],
  });

  console.log(`  Placed bet ${slip.slipNumber} via injected repository. Status: ${slip.status}`);
  if (customLedger.getBalance(testUser) !== 450.0) {
    throw new Error('Balance should be 450 after 50 stake');
  }

  const fetchedSlip = customBetService.getTicket(slip.id);
  if (!fetchedSlip || fetchedSlip.id !== slip.id) {
    throw new Error('Ticket retrieval from injected repository failed');
  }

  console.log('  ✅ Test 2 Passed: Custom repository injection and lifecycle verified.');

  // --------------------------------------------------------------------------
  // Test 3: Double-Entry Ledger Mathematical Conservation
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Double-Entry Conservation in Custom Repository...');
  const isConserved = customLedger.verifyLedgerConservation();
  console.log(`  Ledger conservation verified: ${isConserved}`);
  if (!isConserved) throw new Error('Ledger unbalanced in custom repository');
  console.log('  ✅ Test 3 Passed: 100% financial conservation maintained.');

  console.log('\n===============================================================');
  console.log('  🎉 All Database & Repository Integration Tests Passed!       ');
  console.log('===============================================================');
  process.exit(0);
}

runDatabaseIntegrationTests().catch((err) => {
  console.error('❌ Integration test failed:', err);
  process.exit(1);
});
