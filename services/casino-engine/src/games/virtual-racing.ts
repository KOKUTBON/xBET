import { randomUUID } from 'crypto';
import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import {
  VIRTUAL_RACING_CALIBRATION_VERSION,
  VIRTUAL_TRACKS,
  type VirtualTrackConfig,
  type VirtualRunnerProfile,
  GREYHOUND_PROFILES,
  HORSE_PROFILES,
  calculateRunnerOdds,
} from './virtual-racing-calibration.ts';

export interface VirtualRunner {
  number: number;
  name: string;
  trapNumber?: number;
  rating: number; // 60 to 99
  winOdds: number;
  placeOdds: number;
  profile?: VirtualRunnerProfile;
}

export interface VirtualRaceTickRunnerState {
  runnerNumber: number;
  distanceCoveredMeters: number;
  speedMps: number;
  rank: number;
  finished: boolean;
}

export interface VirtualRaceTick {
  tick: number;
  elapsedSeconds: number;
  runnerStates: VirtualRaceTickRunnerState[];
  events: string[];
}

export interface VirtualRaceReplay {
  raceId: string;
  calibrationVersion: string;
  trackId: string;
  trackName: string;
  type: 'GREYHOUND_RACING' | 'HORSE_RACING';
  distanceMeters: number;
  durationSeconds: number;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  finishOrder: number[]; // runner numbers in 1st, 2nd, 3rd... finish order
  finishTimes: Record<number, number>; // runnerNumber -> seconds elapsed to finish
  ticks: VirtualRaceTick[];
}

export interface VirtualRaceEvent {
  id: string;
  raceNumber: number;
  type: 'GREYHOUND_RACING' | 'HORSE_RACING';
  name: string;
  trackName: string;
  trackId: string;
  calibrationVersion: string;
  scheduledTime: Date;
  status: 'SCHEDULED' | 'RUNNING' | 'FINISHED';
  runners: VirtualRunner[];
  serverSeedHash?: string;
  serverSeed?: string;
  clientSeed?: string;
  nonce?: number;
  replay?: VirtualRaceReplay;
  result?: {
    winner: VirtualRunner;
    second: VirtualRunner;
    third: VirtualRunner;
    finishOrder: number[];
  };
}

export interface VirtualBet {
  userId: string;
  raceId: string;
  runnerNumber: number;
  betType: 'WIN' | 'PLACE' | 'SHOW' | 'FORECAST';
  forecastSecondRunner?: number;
  wager: number;
}

export interface VirtualBetResult {
  betId: string;
  userId: string;
  raceId: string;
  wager: number;
  payout: number;
  won: boolean;
  message: string;
}

/**
 * Append-only in-memory log of completed virtual race replays
 */
export class VirtualRaceEventLog {
  private static instance: VirtualRaceEventLog;
  private replays: Map<string, VirtualRaceReplay> = new Map();

  public static getInstance(): VirtualRaceEventLog {
    if (!VirtualRaceEventLog.instance) {
      VirtualRaceEventLog.instance = new VirtualRaceEventLog();
    }
    return VirtualRaceEventLog.instance;
  }

  public recordReplay(replay: VirtualRaceReplay): void {
    this.replays.set(replay.raceId, replay);
  }

  public getReplay(raceId: string): VirtualRaceReplay | undefined {
    return this.replays.get(raceId);
  }

  public hasReplay(raceId: string): boolean {
    return this.replays.has(raceId);
  }

  public getAllReplays(): VirtualRaceReplay[] {
    return Array.from(this.replays.values());
  }
}

export class VirtualRacingEngine {
  private static instance: VirtualRacingEngine;
  private activeEvents: Map<string, VirtualRaceEvent> = new Map();
  private eventLog: VirtualRaceEventLog;
  private eventCounter: number = 100;

  private constructor() {
    this.eventLog = VirtualRaceEventLog.getInstance();
    this.scheduleNextRaces();
  }

