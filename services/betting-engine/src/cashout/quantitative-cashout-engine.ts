import { randomUUID } from 'node:crypto';
import { BivariatePoissonModel } from '../../../odds-engine/src/domain/bivariate-poisson-model.ts';
import type { MatchContext, ScoreProbability } from '../../../odds-engine/src/domain/bivariate-poisson-model.ts';
import { LedgerService } from '../wallet/ledger-service.ts';
import { RiskManager } from '../risk/risk-manager.ts';
import { BetPlacementService, BetSlipStatus, LegStatus } from '../betting/bet-placement.ts';
import type { BetSlipRecord, BetLegRecord } from '../betting/bet-placement.ts';
import { BetSlipMemoryRepository } from '../repositories/memory/betslip-memory-repository.ts';
import type { IBetSlipRepository } from '../repositories/interfaces.ts';
import { TraderOperationsService } from '../trader/trader-operations-service.ts';

export interface InPlayMatchState {
  fixtureId: string;
  homeTeam?: string;
  awayTeam?: string;
  currentScore: { home: number; away: number };
  minute: number; // 0 to 90+
  redCards?: { home: number; away: number };
  status: 'NOT_STARTED' | 'LIVE' | 'HALF_TIME' | 'FINISHED' | 'SUSPENDED';
  isSuspended?: boolean;
}

export interface LegCashoutEvaluation {
  legId: string;
  fixtureId: string;
  selectionId: string;
  selectionName: string;
  marketType: string;
  status: string;
  modelEvaluated: boolean;
  conditionalProbability: number;
  isSuspended: boolean;
  suspensionReason?: string;
}

export interface PartialCashoutPreset {
  percentage: number;
  cashoutAmount: number;
  remainingStake: number;
  remainingPotentialPayout: number;
}

export interface CashoutQuote {
  slipId: string;
  status: 'AVAILABLE' | 'SUSPENDED' | 'UNAVAILABLE';
  currencyCode: string;
  originalStake: number;
  currentStake: number;
  potentialPayout: number;
  fairValue: number;
  haircut: number;
  cashoutOffer: number | null;
  jointProbability: number;
  legs: LegCashoutEvaluation[];
  partialPresets: PartialCashoutPreset[];
  suspensionReason?: string;
  calculatedAt: string;
}

export interface ExecuteCashoutParams {
  slipId: string;
  cashoutPercentage?: number; // 1.0 for 100% full cashout, or e.g. 0.50 for 50% partial cashout
  expectedAmount?: number;
  maxSlippage?: number;
  matchStates?: Map<string, InPlayMatchState>;
  getLiveOddsCallback?: (selId: string) => number | null;
}

export interface CashoutExecutionResult {
  slip: BetSlipRecord;
  cashoutAmount: number;
  cashoutPercentage: number;
  isPartial: boolean;
  remainingStake: number;
  remainingPotentialPayout: number;
  newBalance: number;
}

export class QuantitativeCashoutEngine {
  private static instance: QuantitativeCashoutEngine;
  private ledger: LedgerService;
  private risk: RiskManager;
  private betService: BetPlacementService;
  private repo: IBetSlipRepository;
  private memRepo: BetSlipMemoryRepository | null;
  private inPlayMatchStates: Map<string, InPlayMatchState> = new Map();

  private constructor(repo?: IBetSlipRepository) {
    this.ledger = LedgerService.getInstance();
    this.risk = RiskManager.getInstance();
    this.betService = BetPlacementService.getInstance(repo);
    if (repo && !(repo instanceof BetSlipMemoryRepository)) {
      this.repo = repo;
      this.memRepo = null;
    } else {
      const mem = (repo as BetSlipMemoryRepository) || new BetSlipMemoryRepository();
      this.repo = mem;
      this.memRepo = mem;
    }
  }

  public static getInstance(repo?: IBetSlipRepository): QuantitativeCashoutEngine {
    if (!QuantitativeCashoutEngine.instance) {
      QuantitativeCashoutEngine.instance = new QuantitativeCashoutEngine(repo);
    }
    return QuantitativeCashoutEngine.instance;
  }

  public static resetInstance(): void {
    QuantitativeCashoutEngine.instance = undefined as any;
  }

  /**
   * Registers or updates in-play match state for quantitative modeling.
   */
  public updateMatchState(state: InPlayMatchState): void {
    this.inPlayMatchStates.set(state.fixtureId, { ...state });
  }

  public getMatchState(fixtureId: string): InPlayMatchState | undefined {
    return this.inPlayMatchStates.get(fixtureId);
  }

