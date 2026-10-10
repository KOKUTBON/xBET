import { MaintenanceCommissionEngine } from '../src/cron/maintenance-commission-engine.ts';
import { CronScheduler } from '../src/cron/cron-scheduler.ts';
import { LedgerService } from '../../../services/betting-engine/src/wallet/ledger-service.ts';
import { ReservationTicketManager } from '../src/tickets/reservation-ticket-manager.ts';

async function runTest() {
  console.log('===============================================================');
  console.log('  ⚙️ Running Periodic Maintenance & Agent Commission Suite     ');
  console.log('===============================================================');

  const engine = MaintenanceCommissionEngine.getInstance();
  const cron = CronScheduler.getInstance();
  const ledger = LedgerService.getInstance();
  const reservationMgr = ReservationTicketManager.getInstance();

  // Test 1: Agent Commission Settlement (GGR & Turnover)
  console.log('\n[Test 1] Testing Agent GGR Commission Settlement & Ledger Payout...');
  const agent1Id = 'usr-agent-alpha-01';
  const agent2Id = 'usr-agent-beta-02';

  const initialBalance1 = ledger.getBalance(agent1Id);
  console.log('  Agent 1 Initial Balance:', initialBalance1);

  const reports = [
    {
      agentId: agent1Id,
      agentUsername: 'agent_alpha',
      totalTurnover: 50000.0,
      totalPayouts: 38000.0, // GGR = $12,000
      commissionRate: 0.25, // 25% of GGR = $3,000
    },
    {
      agentId: agent2Id,
      agentUsername: 'agent_beta',
      totalTurnover: 20000.0,
      totalPayouts: 22000.0, // GGR = -$2,000 (Loss -> $0 commission)
      commissionRate: 0.20,
    },
  ];

  const settled = engine.settleAgentCommissions('monthly', reports);
  console.log('  Settled Records Count:', settled.length);
  console.log('  Agent 1 Commission:', settled[0].commissionAmount);
  console.log('  Agent 2 Commission (Negative GGR):', settled[1].commissionAmount);

  const finalBalance1 = ledger.getBalance(agent1Id);
  console.log('  Agent 1 New Balance after $3,000 payout:', finalBalance1);

  if (settled[0].commissionAmount !== 3000.0 || finalBalance1 !== initialBalance1 + 3000.0) {
    throw new Error('Agent 1 commission calculation or ledger payout failed');
  }

  if (settled[1].commissionAmount !== 0.0) {
    throw new Error('Agent with negative GGR was incorrectly awarded commission');
  }
  console.log('  ✅ Test 1 Passed: Agent GGR commissions calculated and credited accurately via ledger.');

  // Test 2: Agent Weekly Credit Balance Reset (CakePHP UserShell::weeklyBalance)
  console.log('\n[Test 2] Testing Weekly Agent Credit Allocation & Balance Refills...');
  const agent3Id = 'usr-agent-shop-cashier-03';
  ledger.deposit(agent3Id, 150.0, 'USD', 'INIT'); // Balance is $150

  const resetResults = engine.resetAgentWeeklyBalances([
    { agentId: agent3Id, targetCreditBalance: 1000.0 },
  ]);

  const newCreditBalance = ledger.getBalance(agent3Id);
  console.log('  Agent 3 Balance after Weekly Credit Reset ($1,000 cap):', newCreditBalance);
  if (newCreditBalance !== 1000.0 || resetResults[0].newBalance !== 1000.0) {
    throw new Error('Weekly agent credit reset failed');
  }
  console.log('  ✅ Test 2 Passed: Agent weekly credit allocation refreshed to target amount.');

  // Test 3: Housekeeping Expired Reservation Cleanup
  console.log('\n[Test 3] Testing Expired Reservation Ticket Housekeeping...');
  // Create a reservation booking with 0 TTL to simulate expiration
  const booking = reservationMgr.createReservation({
    userId: 'usr-punter-99',
    stake: 50.0,
    ttlHours: 0,
    legs: [
      {
        fixtureId: 'fix-1',
        fixtureName: 'Liverpool vs Arsenal',
        marketId: 'mkt-1',
        marketName: '1X2',
        selectionId: 'sel-1',
        selectionName: 'Home',
        reservedOdds: 2.1,
        kickoffTime: new Date(Date.now() - 3600000),
      },
    ],
  });
  console.log('  Created Reservation Booking Code:', booking.bookingCode);

  const cleanupRes = engine.cleanupExpiredReservations();
  console.log('  Pruned Reservations Count:', cleanupRes.prunedCount);
  if (cleanupRes.prunedCount === 0) {
    throw new Error('Expected at least 1 expired reservation to be pruned');
  }
  console.log('  ✅ Test 3 Passed: Housekeeping pruned expired reservation hold slips.');

  // Test 4: Daily Financial KPI Snapshot Archiving
  console.log('\n[Test 4] Testing Daily Financial KPI Snapshot Archiving...');
  const kpi = engine.generateDailyKpiSnapshot({
    date: '2026-08-19',
    totalTurnover: 250000.0,
    totalPayouts: 212500.0,
    ggr: 37500.0,
    totalDeposits: 180000.0,
    totalWithdrawals: 120000.0,
    activePlayersCount: 3200,
    ticketsCount: 9800,
  });

  console.log('  Generated KPI Snapshot:', kpi);
  const snapshots = engine.getDailyKpiSnapshots();
  if (snapshots.length === 0 || snapshots[0].ggr !== 37500.0) {
    throw new Error('Daily KPI snapshot generation failed');
  }
  console.log('  ✅ Test 4 Passed: Daily KPI metrics snapshot generated and stored.');

  // Test 5: CronScheduler Task Triggers & Diagnostics
  console.log('\n[Test 5] Testing CronScheduler Job Execution & Diagnostics...');
  const taskResult = await cron.triggerJob('AGENT_COMMISSION_SETTLER_1DAY');
  console.log('  Manual Cron Trigger Result:', taskResult);
  if (!taskResult.success) {
    throw new Error('Manual cron job trigger failed');
  }

  const systemHealth = await cron.runHealthChecks();
  console.log('  System Health Status:', systemHealth.overallStatus, '| Active Jobs:', systemHealth.activeScheduledJobsCount);
  if (systemHealth.activeScheduledJobsCount < 5) {
    throw new Error('Insufficient registered cron jobs in system health report');
  }
  console.log('  ✅ Test 5 Passed: Cron job execution, status locking, and diagnostic report verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Maintenance Shells & Commission Engine Tests Passed!  ');
  console.log('===============================================================');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