  public static getInstance(): VirtualRacingEngine {
    if (!VirtualRacingEngine.instance) {
      VirtualRacingEngine.instance = new VirtualRacingEngine();
    }
    return VirtualRacingEngine.instance;
  }

  public scheduleNextRaces(): void {
    // Schedule 1 Greyhound (Wimbledon Park, 6 traps) and 1 Horse Race (Ascot Derby, 8 runners)
    const greyhound = this.createRace('GREYHOUND_RACING', 'Wimbledon Park', 6);
    const horse = this.createRace('HORSE_RACING', 'Ascot Derby', 8);

    this.activeEvents.set(greyhound.id, greyhound);
    this.activeEvents.set(horse.id, horse);
  }

  public getUpcomingRaces(): VirtualRaceEvent[] {
    return Array.from(this.activeEvents.values());
  }

  public getRace(id: string): VirtualRaceEvent | undefined {
    return this.activeEvents.get(id);
  }

  public getRaceReplay(raceId: string): VirtualRaceReplay | undefined {
    return this.eventLog.getReplay(raceId) || this.activeEvents.get(raceId)?.replay;
  }

  /**
   * Deterministically reproduces a full race replay from seeds and calibration parameters.
   */
  public replayRace(raceId: string, serverSeed: string, clientSeed: string, nonce: number): VirtualRaceReplay {
    const race = this.activeEvents.get(raceId);
    if (!race) throw new Error(`Race ${raceId} not found`);
    return this.runPhysicsSimulation(race, serverSeed, clientSeed, nonce);
  }

  /**
   * Simulates the race outcome deterministically using Provably Fair RNG
   * and versioned physics calibration parameters.
   */
  public simulateRace(raceId: string, serverSeed: string, clientSeed: string, nonce: number): VirtualRaceEvent {
    const race = this.activeEvents.get(raceId);
    if (!race) throw new Error(`Race ${raceId} not found`);

    // Verify or assign server seed commitments
    if (race.serverSeed && race.serverSeed !== serverSeed) {
      // Race had a pre-committed seed
      serverSeed = race.serverSeed;
    }
    const serverSeedHash = ProvablyFairRNG.hashServerSeed(serverSeed);

    const replay = this.runPhysicsSimulation(race, serverSeed, clientSeed, nonce);

    const runnersMap = new Map(race.runners.map((r) => [r.number, r]));
    const finishOrder = replay.finishOrder;

    const winner = runnersMap.get(finishOrder[0])!;
    const second = runnersMap.get(finishOrder[1])!;
    const third = runnersMap.get(finishOrder[2])!;

    race.status = 'FINISHED';
    race.serverSeed = serverSeed;
    race.serverSeedHash = serverSeedHash;
    race.clientSeed = clientSeed;
    race.nonce = nonce;
    race.replay = replay;
    race.result = {
      winner,
      second,
      third,
      finishOrder,
    };

    this.eventLog.recordReplay(replay);
    return race;
  }

