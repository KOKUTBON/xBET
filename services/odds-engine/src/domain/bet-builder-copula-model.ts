import { BivariatePoissonModel, type MatchContext, type ScoreProbability } from './bivariate-poisson-model.ts';

export type MarketType =
  | 'MATCH_WINNER'
  | 'TOTAL_GOALS'
  | 'BOTH_TEAMS_TO_SCORE'
  | 'DOUBLE_CHANCE'
  | 'CORRECT_SCORE'
  | 'PLAYER_ANYTIME_SCORER'
  | 'TOTAL_CORNERS'
  | 'TOTAL_CARDS';

export interface BuilderSelection {
  id: string;
  marketType: MarketType;
  selectionName: string; // e.g. "HOME", "OVER", "UNDER", "YES", "NO", "Bukayo Saka"
  line?: number;         // e.g. 2.5 for Over/Under
  individualOdds?: number; // Submitted or current single odds
  playerTeam?: 'HOME' | 'AWAY'; // For player props
}

export interface CopulaPriceResult {
  isCompatible: boolean;
  rejectionReason?: string;
  selections: BuilderSelection[];
  independentJointProbability: number;
  independentOdds: number;
  correlatedJointProbability: number;
  correlatedFairOdds: number;
  effectiveCorrelation: number; // Aggregate correlation rho in [-1, 1]
  targetMargin: number;
  finalBuilderOdds: number;
  copulaUsed: 'SCORE_GRID_EXACT' | 'GAUSSIAN_COPULA' | 'HYBRID_COPULA';
}

/**
 * Standard Normal Distribution and Copula Mathematics.
 */
export class CopulaMath {
  /**
   * Standard Normal Cumulative Distribution Function Phi(x)
   * Using Abramowitz and Stegun approximation (accuracy ~ 7.5e-8).
   */
  public static normalCdf(x: number): number {
    if (x < -8.0) return 0.0;
    if (x > 8.0) return 1.0;

    const b1 = 0.319381530;
    const b2 = -0.356563782;
    const b3 = 1.781477937;
    const b4 = -1.821255978;
    const b5 = 1.330274429;
    const p = 0.2316419;
    const c2 = 0.3989422804014327; // 1 / sqrt(2 * pi)

    const z = Math.abs(x);
    const t = 1.0 / (1.0 + p * z);
    const pdf = c2 * Math.exp(-0.5 * x * x);
    const poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
    const cdf = 1.0 - pdf * poly;

    return x >= 0 ? cdf : 1.0 - cdf;
  }

  /**
   * Inverse Standard Normal CDF (Probit function) Phi^{-1}(p)
   * Using Acklam's algorithm (relative error < 1.15e-9).
   */
  public static normalInverse(p: number): number {
    if (p <= 0.0) return -8.0;
    if (p >= 1.0) return 8.0;

    // Coefficients in rational approximations
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];

    const pLow = 0.02425;
    const pHigh = 1.0 - pLow;

    if (p < pLow) {
      // Rational approximation for lower region
      const q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
             ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0);
    }

    if (p <= pHigh) {
      // Rational approximation for central region
      const q = p - 0.5;
      const r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
             (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1.0);
    }

    // Rational approximation for upper region
    const q = Math.sqrt(-2 * Math.log(1.0 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1.0);
  }

  /**
   * Bivariate Normal CDF Phi_2(z1, z2, rho)
   * Using Drezner & Wesolowsky method with Gauss-Legendre quadrature.
   */
  public static bivariateNormalCdf(z1: number, z2: number, rho: number): number {
    if (Math.abs(rho) < 1e-6) {
      return this.normalCdf(z1) * this.normalCdf(z2);
    }
    if (rho >= 0.99999) {
      return this.normalCdf(Math.min(z1, z2));
    }
    if (rho <= -0.99999) {
      return Math.max(0.0, this.normalCdf(z1) + this.normalCdf(z2) - 1.0);
    }

    // Quadrature nodes and weights for numerical integration
    const xWeights: [number, number][] = [
      [0.0469100770, 0.1184634425],
      [0.2307653449, 0.2393143352],
      [0.5000000000, 0.2844444444],
      [0.7692346551, 0.2393143352],
      [0.9530899230, 0.1184634425],
    ];

    const asinRho = Math.asin(rho);
    let sum = 0.0;

    for (const [node, weight] of xWeights) {
      const theta = node * asinRho;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      const expTerm = Math.exp(-0.5 * (z1 * z1 + z2 * z2 - 2 * z1 * z2 * sinTheta) / (cosTheta * cosTheta));
      sum += weight * expTerm;
    }

    return this.normalCdf(z1) * this.normalCdf(z2) + (asinRho / (2.0 * Math.PI)) * sum;
  }

  /**
   * Gaussian Copula Joint Cumulative Probability C_rho(u1, u2)
   */
  public static gaussianCopula(u1: number, u2: number, rho: number): number {
    const p1 = Math.max(1e-6, Math.min(1.0 - 1e-6, u1));
    const p2 = Math.max(1e-6, Math.min(1.0 - 1e-6, u2));
    const z1 = this.normalInverse(p1);
    const z2 = this.normalInverse(p2);
    return this.bivariateNormalCdf(z1, z2, rho);
  }

  /**
   * Clayton Copula C_theta(u1, u2) for tail dependence
   */
  public static claytonCopula(u1: number, u2: number, theta: number): number {
    if (theta <= 0) return u1 * u2;
    const term = Math.pow(u1, -theta) + Math.pow(u2, -theta) - 1.0;
    return Math.max(0.0, Math.pow(Math.max(0.001, term), -1.0 / theta));
  }
}

