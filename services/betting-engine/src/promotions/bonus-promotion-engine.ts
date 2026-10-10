import { LedgerService } from '../wallet/ledger-service.ts';
import { DistributedLockService } from '../distributed/distributed-lock-service.ts';

export interface AccaBoostTier {
  legs: number;
  boostPercentage: number;
}

export const ACCA_BOOST_TIERS: AccaBoostTier[] = [
  { legs: 3, boostPercentage: 0.05 },  // +5%
  { legs: 4, boostPercentage: 0.10 },  // +10%
  { legs: 5, boostPercentage: 0.12 },  // +12%
  { legs: 6, boostPercentage: 0.15 },  // +15%
  { legs: 7, boostPercentage: 0.20 },  // +20%
  { legs: 8, boostPercentage: 0.25 },  // +25%
  { legs: 9, boostPercentage: 0.30 },  // +30%
  { legs: 10, boostPercentage: 0.35 }, // +35%
  { legs: 11, boostPercentage: 0.40 }, // +40%
  { legs: 12, boostPercentage: 0.50 }, // +50%
  { legs: 13, boostPercentage: 0.60 }, // +60%
  { legs: 14, boostPercentage: 0.70 }, // +70%
];

export class BonusPromotionEngine {
  private static instance: BonusPromotionEngine | null = null;
  private ledger: LedgerService;
  private lockService: DistributedLockService;

  // Track tickets settled early by 2 Goals Ahead promo to prevent double settlement
  private earlyPaidTickets = new Set<string>();

  constructor() {
    this.ledger = LedgerService.getInstance();
    this.lockService = DistributedLockService.getInstance();
  }

  public static getInstance(): BonusPromotionEngine {
    if (!this.instance) {
      this.instance = new BonusPromotionEngine();
    }
    return this.instance;
  }

  /**
   * Evaluates Acca Boost bonus tier based on number of eligible legs.
   */
  public calculateAccaBoost(legsCount: number, odds: number[] = []): { eligible: boolean; boostPercentage: number } {
    // Only accumulators with 3+ legs are eligible; each leg minimum odds 1.20
    const qualifiedOdds = odds.length === 0 || odds.every((o) => o >= 1.20);
    if (legsCount < 3 || !qualifiedOdds) {
      return { eligible: false, boostPercentage: 0 };
    }

    const tier = [...ACCA_BOOST_TIERS].reverse().find((t) => legsCount >= t.legs);
    const boostPercentage = tier ? tier.boostPercentage : 0.70;

    return { eligible: true, boostPercentage };
  }

  /**
   * Applies Acca Boost bonus on winning accumulator ticket.
   * Bonus is paid as extra cash winnings into player account via double-entry ledger.
   */
  public async applyAccaBoostPayout(params: {
    userId: string;
    slipId: string;
    stake: number;
    totalOdds: number;
    legsCount: number;
    currencyCode?: string;
  }): Promise<{ bonusAmount: number; totalPayout: number }> {
    const { userId, slipId, stake, totalOdds, legsCount } = params;
    const currency = params.currencyCode || 'USD';

    const boost = this.calculateAccaBoost(legsCount);
    const standardReturn = stake * totalOdds;
    const netProfit = standardReturn - stake;

    if (!boost.eligible || netProfit <= 0) {
      return { bonusAmount: 0, totalPayout: parseFloat(standardReturn.toFixed(2)) };
    }

    const bonusAmount = parseFloat((netProfit * boost.boostPercentage).toFixed(2));
    const totalPayout = parseFloat((standardReturn + bonusAmount).toFixed(2));

    return this.lockService.lockUser(userId, async () => {
      // Credit bonus via double-entry ledger voucher
      this.ledger.deposit(userId, bonusAmount, currency, `acca-boost-${slipId}`);
      return { bonusAmount, totalPayout };
    });
  }

  /**
   * 2 Goals Ahead Early Payout Promotion:
   * If backed team goes 2 goals ahead at any point, settle bet as WON early.
   */
  public async evaluateTwoGoalsAhead(params: {
    userId: string;
    slipId: string;
    matchScore: { home: number; away: number };
    backedTeam: 'HOME' | 'AWAY';
    stake: number;
    odds: number;
    currencyCode?: string;
  }): Promise<{ triggered: boolean; payout: number }> {
    const { userId, slipId, matchScore, backedTeam, stake, odds } = params;
    const currency = params.currencyCode || 'USD';

    if (this.earlyPaidTickets.has(slipId)) {
      return { triggered: true, payout: parseFloat((stake * odds).toFixed(2)) };
    }

    const goalDiff = backedTeam === 'HOME'
      ? matchScore.home - matchScore.away
      : matchScore.away - matchScore.home;

    if (goalDiff >= 2) {
      const payout = parseFloat((stake * odds).toFixed(2));
      return this.lockService.lockUser(userId, async () => {
        if (this.earlyPaidTickets.has(slipId)) {
          return { triggered: true, payout };
        }

        // Settle winning bet early
        this.ledger.settleWinningBet(userId, slipId, stake, payout, currency);
        this.earlyPaidTickets.add(slipId);

        return { triggered: true, payout };
      });
    }

    return { triggered: false, payout: 0 };
  }

  /**
   * Bore Draw (0-0) Refund Promotion:
   * If pre-match bet on Correct Score finishes 0-0, refund 100% of stake.
   */
  public async evaluateBoreDrawRefund(params: {
    userId: string;
    slipId: string;
    matchFinalScore: { home: number; away: number };
    marketType: string;
    stake: number;
    currencyCode?: string;
  }): Promise<{ refunded: boolean; refundAmount: number }> {
    const { userId, slipId, matchFinalScore, marketType, stake } = params;
    const currency = params.currencyCode || 'USD';

    // Must be 0-0 and an eligible market (e.g. CORRECT_SCORE or HALF_TIME_FULL_TIME)
    const is00 = matchFinalScore.home === 0 && matchFinalScore.away === 0;
    const isEligibleMarket = /CORRECT_SCORE|HALF_TIME_FULL_TIME/i.test(marketType);

    if (is00 && isEligibleMarket) {
      return this.lockService.lockUser(userId, async () => {
        // Void bet and return stake back to player available balance
        this.ledger.settleVoidBet(userId, slipId, stake, currency);
        return { refunded: true, refundAmount: stake };
      });
    }

    return { refunded: false, refundAmount: 0 };
  }

  public isEarlyPaid(slipId: string): boolean {
    return this.earlyPaidTickets.has(slipId);
  }
}
