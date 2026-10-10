import { EventEmitter } from 'events';
import { CanonicalEventLog } from './canonical-event-log.ts';

export interface FeedHealthConfig {
  stalenessThresholdMs: number; // Max allowed silence before markets auto-suspend (default 5000ms)
  checkIntervalMs: number;       // How often to sweep for stale feeds (default 1000ms)
}

export class FeedHealthMonitor extends EventEmitter {
  private static instance: FeedHealthMonitor;
  private log: CanonicalEventLog;
  private lastActivityMap: Map<string, number> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private config: FeedHealthConfig;

  private constructor(config?: Partial<FeedHealthConfig>) {
    super();
    this.log = CanonicalEventLog.getInstance();
    this.config = {
      stalenessThresholdMs: config?.stalenessThresholdMs ?? 5000,
      checkIntervalMs: config?.checkIntervalMs ?? 1000,
    };

    // Listen to log events to track fixture activity
    this.log.on('event:appended', ({ event }) => {
      this.recordActivity(event.fixtureId, event.timestamps.received || Date.now());
    });
  }

  public static getInstance(config?: Partial<FeedHealthConfig>): FeedHealthMonitor {
    if (!FeedHealthMonitor.instance) {
      FeedHealthMonitor.instance = new FeedHealthMonitor(config);
    }
    return FeedHealthMonitor.instance;
  }

  public recordActivity(fixtureId: string, timestamp: number = Date.now()): void {
    this.lastActivityMap.set(fixtureId, timestamp);
    const state = this.log.getState(fixtureId);
    if (state && state.isStale) {
      state.isStale = false;
      state.isFeedConnected = true;
      if (state.suspensionReason === 'FEED_STALE_TIMEOUT' && !state.hasSequenceGap) {
        state.marketsSuspended = false;
        state.suspensionReason = undefined;
        this.emit('feed:recovered', { fixtureId });
        this.log.emit('markets:unsuspended', { fixtureId });
      }
    }
  }

  /**
   * Sweeps all tracked fixtures and suspends any whose feeds have stalled.
   */
  public checkStaleness(now: number = Date.now()): Array<{ fixtureId: string; wasSuspended: boolean }> {
    const results: Array<{ fixtureId: string; wasSuspended: boolean }> = [];

    for (const [fixtureId, lastActive] of this.lastActivityMap.entries()) {
      const state = this.log.getState(fixtureId);
      if (!state) continue;

      // Only in-play / live matches need active heartbeats
      const isLive = state.status === 'FIRST_HALF' || state.status === 'SECOND_HALF';
      if (!isLive) continue;

      const elapsed = now - lastActive;
      if (elapsed > this.config.stalenessThresholdMs) {
        const wasSuspended = !state.marketsSuspended;
        state.isStale = true;
        state.isFeedConnected = false;
        if (!state.marketsSuspended) {
          state.marketsSuspended = true;
          state.suspensionReason = 'FEED_STALE_TIMEOUT';
          this.emit('feed:stale', { fixtureId, elapsedMs: elapsed });
          this.log.emit('markets:suspended', { fixtureId, reason: 'FEED_STALE_TIMEOUT' });
        }
        results.push({ fixtureId, wasSuspended });
      }
    }

    return results;
  }

  public start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.checkStaleness();
    }, this.config.checkIntervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public reset(): void {
    this.lastActivityMap.clear();
    this.stop();
  }
}
