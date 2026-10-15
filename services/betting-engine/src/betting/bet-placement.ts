import { randomUUID } from 'crypto';
import { LedgerService } from '../wallet/ledger-service.ts';
import { RiskManager } from '../risk/risk-manager.ts';
import { BetValidator, BetSlipType, OddsTolerance } from './bet-validator.ts';
import type { PlaceBetRequest } from './bet-validator.ts';
import type { IBetSlipRepository } from '../repositories/interfaces.ts';
import { BetSlipMemoryRepository } from '../repositories/memory/betslip-memory-repository.ts';
import { TraderOperationsService } from '../trader/trader-operations-service.ts';

export const BetSlipStatus = {
  ACCEPTED: 'ACCEPTED',
  WON: 'WON',
  LOST: 'LOST',
  VOID: 'VOID',
  HALF_WON: 'HALF_WON',
  HALF_LOST: 'HALF_LOST',
  CASHED_OUT: 'CASHED_OUT',
} as const;
export type BetSlipStatus = (typeof BetSlipStatus)[keyof typeof BetSlipStatus];

export const LegStatus = {
  PENDING: 'PENDING',
  WON: 'WON',
  LOST: 'LOST',
  VOID: 'VOID',
  HALF_WON: 'HALF_WON',
  HALF_LOST: 'HALF_LOST',
} as const;
export type LegStatus = (typeof LegStatus)[keyof typeof LegStatus];

export interface BetLegRecord {
  id: string;
  selectionId: string;
  selectionName: string;
  marketId: string;
  marketName: string;
  marketType?: string;
  fixtureId: string;
  fixtureName: string;
  lockedOdds: number;
  status: LegStatus;
}

export interface BetSlipRecord {
  id: string;
  slipNumber: string;
  userId: string;
  betType: BetSlipType;
  status: BetSlipStatus;
  currencyCode: string;
  stake: number;
  totalOdds: number;
  potentialPayout: number;
  actualPayout: number;
  cashoutOffer: number | null;
  systemK?: number;
  systemCombinationCount?: number;
  stakePerCombination?: number;
  createdAt: Date;
  settledAt: Date | null;
  legs: BetLegRecord[];
}

export class BetPlacementService {
  private static instance: BetPlacementService;
  private ledger: LedgerService;
  private risk: RiskManager;
  private repo: IBetSlipRepository;
  private memRepo: BetSlipMemoryRepository | null;

  private constructor(repo?: IBetSlipRepository) {
    this.ledger = LedgerService.getInstance();
    this.risk = RiskManager.getInstance();
    if (repo && !(repo instanceof BetSlipMemoryRepository)) {
      this.repo = repo;
      this.memRepo = null;
    } else {
      const memoryRepo = (repo as BetSlipMemoryRepository) || new BetSlipMemoryRepository();
      this.repo = memoryRepo;
      this.memRepo = memoryRepo;
    }
  }

  public static getInstance(repo?: IBetSlipRepository): BetPlacementService {
    if (!BetPlacementService.instance) {
      BetPlacementService.instance = new BetPlacementService(repo);
    }
    return BetPlacementService.instance;
  }

  /** Reset singleton — used for testing with different repositories */
  public static resetInstance(): void {
    BetPlacementService.instance = undefined as any;
  }

