import { EventEmitter } from 'events';
import type {
  CanonicalSportsEvent,
  FootballState,
} from '../../../../packages/core-types/src/canonical-event.ts';
import { FootballStateReducer } from './football-state-reducer.ts';

export interface AppendResult {
  accepted: boolean;
  state: FootballState;
  isDuplicate: boolean;
  gapDetected: boolean;
}

export class CanonicalEventLog extends EventEmitter {
  private static instance: CanonicalEventLog;
  private eventsByFixture: Map<string, CanonicalSportsEvent[]> = new Map();
  private statesByFixture: Map<string, FootballState> = new Map();
  private eventsById: Map<string, CanonicalSportsEvent> = new Map();

  private constructor() {
    super();
  }

  public static getInstance(): CanonicalEventLog {
    if (!CanonicalEventLog.instance) {
      CanonicalEventLog.instance = new CanonicalEventLog();
    }
    return CanonicalEventLog.instance;
  }

  /**
   * Appends an event to the append-only event log and updates state via deterministic reducer.
   */
  public append(event: CanonicalSportsEvent): AppendResult {
    const fixtureId = event.fixtureId;
    if (!this.eventsByFixture.has(fixtureId)) {
      this.eventsByFixture.set(fixtureId, []);
      this.statesByFixture.set(fixtureId, FootballStateReducer.createInitialState(fixtureId));
    }

    // Check duplicate eventId
    if (this.eventsById.has(event.eventId)) {
      const currentState = this.statesByFixture.get(fixtureId)!;
      return { accepted: false, state: currentState, isDuplicate: true, gapDetected: false };
    }

    const currentState = this.statesByFixture.get(fixtureId)!;
    const previousGap = currentState.hasSequenceGap;
    const previousSuspension = currentState.marketsSuspended;

    // Apply event via pure reducer
    const nextState = FootballStateReducer.applyEvent(currentState, event);

    // If state didn't change (e.g. sequence was already applied), treat as duplicate
    if (nextState === currentState) {
      return { accepted: false, state: currentState, isDuplicate: true, gapDetected: false };
    }

    // Persist to append-only in-memory log
    const list = this.eventsByFixture.get(fixtureId)!;
    list.push(event);
    this.eventsById.set(event.eventId, event);
    this.statesByFixture.set(fixtureId, nextState);

    const gapDetected = !previousGap && nextState.hasSequenceGap;

    this.emit('event:appended', { event, state: nextState });
    this.emit('state:updated', { fixtureId, state: nextState });

    if (gapDetected) {
      this.emit('gap:detected', { fixtureId, missingSequences: nextState.missingSequences });
    }

    if (!previousSuspension && nextState.marketsSuspended) {
      this.emit('markets:suspended', { fixtureId, reason: nextState.suspensionReason });
    } else if (previousSuspension && !nextState.marketsSuspended) {
      this.emit('markets:unsuspended', { fixtureId });
    }

    return {
      accepted: true,
      state: nextState,
      isDuplicate: false,
      gapDetected,
    };
  }

  public getEvents(
    fixtureId: string,
    options?: { fromSeq?: number; toSeq?: number; upToTimestamp?: number }
  ): CanonicalSportsEvent[] {
    const list = this.eventsByFixture.get(fixtureId) || [];
    return list.filter((e) => {
      if (options?.fromSeq !== undefined && e.providerSequence < options.fromSeq) return false;
      if (options?.toSeq !== undefined && e.providerSequence > options.toSeq) return false;
      if (options?.upToTimestamp !== undefined && e.timestamps.occurred > options.upToTimestamp) return false;
      return true;
    });
  }

  public getEvent(eventId: string): CanonicalSportsEvent | undefined {
    return this.eventsById.get(eventId);
  }

  public getState(fixtureId: string): FootballState | undefined {
    return this.statesByFixture.get(fixtureId);
  }

  /**
   * Deterministically recomputes the state from the immutable append-only event log.
   */
  public replay(fixtureId: string, upToTimestamp?: number): FootballState {
    const events = this.eventsByFixture.get(fixtureId) || [];
    return FootballStateReducer.replay(fixtureId, events, upToTimestamp);
  }

  public clearFixture(fixtureId: string): void {
    const events = this.eventsByFixture.get(fixtureId) || [];
    for (const e of events) {
      this.eventsById.delete(e.eventId);
    }
    this.eventsByFixture.delete(fixtureId);
    this.statesByFixture.delete(fixtureId);
  }

  public resetAll(): void {
    this.eventsByFixture.clear();
    this.statesByFixture.clear();
    this.eventsById.clear();
  }
}
