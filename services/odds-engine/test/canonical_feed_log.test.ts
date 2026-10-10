import assert from 'node:assert/strict';
import { CanonicalEventLog } from '../src/canonical/canonical-event-log.ts';
import { FootballStateReducer } from '../src/canonical/football-state-reducer.ts';
import { FeedHealthMonitor } from '../src/canonical/feed-health-monitor.ts';
import { CanonicalFootballSimulator } from '../src/canonical/canonical-simulator.ts';
import type { CanonicalSportsEvent } from '../../../packages/core-types/src/canonical-event.ts';

console.log('===============================================================');
console.log('  ⚽ Running Phase 1 Canonical Feed & Event Log Test Suite    ');
console.log('===============================================================');

async function runTests() {
  const log = CanonicalEventLog.getInstance();
  log.resetAll();
  const sim = new CanonicalFootballSimulator(log);

  // -------------------------------------------------------------------------
  // Test 1: Canonical Event Creation & 4 Timestamps
  // -------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Canonical Event Contracts & Timestamp Provenance...');
  const fixId = 'test-fix-101';
  const baseTime = Date.now() - 7200000;
  const kickoffEvent = sim.createEvent({
    fixtureId: fixId,
    sequence: 1,
    eventType: 'PERIOD_START',
    occurredAt: baseTime,
    payload: { period: '1H', minute: 0, clock: '00:00' },
  });

  assert.equal(kickoffEvent.sport, 'football');
  assert.equal(kickoffEvent.schemaVersion, '1.0.0');
  assert.ok(kickoffEvent.eventId.length > 0);
  assert.ok(kickoffEvent.timestamps.occurred <= kickoffEvent.timestamps.published);
  assert.ok(kickoffEvent.timestamps.published <= kickoffEvent.timestamps.received);
  assert.ok(kickoffEvent.timestamps.received <= kickoffEvent.timestamps.processed);
  assert.equal(kickoffEvent.provenance.confidence, 1.0);

  const res1 = log.append(kickoffEvent);
  assert.equal(res1.accepted, true);
  assert.equal(res1.state.period, '1H');
  assert.equal(res1.state.status, 'FIRST_HALF');
  assert.equal(res1.state.expectedNextSequence, 2);
  console.log('  ✅ Test 1 Passed: Event contracts, 4 timestamps, and provenance verified.');

  // -------------------------------------------------------------------------
  // Test 2: In-Play Goal Scoring & Automatic Reprice Suspension
  // -------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Goal Scoring & Market Suspension...');
  const goal1 = sim.createEvent({
    fixtureId: fixId,
    sequence: 2,
    eventType: 'GOAL',
    occurredAt: baseTime + 23 * 60000,
    payload: { team: 'HOME', player: 'Bukayo Saka', minute: 23 },
  });

  const res2 = log.append(goal1);
  assert.equal(res2.accepted, true);
  assert.equal(res2.state.score.home, 1);
  assert.equal(res2.state.score.away, 0);
  assert.equal(res2.state.goals.length, 1);
  assert.equal(res2.state.goals[0].player, 'Bukayo Saka');
  assert.equal(res2.state.marketsSuspended, true);
  assert.equal(res2.state.suspensionReason, 'GOAL_SCORED');
  console.log('  ✅ Test 2 Passed: Goal scored (1-0) and markets suspended for repricing.');

  // Unsuspend markets after repricing
  log.append(
    sim.createEvent({
      fixtureId: fixId,
      sequence: 3,
      eventType: 'MARKET_UNSUSPEND',
      occurredAt: baseTime + 24 * 60000,
      payload: { reason: 'REPRICED' },
    })
  );
  assert.equal(log.getState(fixId)?.marketsSuspended, false);

  // -------------------------------------------------------------------------
  // Test 3: VAR Goal Cancellation & Score Rollback
  // -------------------------------------------------------------------------
  console.log('\n[Test 3] Testing VAR Goal Cancellation & Score Rollback...');
  const awayGoal = sim.createEvent({
    fixtureId: fixId,
    sequence: 4,
    eventType: 'GOAL',
    occurredAt: baseTime + 35 * 60000,
    payload: { team: 'AWAY', player: 'Nicolas Jackson', minute: 35 },
  });
  log.append(awayGoal);
  assert.equal(log.getState(fixId)?.score.away, 1);
  assert.equal(log.getState(fixId)?.score.home, 1);

  // VAR Decision: Goal Cancelled
  const varCancel = sim.createEvent({
    fixtureId: fixId,
    sequence: 5,
    eventType: 'VAR_DECISION',
    occurredAt: baseTime + 37 * 60000,
    payload: {
      decision: 'GOAL_CANCELLED',
      targetEventId: awayGoal.eventId,
      reason: 'OFFSIDE',
    },
    correctionRef: {
      supersedesEventId: awayGoal.eventId,
      reason: 'OFFSIDE',
      originalEventType: 'GOAL',
    },
  });

  const resVar = log.append(varCancel);
  assert.equal(resVar.accepted, true);
  // Score must be rolled back from 1-1 to 1-0!
  assert.equal(resVar.state.score.home, 1);
  assert.equal(resVar.state.score.away, 0);
  assert.equal(resVar.state.goals.length, 2);
  const cancelled = resVar.state.goals.find((g) => g.eventId === awayGoal.eventId);
  assert.ok(cancelled);
  assert.equal(cancelled?.isCancelled, true);
  assert.equal(cancelled?.cancellationReason, 'OFFSIDE');
  assert.equal(resVar.state.marketsSuspended, true);
  assert.equal(resVar.state.suspensionReason, 'VAR_GOAL_OVERTURNED');
  console.log('  ✅ Test 3 Passed: Away goal successfully cancelled by VAR. Score rolled back to 1-0.');

  // Unsuspend markets after VAR
  log.append(
    sim.createEvent({
      fixtureId: fixId,
      sequence: 6,
      eventType: 'MARKET_UNSUSPEND',
      occurredAt: baseTime + 38 * 60000,
      payload: { reason: 'REPRICED_AFTER_VAR' },
    })
  );

  // -------------------------------------------------------------------------
  // Test 4: Idempotency & Deduplication
  // -------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Idempotency & Duplicate Rejection...');
  const dupResult = log.append(goal1); // re-append Goal 1
  assert.equal(dupResult.accepted, false);
  assert.equal(dupResult.isDuplicate, true);
  // Score should remain unchanged
  assert.equal(log.getState(fixId)?.score.home, 1);
  assert.equal(log.getState(fixId)?.score.away, 0);
  console.log('  ✅ Test 4 Passed: Duplicate event safely rejected without mutating state.');

  // -------------------------------------------------------------------------
  // Test 5: Sequence Gap Detection & Automated Market Suspension
  // -------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Sequence Gap Detection & Automated Suspension...');
  // Expected next sequence is 7. Send sequence 9 (skipping 7 and 8)
  const gapEvent = sim.createEvent({
    fixtureId: fixId,
    sequence: 9,
    eventType: 'CLOCK_TICK',
    occurredAt: baseTime + 50 * 60000,
    payload: { minute: 50, clock: '50:00' },
  });

  const gapRes = log.append(gapEvent);
  assert.equal(gapRes.gapDetected, true);
  assert.equal(gapRes.state.hasSequenceGap, true);
  assert.deepEqual(gapRes.state.missingSequences, [7, 8]);
  assert.equal(gapRes.state.marketsSuspended, true);
  assert.equal(gapRes.state.suspensionReason, 'SEQUENCE_GAP');
  console.log('  ✅ Test 5 Passed: Sequence gap [7, 8] detected. Markets automatically locked.');

  // Heal the gap out-of-order: first sequence 8, then sequence 7
  log.append(
    sim.createEvent({
      fixtureId: fixId,
      sequence: 8,
      eventType: 'CORNER',
      occurredAt: baseTime + 49 * 60000,
      payload: { team: 'HOME' },
    })
  );
  assert.equal(log.getState(fixId)?.hasSequenceGap, true);
  assert.deepEqual(log.getState(fixId)?.missingSequences, [7]);

  log.append(
    sim.createEvent({
      fixtureId: fixId,
      sequence: 7,
      eventType: 'CARD',
      occurredAt: baseTime + 48 * 60000,
      payload: { team: 'AWAY', cardType: 'YELLOW', minute: 48 },
    })
  );
  assert.equal(log.getState(fixId)?.hasSequenceGap, false);
  assert.deepEqual(log.getState(fixId)?.missingSequences, []);
  assert.equal(log.getState(fixId)?.marketsSuspended, false);
  console.log('  ✅ Test 5b Passed: Sequence gaps healed out-of-order. Markets reopened.');

  // -------------------------------------------------------------------------
  // Test 6: Feed Staleness & Silence SLA Monitor
  // -------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Feed Health & Staleness SLA Monitor...');
  const health = FeedHealthMonitor.getInstance({ stalenessThresholdMs: 50 });
  health.recordActivity(fixId, Date.now());

  // Simulate silence 60ms later
  const stalenessResults = health.checkStaleness(Date.now() + 60);
  assert.equal(stalenessResults.length, 1);
  assert.equal(stalenessResults[0].fixtureId, fixId);
  assert.equal(log.getState(fixId)?.isStale, true);
  assert.equal(log.getState(fixId)?.marketsSuspended, true);
  assert.equal(log.getState(fixId)?.suspensionReason, 'FEED_STALE_TIMEOUT');
  console.log('  ✅ Feed silence detected after 60ms. Markets automatically suspended.');

  // Heartbeat recovery
  health.recordActivity(fixId, Date.now());
  assert.equal(log.getState(fixId)?.isStale, false);
  assert.equal(log.getState(fixId)?.marketsSuspended, false);
  console.log('  ✅ Test 6 Passed: Feed heartbeat restored and markets safely unsuspended.');

  // -------------------------------------------------------------------------
  // Test 7: 100% Deterministic Replay from Append-Only Event Log
  // -------------------------------------------------------------------------
  console.log('\n[Test 7] Testing 100% Deterministic Event Replay...');
  const liveState = log.getState(fixId)!;
  const replayedState = log.replay(fixId);

  assert.equal(replayedState.fixtureId, liveState.fixtureId);
  assert.equal(replayedState.score.home, liveState.score.home);
  assert.equal(replayedState.score.away, liveState.score.away);
  assert.equal(replayedState.goals.length, liveState.goals.length);
  assert.equal(replayedState.cards.length, liveState.cards.length);
  assert.equal(replayedState.corners.home, liveState.corners.home);
  assert.equal(replayedState.lastEventSequence, liveState.lastEventSequence);
  assert.equal(replayedState.hasSequenceGap, false);

  // Time-travel replay: Replay up to minute 24 (before Chelsea goal and VAR review)
  const minute24Time = baseTime + 24 * 60000;
  const historicalState = log.replay(fixId, minute24Time);
  assert.equal(historicalState.score.home, 1);
  assert.equal(historicalState.score.away, 0);
  assert.equal(historicalState.goals.length, 1); // Only Arsenal goal existed at minute 24!
  console.log('  ✅ Test 7 Passed: Exact replay match verified across full match and time-travel slice.');

  // -------------------------------------------------------------------------
  // Test 8: Milestone Match Generation & Full Stream Run
  // -------------------------------------------------------------------------
  console.log('\n[Test 8] Testing Complete Milestone Match Generation & Ingestion...');
  const milestoneMatchId = 'canonical-milestone-ars-che';
  const matchResult = sim.ingestMilestoneMatch(milestoneMatchId);
  const milestoneFinal = log.getState(milestoneMatchId)!;

  assert.equal(matchResult.events.length, 12);
  assert.equal(milestoneFinal.score.home, 1);
  assert.equal(milestoneFinal.score.away, 0);
  assert.equal(milestoneFinal.status, 'FINISHED');
  assert.equal(milestoneFinal.cards.length, 1);
  assert.equal(milestoneFinal.cards[0].cardType, 'RED');
  assert.equal(milestoneFinal.goals.length, 2);
  assert.equal(milestoneFinal.goals.filter((g) => !g.isCancelled).length, 1);
  assert.equal(milestoneFinal.goals.filter((g) => g.isCancelled).length, 1);
  console.log('  ✅ Test 8 Passed: Full 11-event milestone fixture executed with VAR and Red Card.');

  console.log('\n===============================================================');
  console.log('  🎉 All Phase 1 Canonical Feed & Event Log Tests Passed!     ');
  console.log('===============================================================\n');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