  public placeBet(request: PlaceBetRequest, getLiveOddsCallback?: (selId: string) => number): BetSlipRecord {
    // This synchronous path can commit only to the in-memory repositories. Never
    // acknowledge a bet while database writes are still pending in Promises.
    if (!this.memRepo) throw new Error('ATOMIC_PLACEMENT_UNAVAILABLE');
    // 1. Basic validation
    if (!request.legs || request.legs.length === 0) {
      throw new Error('NO_LEGS: Bet slip must contain at least one selection.');
    }

    const currencyCode = request.currencyCode || 'USD';
    if (!Number.isFinite(request.stake) || request.stake <= 0) throw new Error('INVALID_STAKE');
    this.risk.validateStake(request.stake);

    // 2. Validate Odds and Lock snapshots
    const lockedLegs: BetLegRecord[] = [];
    const legOdds: number[] = [];

    const traderOps = TraderOperationsService.getInstance();
    for (const reqLeg of request.legs) {
      const perm = traderOps.isTradingPermitted(reqLeg.fixtureId, reqLeg.marketType || reqLeg.marketName);
      if (!perm.permitted) {
        throw new Error(`MARKET_SUSPENDED: ${perm.reason}`);
      }

      const liveOdd = getLiveOddsCallback ? getLiveOddsCallback(reqLeg.selectionId) : reqLeg.submittedOdds;
      if (!Number.isFinite(liveOdd) || liveOdd <= 1) {
        throw new Error('SERVER_ODDS_UNAVAILABLE');
      }
      const lockedOdd = BetValidator.validateOddsSlippage(
        reqLeg.submittedOdds,
        liveOdd,
        request.oddsTolerance || OddsTolerance.ACCEPT_HIGHER_ODDS
      );

      lockedLegs.push({
        id: randomUUID(),
        selectionId: reqLeg.selectionId,
        selectionName: reqLeg.selectionName,
        marketId: reqLeg.marketId,
        marketName: reqLeg.marketName,
        marketType: reqLeg.marketType,
        fixtureId: reqLeg.fixtureId,
        fixtureName: reqLeg.fixtureName,
        lockedOdds: lockedOdd,
        status: LegStatus.PENDING,
      });

      legOdds.push(lockedOdd);
    }

    // 3. Compute Total Odds & Potential Payout based on bet type
    let totalOdds = 1.0;
    let potentialPayout = 0.0;
    let systemCombinationCount: number | undefined;
    let stakePerCombination: number | undefined;

    if (request.betType === BetSlipType.SINGLE) {
      if (lockedLegs.length !== 1) {
        throw new Error('SINGLE_BET_INVALID: Single bet must contain exactly 1 leg.');
      }
      totalOdds = lockedLegs[0].lockedOdds;
      potentialPayout = parseFloat((request.stake * totalOdds).toFixed(2));
    } else if (request.betType === BetSlipType.COMBI) {
      if (lockedLegs.length < 2) {
        throw new Error('COMBI_BET_INVALID: Combi bet must contain at least 2 legs.');
      }
      totalOdds = BetValidator.calculateCombiOdds(legOdds);
      potentialPayout = parseFloat((request.stake * totalOdds).toFixed(2));
    } else if (request.betType === BetSlipType.BET_BUILDER) {
      if (lockedLegs.length < 2) {
        throw new Error('BET_BUILDER_INVALID: Bet Builder must contain at least 2 legs.');
      }
      totalOdds = getLiveOddsCallback('__builder_correlated_odds__') || lockedLegs[0].lockedOdds;
      potentialPayout = parseFloat((request.stake * totalOdds).toFixed(2));
    } else if (request.betType === BetSlipType.SYSTEM) {
      const k = request.systemK || 2;
      if (lockedLegs.length <= k) {
        throw new Error(`SYSTEM_BET_INVALID: Total legs (${lockedLegs.length}) must be strictly greater than system k (${k}).`);
      }
      const combinations = BetValidator.generateCombinations(lockedLegs, k);
      systemCombinationCount = combinations.length;
      stakePerCombination = parseFloat((request.stake / systemCombinationCount).toFixed(4));

      let maxSystemReturn = 0;
      for (const combo of combinations) {
        const comboOdds = combo.reduce((acc, leg) => acc * leg.lockedOdds, 1.0);
        maxSystemReturn += stakePerCombination * comboOdds;
      }
      totalOdds = parseFloat((maxSystemReturn / request.stake).toFixed(4));
      potentialPayout = parseFloat(maxSystemReturn.toFixed(2));
    }

    this.risk.validatePotentialPayout(potentialPayout);

    const slipId = randomUUID();
    const slipNumber = `SLIP-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    const betSlip: BetSlipRecord = {
      id: slipId,
      slipNumber,
      userId: request.userId,
      betType: request.betType,
      status: BetSlipStatus.ACCEPTED,
      currencyCode,
      stake: request.stake,
      totalOdds,
      potentialPayout,
      actualPayout: 0,
      cashoutOffer: parseFloat((request.stake * 0.95).toFixed(2)),
      systemK: request.systemK,
      systemCombinationCount,
      stakePerCombination,
      createdAt: new Date(),
      settledAt: null,
      legs: lockedLegs,
    };

    // JavaScript runs this block without an await, so requests in this process
    // cannot interleave. Restore all three stores if any write fails.
    const ledgerSnapshot = this.ledger.snapshotPlacementState();
    const riskSnapshot = this.risk.snapshotPlacementState();
    const ticketSnapshot = this.memRepo.snapshot();
    try {
      for (const leg of lockedLegs) {
        this.risk.registerLiability(leg.selectionId, potentialPayout - request.stake);
        this.risk.registerPosition({
          ticketId: slipId,
          fixtureId: leg.fixtureId,
          marketType: (leg as any).marketType || '1X2',
          selection: leg.selectionName,
          stake: request.stake,
          potentialPayout,
          status: 'ACCEPTED',
        });
      }
      this.ledger.holdBetStake(request.userId, slipId, request.stake, currencyCode);
      this.memRepo.saveSync(betSlip);
      this.memRepo.addUserTicketSync(request.userId, slipId);
    } catch (error) {
      this.memRepo.restore(ticketSnapshot);
      this.risk.restorePlacementState(riskSnapshot);
      this.ledger.restorePlacementState(ledgerSnapshot);
      throw error;
    }

    console.log(`[BetPlacement] Bet accepted: ${slipNumber} (${request.betType}) for User ${request.userId} | Stake: $${request.stake} | Pot. Payout: $${potentialPayout}`);
    return betSlip;
  }

  public getTicket(id: string): BetSlipRecord | undefined {
    if (this.memRepo) return this.memRepo.findByIdSync(id);
    throw new Error('Synchronous access not supported with non-memory repository.');
  }

  public getUserTickets(userId: string): BetSlipRecord[] {
    if (this.memRepo) return this.memRepo.findByUserIdSync(userId);
    throw new Error('Synchronous access not supported with non-memory repository.');
  }

  public getAllTickets(): BetSlipRecord[] {
    if (this.memRepo) return this.memRepo.findAllSync();
    throw new Error('Synchronous access not supported with non-memory repository.');
  }

  public getUnsettledTickets(): BetSlipRecord[] {
    if (this.memRepo) return this.memRepo.findByStatusSync(BetSlipStatus.ACCEPTED);
    throw new Error('Synchronous access not supported with non-memory repository.');
  }

  /** Returns the underlying repository */
  public getRepository(): IBetSlipRepository {
    return this.repo;
  }
}