  public clearMatchStates(): void {
    this.inPlayMatchStates.clear();
  }

  /**
   * Calculates dynamic fair value and cashout offer from isolated live odds parameters.
   */
  public calculateStandaloneOffer(params: {
    initialStake: number;
    initialOdds: number;
    potentialPayout: number;
    currentLiveOdds: number;
    matchMinute?: number;
    customHaircut?: number;
  }): { isAvailable: boolean; cashoutOffer: number; fairValue: number; haircut: number } {
    if (params.currentLiveOdds <= 1.0) {
      return { isAvailable: false, cashoutOffer: 0, fairValue: 0, haircut: 0 };
    }
    const impliedProb = Math.min(1.0, 1.0 / params.currentLiveOdds);
    const fairValue = parseFloat((params.potentialPayout * impliedProb).toFixed(2));
    let haircut = params.customHaircut ?? 0.08;
    if ((params.matchMinute ?? 0) >= 75) {
      haircut = Math.min(0.15, haircut + 0.02);
    }
    const cashoutOffer = parseFloat((fairValue * (1 - haircut)).toFixed(2));
    return {
      isAvailable: cashoutOffer > 0,
      cashoutOffer,
      fairValue,
      haircut,
    };
  }

  /**
   * Calculates real-time fair value and dynamic cashout quote for a ticket
   * using joint bivariate Poisson probabilities across open legs.
   */
  public calculateCashoutQuote(
    slipId: string,
    options?: {
      matchStates?: Map<string, InPlayMatchState>;
      getLiveOddsCallback?: (selId: string) => number | null;
      customHaircut?: number;
    }
  ): CashoutQuote {
    const slip = this.betService.getTicket(slipId);
    if (!slip) {
      return this.buildUnavailableQuote(slipId, 'TICKET_NOT_FOUND');
    }

    if (slip.status !== BetSlipStatus.ACCEPTED) {
      return this.buildUnavailableQuote(slipId, `TICKET_${slip.status}`);
    }

    // Check if any leg already lost
    if (slip.legs.some((l) => l.status === LegStatus.LOST)) {
      return {
        slipId,
        status: 'AVAILABLE',
        currencyCode: slip.currencyCode,
        originalStake: slip.stake,
        currentStake: slip.stake,
        potentialPayout: slip.potentialPayout,
        fairValue: 0.0,
        haircut: 0.0,
        cashoutOffer: 0.0,
        jointProbability: 0.0,
        legs: slip.legs.map((l) => ({
          legId: l.id,
          fixtureId: l.fixtureId,
          selectionId: l.selectionId,
          selectionName: l.selectionName,
          marketType: l.marketType || '1X2',
          status: l.status,
          modelEvaluated: false,
          conditionalProbability: l.status === LegStatus.LOST ? 0.0 : 1.0,
          isSuspended: false,
        })),
        partialPresets: [],
        calculatedAt: new Date().toISOString(),
      };
    }

    const matchStatesMap = options?.matchStates || this.inPlayMatchStates;
    const legEvaluations: LegCashoutEvaluation[] = [];
    let jointProbability = 1.0;
    let anySuspended = false;
    let suspensionReason: string | undefined;
    let maxMinute = 0;
    let closeGameCount = 0;

    for (const leg of slip.legs) {
      if (leg.status === LegStatus.WON) {
        legEvaluations.push({
          legId: leg.id,
          fixtureId: leg.fixtureId,
          selectionId: leg.selectionId,
          selectionName: leg.selectionName,
          marketType: leg.marketType || '1X2',
          status: LegStatus.WON,
          modelEvaluated: false,
          conditionalProbability: 1.0,
          isSuspended: false,
        });
        continue;
      }

      if (leg.status === LegStatus.VOID) {
        legEvaluations.push({
          legId: leg.id,
          fixtureId: leg.fixtureId,
          selectionId: leg.selectionId,
          selectionName: leg.selectionName,
          marketType: leg.marketType || '1X2',
          status: LegStatus.VOID,
          modelEvaluated: false,
          conditionalProbability: 1.0,
          isSuspended: false,
        });
        continue;
      }

      // Leg is PENDING: Evaluate via in-play match state or fallback odds callback
      const traderOps = TraderOperationsService.getInstance();
      const tradingPerm = traderOps.isTradingPermitted(leg.fixtureId, leg.marketType || '1X2');
      if (!tradingPerm.permitted) {
        anySuspended = true;
        suspensionReason = `TRADER_SUSPENDED: ${tradingPerm.reason}`;
        legEvaluations.push({
          legId: leg.id,
          fixtureId: leg.fixtureId,
          selectionId: leg.selectionId,
          selectionName: leg.selectionName,
          marketType: leg.marketType || '1X2',
          status: leg.status,
          modelEvaluated: false,
          conditionalProbability: 0.0,
          isSuspended: true,
          suspensionReason: tradingPerm.reason,
        });
        continue;
      }

      const matchState = matchStatesMap.get(leg.fixtureId);

      if (matchState) {
        if (matchState.isSuspended || matchState.status === 'SUSPENDED') {
          anySuspended = true;
          suspensionReason = `MARKET_SUSPENDED: Fixture ${leg.fixtureId} is currently suspended`;
          legEvaluations.push({
            legId: leg.id,
            fixtureId: leg.fixtureId,
            selectionId: leg.selectionId,
            selectionName: leg.selectionName,
            marketType: leg.marketType || '1X2',
            status: leg.status,
            modelEvaluated: true,
            conditionalProbability: 0.0,
            isSuspended: true,
            suspensionReason: 'MARKET_SUSPENDED',
          });
          continue;
        }

        // Track late match volatility
        if (matchState.minute > maxMinute) maxMinute = matchState.minute;
        const goalDiff = Math.abs(matchState.currentScore.home - matchState.currentScore.away);
        if (matchState.minute >= 80 && goalDiff <= 1) closeGameCount += 1;

        // Evaluate leg conditional probability
        const prob = this.evaluateLegProbability(leg, matchState);

        legEvaluations.push({
          legId: leg.id,
          fixtureId: leg.fixtureId,
          selectionId: leg.selectionId,
          selectionName: leg.selectionName,
          marketType: leg.marketType || '1X2',
          status: leg.status,
          modelEvaluated: true,
          conditionalProbability: prob,
          isSuspended: false,
        });

        jointProbability *= prob;
      } else if (options?.getLiveOddsCallback) {
        // Fallback: evaluate via live reciprocal odds
        const liveOdd = options.getLiveOddsCallback(leg.selectionId);
        if (!liveOdd || liveOdd <= 1.0) {
          anySuspended = true;
          suspensionReason = `ODDS_UNAVAILABLE: Live odds unavailable for selection ${leg.selectionId}`;
          legEvaluations.push({
            legId: leg.id,
            fixtureId: leg.fixtureId,
            selectionId: leg.selectionId,
            selectionName: leg.selectionName,
            marketType: leg.marketType || '1X2',
            status: leg.status,
            modelEvaluated: false,
            conditionalProbability: 0.0,
            isSuspended: true,
            suspensionReason: 'ODDS_UNAVAILABLE',
          });
          continue;
        }

        const impliedProb = Math.min(1.0, 1.0 / liveOdd);
        legEvaluations.push({
          legId: leg.id,
          fixtureId: leg.fixtureId,
          selectionId: leg.selectionId,
          selectionName: leg.selectionName,
          marketType: leg.marketType || '1X2',
          status: leg.status,
          modelEvaluated: false,
          conditionalProbability: parseFloat(impliedProb.toFixed(4)),
          isSuspended: false,
        });

        jointProbability *= impliedProb;
      } else {
        // No match state and no odds callback
        anySuspended = true;
        suspensionReason = `DATA_UNAVAILABLE: No live state or odds callback for fixture ${leg.fixtureId}`;
        legEvaluations.push({
          legId: leg.id,
          fixtureId: leg.fixtureId,
          selectionId: leg.selectionId,
          selectionName: leg.selectionName,
          marketType: leg.marketType || '1X2',
          status: leg.status,
          modelEvaluated: false,
          conditionalProbability: 0.0,
          isSuspended: true,
          suspensionReason: 'DATA_UNAVAILABLE',
        });
      }
    }

    if (anySuspended) {
      slip.cashoutOffer = null;
      return {
        slipId,
        status: 'SUSPENDED',
        currencyCode: slip.currencyCode,
        originalStake: slip.stake,
        currentStake: slip.stake,
        potentialPayout: slip.potentialPayout,
        fairValue: 0.0,
        haircut: 0.0,
        cashoutOffer: null,
        jointProbability: 0.0,
        legs: legEvaluations,
        partialPresets: [],
        suspensionReason,
        calculatedAt: new Date().toISOString(),
      };
    }

    // Mathematical Fair Value: P(joint) * potentialPayout
    const fairValue = parseFloat((slip.potentialPayout * jointProbability).toFixed(2));

    // Dynamic haircut: base 8% (0.08) + volatility buffer if close game in late minutes
    let haircut = options?.customHaircut ?? 0.08;
    if (closeGameCount > 0) {
      haircut = Math.min(0.15, haircut + 0.02); // 2% additional buffer for high late volatility
    }

    const rawOffer = fairValue * (1.0 - haircut);
    const boundedOffer = Math.min(slip.potentialPayout, Math.max(0.01, rawOffer));
    const finalOffer = parseFloat(boundedOffer.toFixed(2));

    slip.cashoutOffer = finalOffer;

    // Generate partial cashout presets (25%, 50%, 75%)
    const partialPresets: PartialCashoutPreset[] = [0.25, 0.50, 0.75].map((pct) => ({
      percentage: pct,
      cashoutAmount: parseFloat((finalOffer * pct).toFixed(2)),
      remainingStake: parseFloat((slip.stake * (1.0 - pct)).toFixed(2)),
      remainingPotentialPayout: parseFloat((slip.potentialPayout * (1.0 - pct)).toFixed(2)),
    }));

    return {
      slipId,
      status: 'AVAILABLE',
      currencyCode: slip.currencyCode,
      originalStake: slip.stake,
      currentStake: slip.stake,
      potentialPayout: slip.potentialPayout,
      fairValue,
      haircut: parseFloat(haircut.toFixed(4)),
      cashoutOffer: finalOffer,
      jointProbability: parseFloat(jointProbability.toFixed(6)),
      legs: legEvaluations,
      partialPresets,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Evaluates conditional probability for a single leg from in-play match state.
   */
  private evaluateLegProbability(leg: BetLegRecord, state: InPlayMatchState): number {
    const marketType = (leg.marketType || leg.marketName || '1X2').toUpperCase();
    const selection = leg.selectionName.toUpperCase().trim();
    const curHome = state.currentScore.home;
    const curAway = state.currentScore.away;
    const curTotal = curHome + curAway;

    // 1. Check physical certainty / already determined conditions
    if (marketType.includes('TOTAL') || marketType.includes('OVER_UNDER')) {
      const line = this.extractLineFromLeg(leg) ?? 2.5;
      if (selection.includes('OVER') && curTotal > line) return 1.0; // Already over
      if (selection.includes('UNDER') && curTotal >= line) return 0.0; // Already lost
    }

    if (marketType.includes('BTTS') || marketType.includes('BOTH_TEAMS')) {
      if (curHome >= 1 && curAway >= 1) {
        return selection === 'YES' ? 1.0 : 0.0;
      }
    }

    if (state.status === 'FINISHED') {
      if (marketType.includes('1X2') || marketType.includes('MATCH_WINNER')) {
        if (curHome > curAway) return selection === 'HOME' || selection === '1' ? 1.0 : 0.0;
        if (curHome === curAway) return selection === 'DRAW' || selection === 'X' ? 1.0 : 0.0;
        if (curHome < curAway) return selection === 'AWAY' || selection === '2' ? 1.0 : 0.0;
      }
    }

    // 2. Evaluate joint distribution using BivariatePoissonModel
    const ctx: MatchContext = {
      fixtureId: state.fixtureId,
      homeTeam: state.homeTeam || 'Home',
      awayTeam: state.awayTeam || 'Away',
      currentScore: state.currentScore,
      minute: Math.min(90, Math.max(0, state.minute)),
      redCards: state.redCards || { home: 0, away: 0 },
      stateSequence: 1,
    };

    const modelRun = BivariatePoissonModel.evaluate(ctx);

    // 3. Extract conditional probability based on market type
    if (marketType.includes('1X2') || marketType.includes('MATCH_WINNER')) {
      if (selection === 'HOME' || selection === '1') {
        return modelRun.markets.matchWinner.selections.find((s) => s.name === 'Home')?.fairProbability ?? 0.0;
      }
      if (selection === 'DRAW' || selection === 'X') {
        return modelRun.markets.matchWinner.selections.find((s) => s.name === 'Draw')?.fairProbability ?? 0.0;
      }
      if (selection === 'AWAY' || selection === '2') {
        return modelRun.markets.matchWinner.selections.find((s) => s.name === 'Away')?.fairProbability ?? 0.0;
      }
    }

    if (marketType.includes('TOTAL') || marketType.includes('OVER_UNDER')) {
      const line = this.extractLineFromLeg(leg) ?? 2.5;
      if (Math.abs(line - 2.5) < 0.01) {
        const selName = selection.includes('OVER') ? 'Over 2.5' : 'Under 2.5';
        return modelRun.markets.totalGoals25.selections.find((s) => s.name === selName)?.fairProbability ?? 0.0;
      }
      if (Math.abs(line - 1.5) < 0.01) {
        const selName = selection.includes('OVER') ? 'Over 1.5' : 'Under 1.5';
        return modelRun.markets.totalGoals15.selections.find((s) => s.name === selName)?.fairProbability ?? 0.0;
      }
      if (Math.abs(line - 3.5) < 0.01) {
        const selName = selection.includes('OVER') ? 'Over 3.5' : 'Under 3.5';
        return modelRun.markets.totalGoals35.selections.find((s) => s.name === selName)?.fairProbability ?? 0.0;
      }
      // Arbitrary line: sum from jointScoreGrid
      const isOver = selection.includes('OVER');
      let pSum = 0;
      for (const cell of modelRun.jointScoreGrid) {
        const t = cell.homeGoals + cell.awayGoals;
        if (isOver ? t > line : t < line) pSum += cell.probability;
      }
      return parseFloat(pSum.toFixed(6));
    }

    if (marketType.includes('BTTS') || marketType.includes('BOTH_TEAMS')) {
      const selName = selection === 'YES' ? 'Yes' : 'No';
      return modelRun.markets.bothTeamsToScore.selections.find((s) => s.name === selName)?.fairProbability ?? 0.0;
    }

    if (marketType.includes('CORRECT_SCORE')) {
      const match = selection.match(/(\d+)\s*[-:]\s*(\d+)/);
      if (match) {
        const targetHome = parseInt(match[1], 10);
        const targetAway = parseInt(match[2], 10);
        const cell = modelRun.jointScoreGrid.find(
          (c) => c.homeGoals === targetHome && c.awayGoals === targetAway
        );
        return cell ? parseFloat(cell.probability.toFixed(6)) : 0.0;
      }
    }

    // Default fallback: 0.50 if unrecognized
    return 0.50;
  }

  private extractLineFromLeg(leg: BetLegRecord): number | undefined {
    const raw = `${leg.selectionName} ${leg.marketName}`;
    const m = raw.match(/(\d+\.\d+|\d+)/);
    return m ? parseFloat(m[1]) : undefined;
  }

  private buildUnavailableQuote(slipId: string, reason: string): CashoutQuote {
    return {
      slipId,
      status: 'UNAVAILABLE',
      currencyCode: 'PTS',
      originalStake: 0,
      currentStake: 0,
      potentialPayout: 0,
      fairValue: 0,
      haircut: 0,
      cashoutOffer: null,
      jointProbability: 0,
      legs: [],
      partialPresets: [],
      suspensionReason: reason,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Executes atomic Full or Partial Cashout.
   * Preserves full double-entry ledger balance conservation and unwinds risk liabilities.
   */
  public executeCashout(params: ExecuteCashoutParams): CashoutExecutionResult {
    const slip = this.betService.getTicket(params.slipId);
    if (!slip) {
      throw new Error(`Bet slip ${params.slipId} not found`);
    }

    if (slip.status !== BetSlipStatus.ACCEPTED) {
      throw new Error(`Bet slip cannot be cashed out in status: ${slip.status}`);
    }

    const pct = Math.min(1.0, Math.max(0.01, params.cashoutPercentage ?? 1.0));
    const isPartial = pct < 0.999;

    // 1. Resolve active cashout offer
    let fullOffer: number | null = null;
    if (params.matchStates || params.getLiveOddsCallback || !slip.cashoutOffer) {
      const quote = this.calculateCashoutQuote(params.slipId, {
        matchStates: params.matchStates,
        getLiveOddsCallback: params.getLiveOddsCallback,
      });

      if (quote.status === 'SUSPENDED') {
        throw new Error(`CASHOUT_SUSPENDED: ${quote.suspensionReason || 'Market currently suspended'}`);
      }

      if (quote.status === 'UNAVAILABLE' || quote.cashoutOffer === null || quote.cashoutOffer <= 0) {
        throw new Error('CASHOUT_UNAVAILABLE: Cashout is currently unavailable for this ticket.');
      }
      fullOffer = quote.cashoutOffer;
    } else {
      fullOffer = slip.cashoutOffer;
    }

    if (!fullOffer || fullOffer <= 0) {
      throw new Error('CASHOUT_UNAVAILABLE: Cashout is currently unavailable for this ticket.');
    }
    const cashoutAmount = isPartial
      ? parseFloat((fullOffer * pct).toFixed(2))
      : fullOffer;

    // 2. Slippage protection check
    if (params.expectedAmount !== undefined) {
      const maxSlip = params.maxSlippage ?? 0.50;
      if (Math.abs(cashoutAmount - params.expectedAmount) > maxSlip) {
        throw new Error(
          `CASHOUT_VALUE_CHANGED: Offer changed from ${params.expectedAmount} to ${cashoutAmount}`
        );
      }
    }

    // 3. Atomic execution across ledger, risk, and repository
    const ledgerSnap = this.ledger.snapshotPlacementState();
    const riskSnap = this.risk.snapshotPlacementState();
    const memSnap = this.memRepo ? this.memRepo.snapshot() : null;

    try {
      if (!isPartial) {
        // --- Full Cashout ---
        slip.status = BetSlipStatus.CASHED_OUT;
        slip.actualPayout = cashoutAmount;
        slip.cashoutOffer = null;
        slip.settledAt = new Date();

        // Ledger settlement for full stake
        this.ledger.settleCashout(slip.userId, slip.id, slip.stake, cashoutAmount, slip.currencyCode);

        // Risk & Scenario unwinding
        for (const leg of slip.legs) {
          this.risk.releaseLiability(leg.selectionId, slip.potentialPayout - slip.stake);
          this.risk.updatePosition(leg.fixtureId, slip.id, 'CASHED_OUT', 0, 0);
        }

        if (this.memRepo) {
          this.memRepo.saveSync(slip);
        }

        console.log(
          `[QuantitativeCashout] Ticket ${slip.slipNumber} FULL CASH-OUT executed for ${cashoutAmount.toFixed(2)} ${slip.currencyCode} (Stake: ${slip.stake.toFixed(2)})`
        );

        const newBalance = this.ledger.getBalance(slip.userId, slip.currencyCode);
        return {
          slip,
          cashoutAmount,
          cashoutPercentage: 1.0,
          isPartial: false,
          remainingStake: 0.0,
          remainingPotentialPayout: 0.0,
          newBalance,
        };
      } else {
        // --- Partial Cashout ---
        const cashedStake = parseFloat((slip.stake * pct).toFixed(2));
        const remainingStake = parseFloat((slip.stake - cashedStake).toFixed(2));
        const remainingPayout = parseFloat((slip.potentialPayout * (1.0 - pct)).toFixed(2));

        // Ledger settlement for the cashed-out portion of the stake
        this.ledger.settleCashout(slip.userId, slip.id, cashedStake, cashoutAmount, slip.currencyCode);

        // Update slip retaining ACCEPTED status for remaining in-play action
        slip.stake = remainingStake;
        slip.potentialPayout = remainingPayout;
        slip.actualPayout = parseFloat(((slip.actualPayout || 0) + cashoutAmount).toFixed(2));
        slip.cashoutOffer = parseFloat(((fullOffer - cashoutAmount) * 0.98).toFixed(2));

        // Proportional liability release & scenario exposure reduction
        for (const leg of slip.legs) {
          const releasedLiability = (slip.potentialPayout - slip.stake) * pct;
          this.risk.releaseLiability(leg.selectionId, releasedLiability);
          this.risk.updatePosition(leg.fixtureId, slip.id, 'ACCEPTED', remainingStake, remainingPayout);
        }

        if (this.memRepo) {
          this.memRepo.saveSync(slip);
        }

        console.log(
          `[QuantitativeCashout] Ticket ${slip.slipNumber} PARTIAL CASH-OUT (${(pct * 100).toFixed(0)}%) executed for ${cashoutAmount.toFixed(2)} ${slip.currencyCode} | Remaining Stake: ${remainingStake.toFixed(2)} PTS | Remaining Payout: ${remainingPayout.toFixed(2)} PTS`
        );

        const newBalance = this.ledger.getBalance(slip.userId, slip.currencyCode);
        return {
          slip,
          cashoutAmount,
          cashoutPercentage: pct,
          isPartial: true,
          remainingStake,
          remainingPotentialPayout: remainingPayout,
          newBalance,
        };
      }
    } catch (err) {
      // Rollback on any failure
      this.ledger.restorePlacementState(ledgerSnap);
      this.risk.restorePlacementState(riskSnap);
      if (memSnap && this.memRepo) {
        this.memRepo.restore(memSnap);
      }
      throw err;
    }
  }
}