  /**
   * Core deterministic physics simulation generating second-by-second race ticks
   */
  private runPhysicsSimulation(
    race: VirtualRaceEvent,
    serverSeed: string,
    clientSeed: string,
    nonce: number
  ): VirtualRaceReplay {
    const track = this.resolveTrack(race.trackId || race.trackName, race.type);
    const distanceMeters = track.distanceMeters;
    const dt = track.tickIntervalSeconds;
    const runners = race.runners;

    interface RunnerSimState {
      runner: VirtualRunner;
      distanceCovered: number;
      speedMps: number;
      finished: boolean;
      finishTime: number | null;
    }

    const states: RunnerSimState[] = runners.map((runner) => ({
      runner,
      distanceCovered: 0,
      speedMps: 0,
      finished: false,
      finishTime: null,
    }));

    const ticks: VirtualRaceTick[] = [];
    const serverSeedHash = ProvablyFairRNG.hashServerSeed(serverSeed);

    // Initial tick t=0 (Gate opens)
    ticks.push({
      tick: 0,
      elapsedSeconds: 0,
      runnerStates: states.map((s, idx) => ({
        runnerNumber: s.runner.number,
        distanceCoveredMeters: 0,
        speedMps: 0,
        rank: idx + 1,
        finished: false,
      })),
      events: ['The starting gates open! Race is underway.'],
    });

    let currentTick = 0;
    let allFinished = false;
    let previousLeader: number | null = null;
    const maxTicks = Math.ceil((distanceMeters / 12.0) / dt) + 10; // safety ceiling

    while (!allFinished && currentTick < maxTicks) {
      currentTick += 1;
      const elapsedSeconds = parseFloat((currentTick * dt).toFixed(1));
      const tickEvents: string[] = [];

      for (let i = 0; i < states.length; i++) {
        const s = states[i];
        if (s.finished) continue;

        const profile = s.runner.profile || {
          baseRating: s.runner.rating,
          acceleration: 1.0,
          topSpeedMps: race.type === 'GREYHOUND_RACING' ? 17.0 : 17.2,
          stamina: 1.0,
          consistency: 1.0,
        };

        const prevDist = s.distanceCovered;
        const progressFraction = Math.min(1.0, prevDist / distanceMeters);

        // 1. Acceleration curve (first 25% of race distance)
        let accelFactor = 1.0;
        if (progressFraction < 0.25) {
          const accelWeight = 1.0 - progressFraction / 0.25;
          accelFactor = 0.85 + (profile.acceleration - 0.85) * accelWeight;
        }

        // 2. Stamina degradation / surge curve (final 30% of distance)
        let staminaFactor = 1.0;
        if (progressFraction > 0.70) {
          const lateWeight = (progressFraction - 0.70) / 0.30;
          staminaFactor = 1.0 + (profile.stamina - 1.0) * lateWeight;
        }

        // 3. Inner lane advantage (trap 1 has slight inside-rail curve edge)
        const laneOffset = track.laneCount - (s.runner.trapNumber || s.runner.number);
        const laneFactor = 1.0 + (track.innerLaneAdvantage * (laneOffset / track.laneCount));

        // 4. Provably Fair RNG noise (deterministic float between 0 and 1)
        const rngIndex = (currentTick * 100) + i;
        const rngFloat = ProvablyFairRNG.generateFloat(serverSeed, clientSeed, nonce, rngIndex);
        const noiseFactor = 1.0 + ((rngFloat - 0.5) * 0.08 * (1.0 / profile.consistency));

        // Calculate instantaneous speed
        const speed = profile.topSpeedMps * accelFactor * staminaFactor * laneFactor * noiseFactor;
        const deltaDist = speed * dt;
        const newDist = prevDist + deltaDist;

        if (newDist >= distanceMeters) {
          // Runner crossed finish line during this tick interval
          const fraction = (distanceMeters - prevDist) / (newDist - prevDist);
          const finishTime = parseFloat(((currentTick - 1) * dt + fraction * dt).toFixed(3));
          s.distanceCovered = distanceMeters;
          s.speedMps = 0;
          s.finished = true;
          s.finishTime = finishTime;
        } else {
          s.distanceCovered = parseFloat(newDist.toFixed(2));
          s.speedMps = parseFloat(speed.toFixed(2));
        }
      }

      // Compute rank at this tick
      const rankedIndices = states
        .map((_, idx) => idx)
        .sort((a, b) => {
          const sa = states[a];
          const sb = states[b];
          if (sa.finished && sb.finished) {
            return sa.finishTime! - sb.finishTime!;
          }
          if (sa.finished) return -1;
          if (sb.finished) return 1;
          return sb.distanceCovered - sa.distanceCovered;
        });

      const currentLeader = states[rankedIndices[0]].runner.number;
      if (previousLeader !== null && previousLeader !== currentLeader) {
        const leaderRunner = states[rankedIndices[0]].runner;
        tickEvents.push(`Runner #${leaderRunner.number} (${leaderRunner.name}) surges into the lead!`);
      }
      previousLeader = currentLeader;

      // Check milestones
      if (currentTick === Math.floor(maxTicks / 2)) {
        tickEvents.push('Halfway mark reached! Pack is tightly contested.');
      }

      const runnerStates: VirtualRaceTickRunnerState[] = states.map((s, idx) => {
        const rank = rankedIndices.indexOf(idx) + 1;
        return {
          runnerNumber: s.runner.number,
          distanceCoveredMeters: s.distanceCovered,
          speedMps: s.speedMps,
          rank,
          finished: s.finished,
        };
      });

      ticks.push({
        tick: currentTick,
        elapsedSeconds,
        runnerStates,
        events: tickEvents,
      });

      allFinished = states.every((s) => s.finished);
    }

    // Force finish for any remaining runners that didn't cross within max ticks
    let fallbackTime = currentTick * dt;
    for (const s of states) {
      if (!s.finished) {
        fallbackTime += 0.05;
        s.finished = true;
        s.finishTime = parseFloat(fallbackTime.toFixed(3));
        s.distanceCovered = distanceMeters;
      }
    }

    // Sort states by finish time ascending
    const sortedFinal = [...states].sort((a, b) => {
      if (a.finishTime! !== b.finishTime!) {
        return a.finishTime! - b.finishTime!;
      }
      return a.runner.number - b.runner.number; // deterministic tie breaker
    });

    const finishOrder = sortedFinal.map((s) => s.runner.number);
    const finishTimes: Record<number, number> = {};
    for (const s of sortedFinal) {
      finishTimes[s.runner.number] = s.finishTime!;
    }

    const durationSeconds = sortedFinal[sortedFinal.length - 1].finishTime!;

    return {
      raceId: race.id,
      calibrationVersion: VIRTUAL_RACING_CALIBRATION_VERSION,
      trackId: track.trackId,
      trackName: track.name,
      type: race.type,
      distanceMeters,
      durationSeconds,
      serverSeedHash,
      serverSeed,
      clientSeed,
      nonce,
      finishOrder,
      finishTimes,
      ticks,
    };
  }

