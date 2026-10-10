export const BetSlipType = {
  SINGLE: 'SINGLE',
  COMBI: 'COMBI',
  SYSTEM: 'SYSTEM',
  BET_BUILDER: 'BET_BUILDER',
} as const;
export type BetSlipType = (typeof BetSlipType)[keyof typeof BetSlipType];

export const OddsTolerance = {
  REJECT_ON_CHANGE: 'REJECT_ON_CHANGE',
  ACCEPT_HIGHER_ODDS: 'ACCEPT_HIGHER_ODDS',
  ACCEPT_ANY_ODDS: 'ACCEPT_ANY_ODDS',
} as const;
export type OddsTolerance = (typeof OddsTolerance)[keyof typeof OddsTolerance];

export interface LegRequest {
  fixtureId: string;
  fixtureName: string;
  marketId: string;
  marketName: string;
  marketType?: string;
  selectionId: string;
  selectionName: string;
  submittedOdds: number;
}

export interface PlaceBetRequest {
  userId: string;
  betType: BetSlipType;
  currencyCode?: string;
  stake: number;
  oddsTolerance?: OddsTolerance;
  systemK?: number; // e.g., 2 for a "2 of 3" system bet
  legs: LegRequest[];
}

export class BetValidator {
  /**
   * Validates slippage between submitted odds and live bookmaker odds
   */
  public static validateOddsSlippage(
    submittedOdds: number,
    liveOdds: number,
    tolerance: OddsTolerance = OddsTolerance.ACCEPT_HIGHER_ODDS
  ): number {
    if (tolerance === OddsTolerance.ACCEPT_ANY_ODDS) {
      return liveOdds;
    }

    if (tolerance === OddsTolerance.ACCEPT_HIGHER_ODDS) {
      if (liveOdds < submittedOdds) {
        throw new Error(`ODDS_DROPPED: Odds changed from ${submittedOdds} to ${liveOdds}. Please re-confirm.`);
      }
      return liveOdds;
    }

    // REJECT_ON_CHANGE
    if (Math.abs(liveOdds - submittedOdds) > 0.0001) {
      throw new Error(`ODDS_CHANGED: Odds changed from ${submittedOdds} to ${liveOdds}`);
    }

    return liveOdds;
  }

  /**
   * Computes total odds for Combi / Parlay bet
   */
  public static calculateCombiOdds(legOdds: number[]): number {
    const rawTotal = legOdds.reduce((acc, odd) => acc * odd, 1.0);
    return parseFloat(rawTotal.toFixed(4));
  }

  /**
   * Generates combinations for System bets (n choose k)
   */
  public static generateCombinations<T>(items: T[], k: number): T[][] {
    if (k === 0) return [[]];
    if (items.length === 0) return [];

    const head = items[0];
    const tail = items.slice(1);

    const withHead = BetValidator.generateCombinations(tail, k - 1).map((combo) => [head, ...combo]);
    const withoutHead = BetValidator.generateCombinations(tail, k);

    return [...withHead, ...withoutHead];
  }
}
