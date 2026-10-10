/**
 * Combi Bonus Boost & Accumulator Payout Calculator
 * Ported from CakePHP Ticket.php getWinning() and ticketsSettings Combi Boost rules.
 */

export interface CombiBoostResult {
  stake: number;
  totalOdds: number;
  grossReturn: number;
  bonusPercent: number;
  bonusAmount: number;
  isCapped: boolean;
  maxWinningCap: number;
  finalPayout: number;
}

export class CombiBonusCalculator {
  /**
   * Calculates progressive accumulator bonus and applies platform payout ceilings
   */
  public static calculate(
    stake: number,
    totalOdds: number,
    legCount: number,
    bonusPercent: number = 0.0,
    maxWinningCap: number = 100000.0
  ): CombiBoostResult {
    const grossReturn = parseFloat((stake * totalOdds).toFixed(2));
    const profit = Math.max(0, grossReturn - stake);

    let bonusAmount = 0.0;
    if (bonusPercent > 0 && legCount >= 4) {
      bonusAmount = parseFloat(((profit * bonusPercent) / 100.0).toFixed(2));
    }

    const totalBeforeCap = parseFloat((grossReturn + bonusAmount).toFixed(2));
    const isCapped = totalBeforeCap > maxWinningCap;
    const finalPayout = isCapped ? maxWinningCap : totalBeforeCap;

    return {
      stake,
      totalOdds,
      grossReturn,
      bonusPercent,
      bonusAmount,
      isCapped,
      maxWinningCap,
      finalPayout,
    };
  }
}