  /**
   * Settles a virtual racing bet against the finished race result
   */
  public settleBet(bet: VirtualBet, race: VirtualRaceEvent): VirtualBetResult {
    if (!race.result) {
      throw new Error('RACE_NOT_FINISHED: Cannot settle bet on unresolved race');
    }

    const { winner, second, third, finishOrder } = race.result;
    const runner = race.runners.find((r) => r.number === bet.runnerNumber);
    if (!runner) throw new Error(`Runner #${bet.runnerNumber} not found in race`);

    let won = false;
    let multiplier = 0;
    let message = '';

    switch (bet.betType) {
      case 'WIN':
        if (winner.number === bet.runnerNumber) {
          won = true;
          multiplier = runner.winOdds;
          message = `Runner #${runner.number} (${runner.name}) WON!`;
        } else {
          message = `Runner #${runner.number} finished #${finishOrder.indexOf(runner.number) + 1}. Winner was #${winner.number}.`;
        }
        break;

      case 'PLACE':
        // Top 2 for greyhounds (6 traps), Top 3 for horses (8 runners)
        const placeCutoff = race.type === 'GREYHOUND_RACING' ? 2 : 3;
        const runnerRank = finishOrder.indexOf(bet.runnerNumber) + 1;
        if (runnerRank <= placeCutoff) {
          won = true;
          multiplier = runner.placeOdds;
          message = `Runner #${runner.number} placed in top ${placeCutoff}! (Finished #${runnerRank})`;
        } else {
          message = `Runner #${runner.number} finished #${runnerRank}, outside top ${placeCutoff}.`;
        }
        break;

      case 'SHOW':
        if (winner.number === bet.runnerNumber || second.number === bet.runnerNumber || third.number === bet.runnerNumber) {
          won = true;
          multiplier = parseFloat((1 + (runner.placeOdds - 1) * 0.75).toFixed(2));
          message = `Runner #${runner.number} showed in top 3!`;
        } else {
          message = `Runner #${runner.number} did not finish in top 3.`;
        }
        break;

      case 'FORECAST':
        if (winner.number === bet.runnerNumber && second.number === bet.forecastSecondRunner) {
          won = true;
          multiplier = parseFloat((runner.winOdds * 3.5).toFixed(2));
          message = `Exacta / Forecast hit! 1st: #${winner.number}, 2nd: #${second.number}`;
        } else {
          message = `Forecast missed. Finish was 1st: #${winner.number}, 2nd: #${second.number}`;
        }
        break;
    }

    const payout = won ? parseFloat((bet.wager * multiplier).toFixed(2)) : 0;

    return {
      betId: randomUUID(),
      userId: bet.userId,
      raceId: race.id,
      wager: bet.wager,
      payout,
      won,
      message,
    };
  }

