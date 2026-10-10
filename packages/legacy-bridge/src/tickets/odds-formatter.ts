export type OddsFormat = 'DECIMAL' | 'FRACTIONAL' | 'AMERICAN';

export class OddsFormatter {
  /**
   * Converts decimal odds to Fractional string (e.g. 2.50 -> "3/2", 1.50 -> "1/2")
   */
  public static toFractional(decimalOdds: number): string {
    if (decimalOdds <= 1.0) return '0/1';

    const profit = decimalOdds - 1.0;
    const tolerance = 0.01;

    // Common bookmaker fractions check
    const commonFractions: Array<[number, string]> = [
      [0.1, '1/10'], [0.2, '1/5'], [0.25, '1/4'], [0.333, '1/3'],
      [0.4, '2/5'], [0.5, '1/2'], [0.6, '3/5'], [0.666, '2/3'],
      [0.75, '3/4'], [0.8, '4/5'], [1.0, '1/1'], [1.2, '6/5'],
      [1.25, '5/4'], [1.5, '3/2'], [1.75, '7/4'], [2.0, '2/1'],
      [2.5, '5/2'], [3.0, '3/1'], [3.5, '7/2'], [4.0, '4/1'],
      [4.5, '9/2'], [5.0, '5/1'], [6.0, '6/1'], [7.0, '7/1'],
      [8.0, '8/1'], [9.0, '9/1'], [10.0, '10/1'],
    ];

    for (const [val, str] of commonFractions) {
      if (Math.abs(profit - val) < tolerance) {
        return str;
      }
    }

    // Fallback GCD fraction approximation
    const num = Math.round(profit * 100);
    const den = 100;
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const commonDiv = gcd(num, den);

    return `${num / commonDiv}/${den / commonDiv}`;
  }

  /**
   * Converts decimal odds to American Moneyline string (e.g. 2.50 -> "+150", 1.50 -> "-200")
   */
  public static toAmerican(decimalOdds: number): string {
    if (decimalOdds >= 2.0) {
      const american = Math.round((decimalOdds - 1.0) * 100);
      return `+${american}`;
    } else if (decimalOdds > 1.0) {
      const american = Math.round(-100 / (decimalOdds - 1.0));
      return `${american}`;
    }
    return '+100';
  }

  /**
   * Formats decimal odds according to target user preference
   */
  public static format(decimalOdds: number, format: OddsFormat = 'DECIMAL'): string {
    switch (format) {
      case 'FRACTIONAL':
        return this.toFractional(decimalOdds);
      case 'AMERICAN':
        return this.toAmerican(decimalOdds);
      case 'DECIMAL':
      default:
        return decimalOdds.toFixed(2);
    }
  }
}