/**
 * Pre-Calibrated Empirical Correlation Matrix between Football Betting Markets.
 */
export const CORRELATION_TABLE: Record<string, number> = {
  // 1X2 vs Totals
  'HOME:OVER': 0.32,
  'HOME:UNDER': -0.35,
  'AWAY:OVER': 0.28,
  'AWAY:UNDER': -0.30,
  'DRAW:OVER': -0.45,
  'DRAW:UNDER': 0.48,

  // 1X2 vs BTTS
  'HOME:BTTS_YES': 0.20,
  'HOME:BTTS_NO': -0.22,
  'AWAY:BTTS_YES': 0.18,
  'AWAY:BTTS_NO': -0.20,
  'DRAW:BTTS_YES': 0.35, // 1-1, 2-2 draws are common
  'DRAW:BTTS_NO': -0.15,

  // Totals vs BTTS
  'OVER:BTTS_YES': 0.65, // Very high positive correlation
  'OVER:BTTS_NO': -0.40,
  'UNDER:BTTS_YES': -0.65,
  'UNDER:BTTS_NO': 0.60,

  // Player Scorer vs 1X2 (Home Scorer vs Home Win)
  'SCORER_HOME:HOME': 0.38,
  'SCORER_HOME:AWAY': -0.32,
  'SCORER_AWAY:AWAY': 0.35,
  'SCORER_AWAY:HOME': -0.30,

  // Player Scorer vs Totals
  'SCORER_HOME:OVER': 0.36,
  'SCORER_HOME:UNDER': -0.42,
  'SCORER_AWAY:OVER': 0.34,
  'SCORER_AWAY:UNDER': -0.40,
};

/**
 * Correlated Bet Builder & Same-Game Parlay (SGP) Quantitative Pricing Engine.
 */
