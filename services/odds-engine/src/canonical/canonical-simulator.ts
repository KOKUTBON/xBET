import { randomUUID } from 'crypto';
import type {
  CanonicalSportsEvent,
  CanonicalEventType,
} from '../../../../packages/core-types/src/canonical-event.ts';
import { CanonicalEventLog } from './canonical-event-log.ts';

export class CanonicalFootballSimulator {
  private log: CanonicalEventLog;

  constructor(log?: CanonicalEventLog) {
    this.log = log ?? CanonicalEventLog.getInstance();
  }

  /**
   * Helper to construct a canonical sports event with correct 4 timestamps and provenance.
   */
  public createEvent<T = Record<string, any>>(params: {
    fixtureId: string;
    sequence: number;
    eventType: CanonicalEventType;
    payload: T;
    occurredAt?: number;
    correctionRef?: { supersedesEventId: string; reason: string; originalEventType?: CanonicalEventType };
    provider?: string;
  }): CanonicalSportsEvent<T> {
    const now = params.occurredAt ?? Date.now();
    return {
      eventId: randomUUID(),
      provider: params.provider ?? 'Simulator',
      providerEventId: `sim-ev-${params.sequence}`,
      fixtureId: params.fixtureId,
      sport: 'football',
      eventType: params.eventType,
      schemaVersion: '1.0.0',
      providerSequence: params.sequence,
      timestamps: {
        occurred: now,
        published: now + 5,
        received: now + 15,
        processed: now + 20,
      },
      payload: params.payload,
      correctionRef: params.correctionRef,
      provenance: {
        source: 'CanonicalFootballSimulator',
        feedLatencyMs: 15,
        confidence: 1.0,
      },
    };
  }

  /**
   * Generates a complete milestone scenario containing:
   * 1. Kickoff
   * 2. Regular Goal (Home)
   * 3. Second Goal (Away)
   * 4. VAR Cancellation of Second Goal (Score restored)
   * 5. Red Card
   * 6. Full Time
   */
  public generateMilestoneMatch(fixtureId: string = 'canonical-ars-che-01'): {
    events: CanonicalSportsEvent[];
    homeGoalEvent: CanonicalSportsEvent;
    awayGoalEvent: CanonicalSportsEvent;
    varCancelEvent: CanonicalSportsEvent;
  } {
    const events: CanonicalSportsEvent[] = [];
    const baseTime = Date.now() - 3600000; // 1 hour ago
    let seq = 1;

    // 1. Kickoff
    const kickoff = this.createEvent({
      fixtureId,
      sequence: seq++,
      eventType: 'PERIOD_START',
      occurredAt: baseTime,
      payload: { period: '1H', minute: 0, clock: '00:00' },
    });
    events.push(kickoff);

    // 2. Minute 15 Tick
    events.push(
      this.createEvent({
        fixtureId,
        sequence: seq++,
        eventType: 'CLOCK_TICK',
        occurredAt: baseTime + 15 * 60000,
        payload: { minute: 15, clock: '15:00' },
      })
    );

    // 3. Goal 1: Home team (Arsenal) scores
    const homeGoal = this.createEvent({
      fixtureId,
      sequence: seq++,
      eventType: 'GOAL',
      occurredAt: baseTime + 23 * 60000,
      payload: { team: 'HOME', player: 'Bukayo Saka', minute: 23 },
    });
    events.push(homeGoal);

    // Reprice & Unsuspend
    events.push(
      this.createEvent({
        fixtureId,
        sequence: seq++,
        eventType: 'MARKET_UNSUSPEND',
        occurredAt: baseTime + 24 * 60000,
        payload: { reason: 'REPRICED_AFTER_GOAL' },
      })
    );

    // 4. Minute 35: Away team (Chelsea) scores a controversial goal
    const awayGoal = this.createEvent({
      fixtureId,
      sequence: seq++,
      eventType: 'GOAL',
      occurredAt: baseTime + 35 * 60000,
      payload: { team: 'AWAY', player: 'Nicolas Jackson', minute: 35 },
    });
    events.push(awayGoal);

    // 5. Minute 37: VAR Review begins -> Overturns Goal due to offside!
    const varCancel = this.createEvent({
      fixtureId,
      sequence: seq++,
      eventType: 'VAR_DECISION',
      occurredAt: baseTime + 37 * 60000,
      payload: {
        decision: 'GOAL_CANCELLED',
        targetEventId: awayGoal.eventId,
        reason: 'OFFSIDE_IN_BUILDUP',
      },
      correctionRef: {
        supersedesEventId: awayGoal.eventId,
        reason: 'OFFSIDE_IN_BUILDUP',
        originalEventType: 'GOAL',
      },
    });
    events.push(varCancel);

    // Reprice & Unsuspend
    events.push(
      this.createEvent({
        fixtureId,
        sequence: seq++,
        eventType: 'MARKET_UNSUSPEND',
        occurredAt: baseTime + 38 * 60000,
        payload: { reason: 'REPRICED_AFTER_VAR' },
      })
    );

    // 6. Minute 42: Red Card for Away Team
    events.push(
      this.createEvent({
        fixtureId,
        sequence: seq++,
        eventType: 'CARD',
        occurredAt: baseTime + 42 * 60000,
        payload: { team: 'AWAY', player: 'Marc Cucurella', cardType: 'RED', minute: 42 },
      })
    );

    // 7. Half Time
    events.push(
      this.createEvent({
        fixtureId,
        sequence: seq++,
        eventType: 'PERIOD_END',
        occurredAt: baseTime + 47 * 60000,
        payload: { period: '1H' },
      })
    );

    // 8. Second Half Start
    events.push(
      this.createEvent({
        fixtureId,
        sequence: seq++,
        eventType: 'PERIOD_START',
        occurredAt: baseTime + 62 * 60000,
        payload: { period: '2H', minute: 45, clock: '45:00' },
      })
    );

    // 9. Full Time
    events.push(
      this.createEvent({
        fixtureId,
        sequence: seq++,
        eventType: 'PERIOD_END',
        occurredAt: baseTime + 110 * 60000,
        payload: { period: '2H' },
      })
    );
    events.push(
      this.createEvent({
        fixtureId,
        sequence: seq++,
        eventType: 'FIXTURE_STATUS',
        occurredAt: baseTime + 111 * 60000,
        payload: { status: 'FINISHED' },
      })
    );

    return {
      events,
      homeGoalEvent: homeGoal,
      awayGoalEvent: awayGoal,
      varCancelEvent: varCancel,
    };
  }

  /**
   * Streams the generated match events into the canonical event log.
   */
  public ingestMilestoneMatch(fixtureId: string = 'canonical-ars-che-01') {
    const match = this.generateMilestoneMatch(fixtureId);
    for (const ev of match.events) {
      this.log.append(ev);
    }
    return match;
  }
}
