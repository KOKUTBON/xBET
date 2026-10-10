export interface BonusCodeConfig {
  code: string;
  matchPercentage: number; // e.g. 100 for 100% match
  maxBonusAmount: number;  // e.g. $200.00
  rolloverMultiplier: number; // e.g. 5x (must wager 5 * bonusAmount)
  minOdds: number; // e.g. 1.50
  expiryDays: number;
}

export class BonusCodeRegistry {
  private static codes: Map<string, BonusCodeConfig> = new Map([
    [
      'WELCOME100',
      {
        code: 'WELCOME100',
        matchPercentage: 100,
        maxBonusAmount: 200.0,
        rolloverMultiplier: 5,
        minOdds: 1.50,
        expiryDays: 30,
      },
    ],
    [
      'CASINO50',
      {
        code: 'CASINO50',
        matchPercentage: 50,
        maxBonusAmount: 100.0,
        rolloverMultiplier: 10,
        minOdds: 1.0,
        expiryDays: 14,
      },
    ],
    [
      'VIPBOOST',
      {
        code: 'VIPBOOST',
        matchPercentage: 150,
        maxBonusAmount: 500.0,
        rolloverMultiplier: 6,
        minOdds: 1.70,
        expiryDays: 30,
      },
    ],
  ]);

  public static getBonusCode(code: string): BonusCodeConfig | undefined {
    return this.codes.get(code.trim().toUpperCase());
  }

  public static calculateBonus(code: string, depositAmount: number): { bonusAmount: number; config: BonusCodeConfig } | null {
    const config = this.getBonusCode(code);
    if (!config) return null;

    const rawBonus = (depositAmount * config.matchPercentage) / 100.0;
    const bonusAmount = parseFloat(Math.min(rawBonus, config.maxBonusAmount).toFixed(2));

    return { bonusAmount, config };
  }
}
