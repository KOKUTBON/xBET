import { LedgerService } from '../wallet/ledger-service.ts';
import { RiskManager } from '../risk/risk-manager.ts';
import { BetPlacementService, BetSlipStatus, LegStatus } from './bet-placement.ts';
import type { BetSlipRecord } from './bet-placement.ts';
import { QuantitativeCashoutEngine } from '../cashout/quantitative-cashout-engine.ts';
import type {
  InPlayMatchState,
  CashoutQuote,
  ExecuteCashoutParams,
  CashoutExecutionResult,
} from '../cashout/quantitative-cashout-engine.ts';

export class CashoutService {
  private static instance: CashoutService;
  private ledger: LedgerService;
  private risk: RiskManager;
  private betService: BetPlacementService;
  private quantEngine: QuantitativeCashoutEngine;

  private constructor() {
    this.ledger = LedgerService.getInstance();
    this.risk = RiskManager.getInstance();
    this.betService = BetPlacementService.getInstance();
    this.quantEngine = QuantitativeCashoutEngine.getInstance();
  }

  public static getInstance(): CashoutService {
    if (!CashoutService.instance) {
      CashoutService.instance = new CashoutService();
    }
    return CashoutService.instance;
  }

  public static resetInstance(): void {
    CashoutService.instance = undefined as any;
  }

  public getQuantitativeEngine(): QuantitativeCashoutEngine {
    return this.quantEngine;
  }

  /**
   * Calculates dynamic real-time cashout value based on current live selection odds
   */
  public calculateCashoutOffer(slipId: string, getLiveOddsCallback: (selId: string) => number | null): number | null {
    const quote = this.quantEngine.calculateCashoutQuote(slipId, { getLiveOddsCallback });
    return quote.cashoutOffer;
  }

  /**
   * Obtains a detailed quantitative cashout quote with fair value and partial options
   */
  public getCashoutQuote(
    slipId: string,
    options?: {
      matchStates?: Map<string, InPlayMatchState>;
      getLiveOddsCallback?: (selId: string) => number | null;
      customHaircut?: number;
    }
  ): CashoutQuote {
    return this.quantEngine.calculateCashoutQuote(slipId, options);
  }

  /**
   * Executes Cashout immediately (full or partial)
   */
  public executeCashout(
    slipId: string,
    expectedAmount?: number,
    cashoutPercentage: number = 1.0,
    options?: {
      matchStates?: Map<string, InPlayMatchState>;
      getLiveOddsCallback?: (selId: string) => number | null;
      maxSlippage?: number;
    }
  ): BetSlipRecord {
    const result = this.quantEngine.executeCashout({
      slipId,
      cashoutPercentage,
      expectedAmount,
      maxSlippage: options?.maxSlippage,
      matchStates: options?.matchStates,
      getLiveOddsCallback: options?.getLiveOddsCallback,
    });
    return result.slip;
  }

  /**
   * Executes partial cashout specifically
   */
  public executePartialCashout(params: ExecuteCashoutParams): CashoutExecutionResult {
    return this.quantEngine.executeCashout(params);
  }
}
