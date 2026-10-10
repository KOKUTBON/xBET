/**
 * Microservices Cron Scheduler & Health Diagnostics Test Suite
 * Tests recurring task execution, concurrency locking, reservation sweepers,
 * double-entry ledger audits, and multi-service diagnostic health probes.
 */

import { CronScheduler } from '../src/cron/cron-scheduler.ts';
import { ScheduledTaskStatus, ServiceHealthStatus } from '../src/cron/cron-types.ts';
import { ReservationTicketManager } from '../src/tickets/reservation-ticket-manager.ts';

async function runCronSchedulerTests() {
  console.log('===============================================================');
  console.log('  ⏱️ Running Cron Scheduler & Service Health Test Suite        ');
  console.log('===============================================================');

  const scheduler = CronScheduler.getInstance();
  const resManager = ReservationTicketManager.getInstance();

  // --------------------------------------------------------------------------
  // Test 1: Scheduled Job Registration & Listing
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Scheduled Job Registration...');
  const jobs = scheduler.getJobs();
  console.log(`  Found ${jobs.length} registered scheduled maintenance tasks:`);
  for (const j of jobs) {
    console.log(`    - [${j.id}] ${j.name} (Interval: ${j.intervalMs / 1000}s, Status: ${j.status})`);
  }

  if (jobs.length < 5) {
    throw new Error(`Expected at least 5 default scheduled jobs, found ${jobs.length}`);
  }
  console.log('  ✅ Test 1 Passed: Core maintenance jobs registered.');

  // --------------------------------------------------------------------------
  // Test 2: In-Play Stale Feed Monitor Execution
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Triggering In-Play Stale Feed Monitor Job...');
  const feedResult = await scheduler.triggerJob('FEED_STALE_MONITOR_1MIN');

  console.log(`  Feed Monitor Result: Success: ${feedResult.success} | Processed: ${feedResult.itemsProcessed} | Duration: ${feedResult.durationMs}ms`);
  const feedJob = scheduler.getJob('FEED_STALE_MONITOR_1MIN');

  if (!feedResult.success || feedJob?.status !== ScheduledTaskStatus.COMPLETED || feedJob.runCount !== 1) {
    throw new Error('Stale feed monitor job execution failed');
  }
  console.log('  ✅ Test 2 Passed: In-play odds feed monitor executed successfully.');

  // --------------------------------------------------------------------------
  // Test 3: Reservation Ticket Expiration Sweeper Execution
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Triggering Reservation Expiration Sweeper Job...');

  // Create an expired reservation ticket (expiry in the past)
  resManager.createReservation({
    stake: 50.0,
    legs: [
      {
        fixtureId: 'fix-past-match',
        fixtureName: 'Old Match vs Test',
        marketName: '1X2',
        selectionId: 'sel-1',
        selectionName: 'Old Match',
        odds: 2.10,
        kickoffTime: new Date(Date.now() - 3600 * 1000), // 1 hour ago
      },
    ],
  });

  const sweepResult = await scheduler.triggerJob('RESERVATION_EXPIRATION_SWEEPER_5MIN');
  console.log(`  Sweeper Result: Swept: ${sweepResult.itemsProcessed} items | Duration: ${sweepResult.durationMs}ms`);

  if (!sweepResult.success || sweepResult.itemsProcessed < 1) {
    throw new Error('Sweeper job did not clean up expired reservation');
  }
  console.log('  ✅ Test 3 Passed: Reservation ticket sweeper cleaned up expired booking codes.');

  // --------------------------------------------------------------------------
  // Test 4: Double-Entry Ledger Parity & Conservation Audit
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Triggering Double-Entry Ledger Parity Audit Job...');
  const ledgerResult = await scheduler.triggerJob('LEDGER_DOUBLE_ENTRY_AUDIT_30MIN');

  console.log(`  Ledger Audit: ${ledgerResult.message} (Success: ${ledgerResult.success})`);
  if (!ledgerResult.success) throw new Error('Ledger parity audit failed');
  console.log('  ✅ Test 4 Passed: Double-entry ledger audit verified mathematical balance parity.');

  // --------------------------------------------------------------------------
  // Test 5: Daily Financial Archiving Snapshot Job
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Triggering Daily Financial Archiving Snapshot...');
  const financeResult = await scheduler.triggerJob('DAILY_FINANCIAL_SNAPSHOT_24H');

  console.log(`  Financial Snapshot: ${financeResult.message}`);
  if (!financeResult.success) throw new Error('Daily financial archiving failed');
  console.log('  ✅ Test 5 Passed: Daily financial snapshot archived.');

  // --------------------------------------------------------------------------
  // Test 6: Concurrency Overlap Guard Protection
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Concurrency Lock & Overlapping Run Prevention...');
  const customJob = scheduler.registerJob({
    id: 'LONG_RUNNING_JOB',
    name: 'Simulated Long Running Task',
    description: 'Holds lock for 50ms',
    intervalMs: 10000,
    handler: async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { success: true, itemsProcessed: 1, durationMs: 50 };
    },
  });

  // Trigger asynchronously without awaiting immediately
  const promise1 = scheduler.triggerJob('LONG_RUNNING_JOB');
  // Attempt duplicate trigger while running
  const promise2 = scheduler.triggerJob('LONG_RUNNING_JOB');

  const [res1, res2] = await Promise.all([promise1, promise2]);
  console.log(`  Run 1 Success: ${res1.success} | Run 2 Skipped Overlap: ${!res2.success} ("${res2.message}")`);

  if (!res1.success || res2.success || res2.message !== 'Job already running') {
    throw new Error('Concurrency locking did not prevent overlapping job execution');
  }
  console.log('  ✅ Test 6 Passed: Concurrency lock prevented duplicate overlapping execution.');

  // --------------------------------------------------------------------------
  // Test 7: Multi-Service Diagnostic Health Probe
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] Running Multi-Service Diagnostic Health Checks...');
  const healthReport = await scheduler.runHealthChecks();

  console.log(`  Overall System Health: ${healthReport.overallStatus}`);
  console.log(`  Platform Uptime: ${healthReport.uptimeSeconds}s | Probed Services (${healthReport.services.length}):`);
  for (const s of healthReport.services) {
    console.log(`    - ${s.serviceName}: [${s.status}] (${s.latencyMs}ms)`);
  }

  if (healthReport.overallStatus !== ServiceHealthStatus.HEALTHY || healthReport.services.length < 5) {
    throw new Error('System health probe reported degraded or missing services');
  }
  console.log('  ✅ Test 7 Passed: Multi-service health diagnostics operational.');

  console.log('\n===============================================================');
  console.log('  🎉 All Cron Scheduler & Service Health Tests Passed!         ');
  console.log('===============================================================');
  process.exit(0);
}

runCronSchedulerTests().catch((err) => {
  console.error('❌ Cron Scheduler Tests failed:', err);
  process.exit(1);
});