export class BetBuilderCopulaModel {
  /**
   * Evaluates compatibility and prices a multi-selection Same-Game Parlay.
   */
  public static priceSelections(
    matchCtx: MatchContext,
    selections: BuilderSelection[],
    baseTargetMargin: number = 1.08
  ): CopulaPriceResult {
    if (selections.length < 2) {
      return {
        isCompatible: false,
        rejectionReason: 'MINIMUM_2_SELECTIONS_REQUIRED',
        selections,
        independentJointProbability: 0,
        independentOdds: 0,
        correlatedJointProbability: 0,
        correlatedFairOdds: 0,
        effectiveCorrelation: 0,
        targetMargin: baseTargetMargin,
        finalBuilderOdds: 0,
        copulaUsed: 'SCORE_GRID_EXACT',
      };
    }

    // 1. Mutually Exclusive Conflict Detection
    const compatibility = this.checkCompatibility(selections);
    if (!compatibility.compatible) {
      return {
        isCompatible: false,
        rejectionReason: compatibility.reason,
        selections,
        independentJointProbability: 0,
        independentOdds: 0,
        correlatedJointProbability: 0,
        correlatedFairOdds: 0,
        effectiveCorrelation: 0,
        targetMargin: baseTargetMargin,
        finalBuilderOdds: 0,
        copulaUsed: 'SCORE_GRID_EXACT',
      };
    }

    // 2. Generate Base Match Probabilities from Bivariate Poisson Model
    const modelOutput = BivariatePoissonModel.evaluate(matchCtx, 1.00); // Fair probabilities
    const grid = modelOutput.jointScoreGrid;

    // Check if all selections are scoreline-derivable (1X2, Totals, BTTS, Double Chance)
    const isPureScoreGrid = selections.every((s) =>
      ['MATCH_WINNER', 'TOTAL_GOALS', 'BOTH_TEAMS_TO_SCORE', 'DOUBLE_CHANCE', 'CORRECT_SCORE'].includes(s.marketType)
    );

    let independentJointProb = 1.0;
    let correlatedJointProb = 0.0;
    let copulaType: CopulaPriceResult['copulaUsed'] = 'SCORE_GRID_EXACT';
    let effectiveRho = 0.0;

    if (isPureScoreGrid) {
      // Calculate exact joint probability directly over the Bivariate Poisson score grid
      copulaType = 'SCORE_GRID_EXACT';

      // 1. Calculate each selection's marginal probability
      for (const sel of selections) {
        const marginalProb = this.calculateMarginalFromGrid(grid, sel);
        independentJointProb *= marginalProb;
      }

      // 2. Exact joint probability: Sum of P(H=i, A=j) where ALL conditions hold
      for (const cell of grid) {
        let allSatisfied = true;
        for (const sel of selections) {
          if (!this.cellSatisfiesSelection(cell, sel)) {
            allSatisfied = false;
            break;
          }
        }
        if (allSatisfied) {
          correlatedJointProb += cell.probability;
        }
      }

      // Estimate effective correlation rho from the deviation
      if (independentJointProb > 0) {
        effectiveRho = parseFloat(((correlatedJointProb - independentJointProb) / Math.sqrt(independentJointProb * (1 - independentJointProb))).toFixed(4));
        effectiveRho = Math.max(-0.95, Math.min(0.95, effectiveRho));
      }
    } else {
      // Hybrid Copula: contains player props (Anytime Scorer) or cards/corners
      copulaType = 'HYBRID_COPULA';

      // Evaluate scoreline portion first
      const scorelineSelections = selections.filter((s) => s.marketType !== 'PLAYER_ANYTIME_SCORER');
      const propSelections = selections.filter((s) => s.marketType === 'PLAYER_ANYTIME_SCORER');

      let scorelineJoint = 1.0;
      if (scorelineSelections.length > 0) {
        scorelineJoint = 0.0;
        for (const cell of grid) {
          if (scorelineSelections.every((s) => this.cellSatisfiesSelection(cell, s))) {
            scorelineJoint += cell.probability;
          }
        }
      }

      let currentJoint = scorelineJoint;

      // Incrementally incorporate props via Gaussian Copula with correlation table lookup
      for (const prop of propSelections) {
        const propProb = prop.individualOdds ? 1.0 / prop.individualOdds : 0.35; // Default ~35% anytime scorer
        independentJointProb *= propProb;

        // Lookup correlation with the existing legs
        let avgRho = 0.0;
        for (const s of scorelineSelections) {
          const rhoKey = this.getCorrelationKey(prop, s);
          avgRho += CORRELATION_TABLE[rhoKey] ?? 0.15;
        }
        if (scorelineSelections.length > 0) {
          avgRho /= scorelineSelections.length;
        } else {
          avgRho = 0.10;
        }

        currentJoint = CopulaMath.gaussianCopula(currentJoint, propProb, avgRho);
        effectiveRho = avgRho;
      }

      correlatedJointProb = currentJoint;
    }

    // Safety bounds on joint probability
    correlatedJointProb = Math.max(0.0001, Math.min(0.95, correlatedJointProb));
    independentJointProb = Math.max(0.0001, Math.min(0.95, independentJointProb));

    const independentOdds = parseFloat((1.0 / independentJointProb).toFixed(2));
    const correlatedFairOdds = parseFloat((1.0 / correlatedJointProb).toFixed(2));

    // Dynamic builder margin: compounds slightly per leg (e.g. 8% base + 1.5% per extra leg)
    const dynamicMargin = baseTargetMargin + (selections.length - 2) * 0.015;
    const finalOdds = parseFloat(Math.max(1.05, correlatedFairOdds / dynamicMargin).toFixed(2));

    return {
      isCompatible: true,
      selections,
      independentJointProbability: parseFloat(independentJointProb.toFixed(4)),
      independentOdds,
      correlatedJointProbability: parseFloat(correlatedJointProb.toFixed(4)),
      correlatedFairOdds,
      effectiveCorrelation: effectiveRho,
      targetMargin: parseFloat(dynamicMargin.toFixed(3)),
      finalBuilderOdds: finalOdds,
      copulaUsed: copulaType,
    };
  }

