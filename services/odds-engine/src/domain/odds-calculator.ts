/**
 * Odds Calculation & Margin Engine
 * Applies House Overround (Margin) and calculates odds for 1X2, Over/Under, and Next Goal markets.
 */

export interface MarketProbability {
  name: string;
  fairProbability: number; // 0.00 to 1.00
}

export class OddsCalculator {
  /**
   * Applies bookmaker overround margin to fair probabilities and computes decimal odds.
   * e.g., if fair probabilities are [0.50, 0.30, 0.20] and margin is 1.06:
   * raw odds = 1 / (fairProb * margin)
   */
  public static calculateDecimalOdds(
    selections: MarketProbability[],
    targetMargin: number = 1.06
  ): Array<{ name: string; odds: number; probability: number }> {
    // Normalize probabilities to sum to 1.0
    const totalFairProb = selections.reduce((sum, s) => sum + s.fairProbability, 0);
    const normalized = selections.map((s) => ({
      name: s.name,
      fairProb: s.fairProbability / totalFairProb,
    }));

    return normalized.map((s) => {
      // Applied probability with margin
      const marginProb = s.fairProb * targetMargin;
      const decimalOdds = Math.max(1.01, parseFloat((1 / marginProb).toFixed(4)));
      return {
        name: s.name,
        odds: decimalOdds,
        probability: parseFloat(s.fairProb.toFixed(4)),
      };
    });
  }

  /**
   * Adjusts Match Winner (1X2) probabilities based on elapsed match minute and current score
   */
  public static calculate1X2LiveProbabilities(
    homeScore: number,
    awayScore: number,
    minute: number,
    baseHomeAdvantage: number = 0.15
  ): MarketProbability[] {
    const timeRemaining = Math.max(0, 90 - minute) / 90.0;
    const scoreDiff = homeScore - awayScore;

    let pHome = 0.38 + baseHomeAdvantage;
    let pDraw = 0.28;
    let pAway = 0.34 - baseHomeAdvantage;

    if (scoreDiff > 0) {
      // Home leading
      const leadMultiplier = Math.min(3, scoreDiff);
      pHome += 0.25 * leadMultiplier + (1 - timeRemaining) * 0.35 * leadMultiplier;
      pDraw -= 0.12 * leadMultiplier;
      pAway -= 0.13 * leadMultiplier;
    } else if (scoreDiff < 0) {
      // Away leading
      const leadMultiplier = Math.min(3, Math.abs(scoreDiff));
      pAway += 0.25 * leadMultiplier + (1 - timeRemaining) * 0.35 * leadMultiplier;
      pDraw -= 0.12 * leadMultiplier;
      pHome -= 0.13 * leadMultiplier;
    } else {
      // Draw state - as time decays, probability of draw increases
      pDraw += (1 - timeRemaining) * 0.40;
      pHome -= (1 - timeRemaining) * 0.20;
      pAway -= (1 - timeRemaining) * 0.20;
    }

    // Clamp values to ensure validity
    pHome = Math.max(0.01, pHome);
    pDraw = Math.max(0.01, pDraw);
    pAway = Math.max(0.01, pAway);

    const total = pHome + pDraw + pAway;
    return [
      { name: 'Home', fairProbability: pHome / total },
      { name: 'Draw', fairProbability: pDraw / total },
      { name: 'Away', fairProbability: pAway / total },
    ];
  }

  /**
   * Adjusts Total Goals (Over / Under 2.5) probabilities
   */
  public static calculateOverUnderLiveProbabilities(
    currentTotalGoals: number,
    line: number,
    minute: number
  ): MarketProbability[] {
    if (currentTotalGoals > line) {
      // Already over line
      return [
        { name: 'Over', fairProbability: 0.999 },
        { name: 'Under', fairProbability: 0.001 },
      ];
    }

    const timeRemaining = Math.max(0, 90 - minute) / 90.0;
    const goalsNeeded = line - currentTotalGoals;

    // Poisson-approximation decay
    let pOver = (goalsNeeded <= 1 ? 0.55 : 0.25) * timeRemaining;
    pOver = Math.max(0.01, Math.min(0.99, pOver));
    const pUnder = 1.0 - pOver;

    return [
      { name: 'Over', fairProbability: pOver },
      { name: 'Under', fairProbability: pUnder },
    ];
  }
}
