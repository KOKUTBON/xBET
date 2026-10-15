import type {
  CanonicalSportsEvent,
  FootballCard,
  FootballGoal,
  FootballState,
} from '../../../../packages/core-types/src/canonical-event.ts';

export class FootballStateReducer {
  public static createInitialState(fixtureId: string): FootballState {
    return {
      fixtureId,
      status: 'NOT_STARTED',
      score: { home: 0, away: 0 },
      period: 'PRE',
      minute: 0,
      matchClock: '00:00',
      cards: [],
      goals: [],
      corners: { home: 0, away: 0 },
      lastEventSequence: 0,
      lastEventId: null,
      lastEventTimestamp: 0,
      isFeedConnected: true,
      isStale: false,
      hasSequenceGap: false,
      expectedNextSequence: 1,
      missingSequences: [],
      marketsSuspended: false,
      suspensionReason: undefined,
    };
  }

  /**
   * Deterministically applies a single canonical event to produce the next immutable state.
   */
  public static applyEvent(state: FootballState, event: CanonicalSportsEvent): FootballState {
    // 1. Idempotency / Deduplication check
    // If the event has an earlier sequence than expected and isn't a recorded missing sequence, or is already applied
    if (event.providerSequence < state.expectedNextSequence && !state.missingSequences.includes(event.providerSequence)) {
      // Event already processed, return state unchanged
      return state;
    }

    // Clone state immutably
    const next: FootballState = {
      ...state,
      score: { ...state.score },
      corners: { ...state.corners },
      cards: [...state.cards],
      goals: state.goals.map((g) => ({ ...g, scoreAfter: { ...g.scoreAfter } })),
      missingSequences: [...state.missingSequences],
    };

    // 2. Sequence gap detection
    if (event.providerSequence > next.expectedNextSequence) {
      // Gap detected! Record all missing sequences
      for (let s = next.expectedNextSequence; s < event.providerSequence; s++) {
        if (!next.missingSequences.includes(s)) {
          next.missingSequences.push(s);
        }
      }
      next.hasSequenceGap = true;
      next.marketsSuspended = true;
      next.suspensionReason = 'SEQUENCE_GAP';
      next.expectedNextSequence = event.providerSequence + 1;
    } else if (state.missingSequences.includes(event.providerSequence)) {
      // Out-of-order gap healing event arrived
      next.missingSequences = next.missingSequences.filter((s) => s !== event.providerSequence);
      if (next.missingSequences.length === 0) {
        next.hasSequenceGap = false;
        if (next.suspensionReason === 'SEQUENCE_GAP') {
          next.marketsSuspended = false;
          next.suspensionReason = undefined;
        }
      }
    } else {
      // Normal contiguous sequence
      next.expectedNextSequence = event.providerSequence + 1;
    }

    // 3. Process Event by Type
    switch (event.eventType) {
      case 'PERIOD_START': {
        const period = String(event.payload?.period || '1H');
        next.period = period;
        if (period === '1H') next.status = 'FIRST_HALF';
        else if (period === '2H') next.status = 'SECOND_HALF';
        else if (period === 'ET1' || period === 'ET2') next.status = 'EXTRA_TIME';
        else if (period === 'PEN') next.status = 'PENALTIES';
        if (event.payload?.minute !== undefined) next.minute = Number(event.payload.minute);
        if (event.payload?.clock) next.matchClock = String(event.payload.clock);
        break;
      }

      case 'PERIOD_END': {
        const period = String(event.payload?.period || next.period);
        if (period === '1H') next.status = 'HALF_TIME';
        else if (period === '2H' || period === 'FT') next.status = 'FINISHED';
        break;
      }

      case 'CLOCK_TICK': {
        if (event.payload?.minute !== undefined) next.minute = Number(event.payload.minute);
        if (event.payload?.clock) next.matchClock = String(event.payload.clock);
        break;
      }

      case 'GOAL': {
        const team = String(event.payload?.team || 'HOME').toUpperCase() as 'HOME' | 'AWAY';
        if (team === 'HOME') {
          next.score.home += 1;
        } else {
          next.score.away += 1;
        }

        const newGoal: FootballGoal = {
          id: `goal-${event.eventId}`,
          eventId: event.eventId,
          minute: Number(event.payload?.minute ?? next.minute),
          team,
          player: event.payload?.player ? String(event.payload.player) : undefined,
          scoreAfter: { ...next.score },
          isCancelled: false,
        };
        next.goals.push(newGoal);

        // When a goal is scored, live markets MUST suspend immediately to prevent stale acceptance before reprice
        next.marketsSuspended = true;
        next.suspensionReason = 'GOAL_SCORED';
        break;
      }

      case 'VAR_DECISION': {
        const decision = String(event.payload?.decision || '').toUpperCase();
        const targetEventId = String(event.payload?.targetEventId || event.correctionRef?.supersedesEventId || '');
        const reason = String(event.payload?.reason || event.correctionRef?.reason || 'VAR review');

        if (decision === 'GOAL_CANCELLED') {
          // Revert the goal!
          const goalIdx = next.goals.findIndex((g) => g.eventId === targetEventId && !g.isCancelled);
          if (goalIdx !== -1) {
            const cancelledGoal = next.goals[goalIdx];
            if (cancelledGoal.team === 'HOME') {
              next.score.home = Math.max(0, next.score.home - 1);
            } else {
              next.score.away = Math.max(0, next.score.away - 1);
            }
            cancelledGoal.isCancelled = true;
            cancelledGoal.cancellationReason = reason;

            // Trigger market suspension during VAR adjustment
            next.marketsSuspended = true;
            next.suspensionReason = 'VAR_GOAL_OVERTURNED';
          }
        } else if (decision === 'GOAL_CONFIRMED') {
          if (next.suspensionReason === 'GOAL_SCORED') {
            next.marketsSuspended = false;
            next.suspensionReason = undefined;
          }
        }
        break;
      }

      case 'CARD': {
        const team = String(event.payload?.team || 'HOME').toUpperCase() as 'HOME' | 'AWAY';
        const cardType = String(event.payload?.cardType || 'YELLOW').toUpperCase() as 'YELLOW' | 'RED';
        const newCard: FootballCard = {
          id: `card-${event.eventId}`,
          minute: Number(event.payload?.minute ?? next.minute),
          team,
          player: event.payload?.player ? String(event.payload.player) : undefined,
          cardType,
        };
        next.cards.push(newCard);
        if (cardType === 'RED') {
          // Red card triggers temporary market suspension for repricing
          next.marketsSuspended = true;
          next.suspensionReason = 'RED_CARD_SHADING';
        }
        break;
      }

      case 'CORNER': {
        const team = String(event.payload?.team || 'HOME').toUpperCase() as 'HOME' | 'AWAY';
        if (team === 'HOME') next.corners.home += 1;
        else next.corners.away += 1;
        break;
      }

      case 'MARKET_SUSPEND': {
        next.marketsSuspended = true;
        next.suspensionReason = String(event.payload?.reason || 'MANUAL_OR_PROVIDER_SUSPENSION');
        break;
      }

      case 'MARKET_UNSUSPEND': {
        if (!next.hasSequenceGap && !next.isStale) {
          next.marketsSuspended = false;
          next.suspensionReason = undefined;
        }
        break;
      }

      case 'FEED_HEARTBEAT': {
        next.isFeedConnected = true;
        next.isStale = false;
        break;
      }

      case 'FIXTURE_STATUS': {
        if (event.payload?.status) {
          next.status = event.payload.status as any;
        }
        break;
      }

      case 'CORRECTION': {
        // Direct correction referencing prior event
        if (event.correctionRef?.originalEventType === 'GOAL') {
          const goal = next.goals.find((g) => g.eventId === event.correctionRef!.supersedesEventId && !g.isCancelled);
          if (goal) {
            if (goal.team === 'HOME') next.score.home = Math.max(0, next.score.home - 1);
            else next.score.away = Math.max(0, next.score.away - 1);
            goal.isCancelled = true;
            goal.cancellationReason = event.correctionRef.reason;
          }
        }
        break;
      }
    }

    // 4. Update tracking metadata
    next.lastEventSequence = Math.max(next.lastEventSequence, event.providerSequence);
    next.lastEventId = event.eventId;
    next.lastEventTimestamp = event.timestamps.occurred;

    return next;
  }

  /**
   * Deterministically replays an array of canonical events from scratch up to an optional timestamp cutoff.
   */
  public static replay(
    fixtureId: string,
    events: CanonicalSportsEvent[],
    upToTimestamp?: number
  ): FootballState {
    // Sort events strictly by providerSequence ascending to guarantee determinism
    const sorted = [...events].sort((a, b) => a.providerSequence - b.providerSequence);

    let state = FootballStateReducer.createInitialState(fixtureId);
    for (const ev of sorted) {
      if (upToTimestamp && ev.timestamps.occurred > upToTimestamp) {
        break;
      }
      state = FootballStateReducer.applyEvent(state, ev);
    }
    return state;
  }
}