  private static checkCompatibility(selections: BuilderSelection[]): { compatible: boolean; reason?: string } {
    // 1. Duplicate market types on mutually exclusive single outcomes
    const winnerPicks = selections.filter((s) => s.marketType === 'MATCH_WINNER');
    if (winnerPicks.length > 1) {
      return { compatible: false, reason: 'CONTRADICTING_MATCH_WINNER: Cannot pick multiple mutually exclusive 1X2 outcomes.' };
    }

    // 2. Direct Totals contradiction (Over and Under on same line)
    const totals = selections.filter((s) => s.marketType === 'TOTAL_GOALS');
    if (totals.length >= 2) {
      const over = totals.find((t) => t.selectionName.toUpperCase().includes('OVER'));
      const under = totals.find((t) => t.selectionName.toUpperCase().includes('UNDER'));
      if (over && under && over.line !== undefined && under.line !== undefined && over.line >= under.line) {
        return { compatible: false, reason: `MUTUALLY_EXCLUSIVE_TOTALS: Over ${over.line} and Under ${under.line} cannot both happen.` };
      }
    }

    // 3. BTTS Contradiction
    const btts = selections.filter((s) => s.marketType === 'BOTH_TEAMS_TO_SCORE');
    if (btts.length > 1) {
      return { compatible: false, reason: 'CONTRADICTING_BTTS: Cannot select both YES and NO for Both Teams to Score.' };
    }

    // 4. Over 2.5 + Under 1.5 etc
    return { compatible: true };
  }

  private static calculateMarginalFromGrid(grid: ScoreProbability[], sel: BuilderSelection): number {
    let sum = 0.0;
    for (const cell of grid) {
      if (this.cellSatisfiesSelection(cell, sel)) {
        sum += cell.probability;
      }
    }
    return Math.max(0.001, sum);
  }

  private static cellSatisfiesSelection(cell: ScoreProbability, sel: BuilderSelection): boolean {
    const h = cell.homeGoals;
    const a = cell.awayGoals;
    const name = sel.selectionName.toUpperCase();

    switch (sel.marketType) {
      case 'MATCH_WINNER':
        if (name === 'HOME' || name === '1') return h > a;
        if (name === 'DRAW' || name === 'X') return h === a;
        if (name === 'AWAY' || name === '2') return a > h;
        return false;

      case 'TOTAL_GOALS':
        const line = sel.line ?? 2.5;
        const total = h + a;
        if (name.includes('OVER')) return total > line;
        if (name.includes('UNDER')) return total < line;
        return false;

      case 'BOTH_TEAMS_TO_SCORE':
        const btts = h > 0 && a > 0;
        if (name === 'YES') return btts;
        if (name === 'NO') return !btts;
        return false;

      case 'DOUBLE_CHANCE':
        if (name === '1X' || name === 'HOME_OR_DRAW') return h >= a;
        if (name === 'X2' || name === 'DRAW_OR_AWAY') return a >= h;
        if (name === '12' || name === 'HOME_OR_AWAY') return h !== a;
        return false;

      default:
        return true;
    }
  }

  private static getCorrelationKey(prop: BuilderSelection, scoreline: BuilderSelection): string {
    const team = prop.playerTeam || 'HOME';
    const propKey = `SCORER_${team}`;

    if (scoreline.marketType === 'MATCH_WINNER') {
      return `${propKey}:${scoreline.selectionName.toUpperCase()}`;
    }
    if (scoreline.marketType === 'TOTAL_GOALS') {
      const dir = scoreline.selectionName.toUpperCase().includes('OVER') ? 'OVER' : 'UNDER';
      return `${propKey}:${dir}`;
    }
    return `${propKey}:HOME`;
  }
}