  /**
   * Deterministically creates a race card using versioned profiles and calibration.
   * Zero Math.random() calls.
   */
  public createRace(
    type: 'GREYHOUND_RACING' | 'HORSE_RACING',
    trackNameOrId: string,
    runnerCount: number
  ): VirtualRaceEvent {
    this.eventCounter += 1;
    const raceId = `vrace-${type.toLowerCase()}-${this.eventCounter}`;
    const track = this.resolveTrack(trackNameOrId, type);

    const pool = type === 'GREYHOUND_RACING' ? GREYHOUND_PROFILES : HORSE_PROFILES;
    const selectedProfiles: VirtualRunnerProfile[] = [];

    // Deterministic selection from calibrated profile pool based on race number offset
    const poolOffset = (this.eventCounter - 100) % pool.length;
    for (let i = 0; i < runnerCount; i++) {
      const profile = pool[(poolOffset + i) % pool.length];
      selectedProfiles.push(profile);
    }

    // Deterministic odds calculation
    const odds = calculateRunnerOdds(
      selectedProfiles.map((p) => ({ rating: p.baseRating })),
      type === 'GREYHOUND_RACING' ? 2 : 3
    );

    const runners: VirtualRunner[] = selectedProfiles.map((p, idx) => ({
      number: idx + 1,
      name: p.name,
      trapNumber: idx + 1,
      rating: p.baseRating,
      winOdds: odds[idx].winOdds,
      placeOdds: odds[idx].placeOdds,
      profile: p,
    }));

    // Pre-round provably fair seed commitment
    const serverSeed = ProvablyFairRNG.generateServerSeed();
    const serverSeedHash = ProvablyFairRNG.hashServerSeed(serverSeed);

    return {
      id: raceId,
      raceNumber: this.eventCounter,
      type,
      name: `${track.name} Race #${this.eventCounter}`,
      trackName: track.name,
      trackId: track.trackId,
      calibrationVersion: VIRTUAL_RACING_CALIBRATION_VERSION,
      scheduledTime: new Date(Date.now() + 120000),
      status: 'SCHEDULED',
      runners,
      serverSeedHash,
      serverSeed, // revealed post-simulation
    };
  }

  private resolveTrack(trackNameOrId: string, type: 'GREYHOUND_RACING' | 'HORSE_RACING'): VirtualTrackConfig {
    const normalizedKey = trackNameOrId.toLowerCase().replace(/[\s-]+/g, '_');
    if (VIRTUAL_TRACKS[normalizedKey]) {
      return VIRTUAL_TRACKS[normalizedKey];
    }
    // Match by name or type fallback
    for (const track of Object.values(VIRTUAL_TRACKS)) {
      if (track.name.toLowerCase() === trackNameOrId.toLowerCase() || track.trackId === trackNameOrId) {
        return track;
      }
    }
    return type === 'GREYHOUND_RACING' ? VIRTUAL_TRACKS.wimbledon_park : VIRTUAL_TRACKS.ascot_derby;
  }
}
