import type { IRiskRepository, RiskProfile } from '../repositories/interfaces.ts';
import { RiskMemoryRepository } from '../repositories/memory/risk-memory-repository.ts';
import {
  ScenarioExposureEngine,
  type TicketPosition,
  type ProposedBetEvaluation,
  type ScenarioExposureReport,
  type MarketShadingAdjustment,
} from './scenario-exposure-engine.ts';

export type { RiskProfile, TicketPosition, ProposedBetEvaluation, ScenarioExposureReport, MarketShadingAdjustment };

export class RiskManager {
  private static instance: RiskManager;
  private repo: IRiskRepository;
  private memRepo: RiskMemoryRepository | null;
  private scenarioEngine: ScenarioExposureEngine;
  private scenarioSnapshotStack: Array<Map<string, TicketPosition[]>> = [];

  private constructor(repo?: IRiskRepository) {
    if (repo && !(repo instanceof RiskMemoryRepository)) {
      this.repo = repo;
      this.memRepo = null;
    } else {
      const memoryRepo = (repo as RiskMemoryRepository) || new RiskMemoryRepository();
      this.repo = memoryRepo;
      this.memRepo = memoryRepo;
    }
    this.scenarioEngine = ScenarioExposureEngine.getInstance();
  }

  public static getInstance(repo?: IRiskRepository): RiskManager {
    if (!RiskManager.instance) {
      RiskManager.instance = new RiskManager(repo);
    }
    return RiskManager.instance;
  }

  /** Reset singleton — used for testing with different repositories */
  public static resetInstance(): void {
    RiskManager.instance = undefined as any;
  }

  public getScenarioEngine(): ScenarioExposureEngine {
    return this.scenarioEngine;
  }

  public snapshotPlacementState(): Map<string, number> {
    if (!this.memRepo) throw new Error('ATOMIC_PLACEMENT_UNAVAILABLE');
    this.scenarioSnapshotStack.push(this.scenarioEngine.snapshot());
    return this.memRepo.snapshot();
  }

  public restorePlacementState(snapshot: Map<string, number>): void {
    if (!this.memRepo) throw new Error('ATOMIC_PLACEMENT_UNAVAILABLE');
    const scenarioSnap = this.scenarioSnapshotStack.pop();
    if (scenarioSnap) {
      this.scenarioEngine.restore(scenarioSnap);
    }
    this.memRepo.restore(snapshot);
  }

  private getProfile(): RiskProfile {
    if (this.memRepo) {
      return this.memRepo.getDefaultProfileSync();
    }
    // Fallback for non-memory repos (shouldn't be called synchronously)
    return {
      minStake: 0.10,
      maxStake: 5000.0,
      maxPotentialPayout: 100000.0,
      maxSelectionLiability: 50000.0,
    };
  }

  public validateStake(stake: number): void {
    const profile = this.getProfile();
    if (stake < profile.minStake) {
      throw new Error(`STAKE_TOO_LOW: Minimum stake is $${profile.minStake.toFixed(2)}`);
    }
    if (stake > profile.maxStake) {
      throw new Error(`STAKE_TOO_HIGH: Maximum stake is $${profile.maxStake.toFixed(2)}`);
    }
  }

  public validatePotentialPayout(potentialPayout: number): void {
    const profile = this.getProfile();
    if (potentialPayout > profile.maxPotentialPayout) {
      throw new Error(`PAYOUT_LIMIT_EXCEEDED: Maximum potential payout is $${profile.maxPotentialPayout.toFixed(2)}`);
    }
  }

  public registerLiability(selectionId: string, potentialProfit: number): void {
    const profile = this.getProfile();

    if (this.memRepo) {
      const current = this.memRepo.getLiabilitySync(selectionId);
      const updated = current + potentialProfit;
      if (updated > profile.maxSelectionLiability) {
        throw new Error(`MARKET_LIABILITY_LIMIT: Selection ${selectionId} has reached maximum exposure limit.`);
      }
      this.memRepo.setLiabilitySync(selectionId, updated);
    } else {
      // Async path for DB-backed repository would need an async version
      throw new Error('Synchronous registerLiability not supported with non-memory repository.');
    }
  }

  public releaseLiability(selectionId: string, potentialProfit: number): void {
    if (this.memRepo) {
      const current = this.memRepo.getLiabilitySync(selectionId);
      this.memRepo.setLiabilitySync(selectionId, Math.max(0, current - potentialProfit));
    } else {
      throw new Error('Synchronous releaseLiability not supported with non-memory repository.');
    }
  }

  public registerPosition(position: TicketPosition): void {
    this.scenarioEngine.registerTicket(position);
  }

  public removePosition(fixtureId: string, ticketId: string): void {
    this.scenarioEngine.removeTicket(fixtureId, ticketId);
  }

  public updatePosition(
    fixtureId: string,
    ticketId: string,
    status: 'ACCEPTED' | 'SETTLED' | 'VOID' | 'CASHED_OUT',
    remainingStake?: number,
    remainingPotentialPayout?: number
  ): void {
    this.scenarioEngine.updateTicketStatus(fixtureId, ticketId, status, remainingStake, remainingPotentialPayout);
  }

  public evaluateProposedScenario(
    fixtureId: string,
    proposed: {
      marketType: string;
      selection: string;
      line?: number;
      stake: number;
      odds: number;
    },
    scenarioLimit?: number
  ): ProposedBetEvaluation {
    return this.scenarioEngine.evaluateProposedBet(fixtureId, proposed, scenarioLimit);
  }

  public getScenarioExposure(
    fixtureId: string,
    probabilities?: Map<string, number>,
    scenarioLimit?: number
  ): ScenarioExposureReport {
    return this.scenarioEngine.calculateExposure(fixtureId, probabilities, scenarioLimit);
  }

  public getMarketShading(fixtureId: string, scenarioLimit?: number): MarketShadingAdjustment[] {
    return this.scenarioEngine.calculateMarketShading(fixtureId, scenarioLimit);
  }

  /** Returns the underlying repository */
  public getRepository(): IRiskRepository {
    return this.repo;
  }
}
