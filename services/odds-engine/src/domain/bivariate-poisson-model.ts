import { createHash, randomUUID } from 'node:crypto';

export interface TeamStrength {
  attack: number;   // e.g. 1.0 = average, 1.3 = elite, 0.8 = weak
  defense: number;  // e.g. 1.0 = average, 0.8 = elite defense (concedes less), 1.25 = weak
}

export interface MatchContext {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  homeStrength?: TeamStrength;
  awayStrength?: TeamStrength;
  homeAdvantage?: number; // default ~1.15
  currentScore: { home: number; away: number };
  minute: number; // 0 to 90+
  redCards: { home: number; away: number };
  stateSequence: number;
}

export interface ScoreProbability {
  homeGoals: number;
  awayGoals: number;
  probability: number;
}

export interface MarketSelectionPrice {
  id: string;
  name: string;
  fairProbability: number;
  odds: number; // decimal odds including bookmaker margin
}

export interface DerivedMarket {
  id: string;
  name: string;
  line?: string;
  status: 'ACTIVE' | 'SUSPENDED';
  selections: MarketSelectionPrice[];
}

export interface ModelRunOutput {
  modelRunId: string;
  modelVersion: string;
  stateSequence: number;
  inputHash: string;
  calculatedAt: string;
  expectedGoalsRemaining: { home: number; away: number };
  jointScoreGrid: ScoreProbability[];
  markets: {
    matchWinner: DerivedMarket;
    totalGoals25: DerivedMarket;
    totalGoals15: DerivedMarket;
    totalGoals35: DerivedMarket;
    bothTeamsToScore: DerivedMarket;
  };
}

export class BivariatePoissonModel {
  public static readonly MODEL_VERSION = 'bivariate-poisson-v1.0.0';
  public static readonly MAX_GOALS_SIMULATED = 10; // 0 to 10 goals per team

  /**
   * Evaluates the joint bivariate Poisson goal distribution and derives all
   * co-dependent markets from the identical underlying probability matrix.
   */
  public static evaluate(ctx: MatchContext, targetMargin: number = 1.06): ModelRunOutput {
    const homeStr = ctx.homeStrength || { attack: 1.15, defense: 0.95 };
    const awayStr = ctx.awayStrength || { attack: 1.00, defense: 1.05 };
    const homeAdvantage = ctx.homeAdvantage ?? 1.15;

    // Remaining match time fraction (regular 90 minutes)
    const elapsed = Math.min(90, Math.max(0, ctx.minute));
    const timeRemainingFraction = Math.max(0, 90 - elapsed) / 90.0;

    // Tactical red-card adjustments:
    // A red card reduces attacking output by ~25% and increases defensive vulnerability by ~25%
    const redCards = ctx.redCards ?? { home: 0, away: 0 };
    const homeCardAttackMod = Math.pow(0.75, redCards.home ?? 0);
    const homeCardDefMod = Math.pow(1.25, redCards.home ?? 0);
    const awayCardAttackMod = Math.pow(0.75, redCards.away ?? 0);
    const awayCardDefMod = Math.pow(1.25, redCards.away ?? 0);

    // Full match goal expectancies
    const fullHomeLambda = 1.35 * homeStr.attack * awayStr.defense * homeAdvantage;
    const fullAwayMu = 1.10 * awayStr.attack * homeStr.defense;

    // Remaining expected goals
    const remHomeLambda = Math.max(0.001, fullHomeLambda * timeRemainingFraction * homeCardAttackMod * awayCardDefMod);
    const remAwayMu = Math.max(0.001, fullAwayMu * timeRemainingFraction * awayCardAttackMod * homeCardDefMod);

    // Construct joint bivariate distribution
    const maxGoals = this.MAX_GOALS_SIMULATED;
    const jointGrid: ScoreProbability[] = [];
    let sumProb = 0.0;

    for (let i = 0; i <= maxGoals; i++) {
      const pHome = this.poissonPmf(i, remHomeLambda);
      for (let j = 0; j <= maxGoals; j++) {
        const pAway = this.poissonPmf(j, remAwayMu);
        // Low-score correlation adjustment (Dixon-Coles rho ~ -0.04)
        const rhoAdj = this.dixonColesCorrelation(i, j, remHomeLambda, remAwayMu, -0.04);
        const prob = Math.max(0, pHome * pAway * rhoAdj);

        const finalHome = ctx.currentScore.home + i;
        const finalAway = ctx.currentScore.away + j;
        jointGrid.push({ homeGoals: finalHome, awayGoals: finalAway, probability: prob });
        sumProb += prob;
      }
    }

    // Strictly normalize joint grid to sum to 1.0000000
    for (const cell of jointGrid) {
      cell.probability = cell.probability / sumProb;
    }

    // 1. Derive 1X2 (Match Winner) from joint grid
    let pHomeWin = 0;
    let pDraw = 0;
    let pAwayWin = 0;

    for (const cell of jointGrid) {
      if (cell.homeGoals > cell.awayGoals) pHomeWin += cell.probability;
      else if (cell.homeGoals === cell.awayGoals) pDraw += cell.probability;
      else pAwayWin += cell.probability;
    }

    const matchWinnerMarket: DerivedMarket = {
      id: `mkt-1x2-${ctx.fixtureId}`,
      name: 'Match Winner (1X2)',
      status: 'ACTIVE',
      selections: this.applyMargin([
        { id: `sel-home-${ctx.fixtureId}`, name: 'Home', fairProbability: pHomeWin },
        { id: `sel-draw-${ctx.fixtureId}`, name: 'Draw', fairProbability: pDraw },
        { id: `sel-away-${ctx.fixtureId}`, name: 'Away', fairProbability: pAwayWin },
      ], targetMargin),
    };

    // 2. Derive Total Goals (Over/Under lines: 1.5, 2.5, 3.5) from the SAME joint grid
    const totalGoals25 = this.deriveOverUnderMarket(ctx.fixtureId, jointGrid, 2.5, targetMargin);
    const totalGoals15 = this.deriveOverUnderMarket(ctx.fixtureId, jointGrid, 1.5, targetMargin);
    const totalGoals35 = this.deriveOverUnderMarket(ctx.fixtureId, jointGrid, 3.5, targetMargin);

    // 3. Derive Both Teams To Score (BTTS) from the SAME joint grid
    let pBttsYes = 0;
    for (const cell of jointGrid) {
      if (cell.homeGoals > 0 && cell.awayGoals > 0) pBttsYes += cell.probability;
    }
    const pBttsNo = Math.max(0, 1.0 - pBttsYes);

    const bttsMarket: DerivedMarket = {
      id: `mkt-btts-${ctx.fixtureId}`,
      name: 'Both Teams To Score',
      status: 'ACTIVE',
      selections: this.applyMargin([
        { id: `sel-btts-yes-${ctx.fixtureId}`, name: 'Yes', fairProbability: pBttsYes },
        { id: `sel-btts-no-${ctx.fixtureId}`, name: 'No', fairProbability: pBttsNo },
      ], targetMargin),
    };

    // Calculate cryptographic input hash for provenance and replay verification
    const inputDigest = createHash('sha256')
      .update(`${ctx.fixtureId}:${ctx.currentScore.home}-${ctx.currentScore.away}:${ctx.minute}:${ctx.redCards.home}-${ctx.redCards.away}:${ctx.stateSequence}:${this.MODEL_VERSION}`)
      .digest('hex');

    return {
      modelRunId: randomUUID(),
      modelVersion: this.MODEL_VERSION,
      stateSequence: ctx.stateSequence,
      inputHash: inputDigest,
      calculatedAt: new Date().toISOString(),
      expectedGoalsRemaining: {
        home: parseFloat(remHomeLambda.toFixed(4)),
        away: parseFloat(remAwayMu.toFixed(4)),
      },
      jointScoreGrid: jointGrid,
      markets: {
        matchWinner: matchWinnerMarket,
        totalGoals25,
        totalGoals15,
        totalGoals35,
        bothTeamsToScore: bttsMarket,
      },
    };
  }

  private static deriveOverUnderMarket(
    fixtureId: string,
    grid: ScoreProbability[],
    line: number,
    targetMargin: number
  ): DerivedMarket {
    let pOver = 0;
    let pUnder = 0;

    for (const cell of grid) {
      const total = cell.homeGoals + cell.awayGoals;
      if (total > line) pOver += cell.probability;
      else pUnder += cell.probability;
    }

    return {
      id: `mkt-ou-${line.toString().replace('.', '_')}-${fixtureId}`,
      name: `Total Goals (Over/Under ${line})`,
      line: line.toString(),
      status: 'ACTIVE',
      selections: this.applyMargin([
        { id: `sel-ou-over-${line}-${fixtureId}`, name: `Over ${line}`, fairProbability: pOver },
        { id: `sel-ou-under-${line}-${fixtureId}`, name: `Under ${line}`, fairProbability: pUnder },
      ], targetMargin),
    };
  }

  private static applyMargin(
    selections: { id: string; name: string; fairProbability: number }[],
    targetMargin: number
  ): MarketSelectionPrice[] {
    const totalFair = selections.reduce((sum, s) => sum + s.fairProbability, 0);
    return selections.map((s) => {
      const normFair = s.fairProbability / totalFair;
      // Multiplicative margin application
      const priceProb = normFair * targetMargin;
      const odds = Math.max(1.01, parseFloat((1.0 / priceProb).toFixed(4)));
      return {
        id: s.id,
        name: s.name,
        fairProbability: parseFloat(normFair.toFixed(6)),
        odds,
      };
    });
  }

  private static poissonPmf(k: number, lambda: number): number {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / this.factorial(k);
  }

  private static factorial(n: number): number {
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
  }

  private static dixonColesCorrelation(
    homeGoals: number,
    awayGoals: number,
    lambda: number,
    mu: number,
    rho: number
  ): number {
    if (homeGoals === 0 && awayGoals === 0) return 1.0 - lambda * mu * rho;
    if (homeGoals === 0 && awayGoals === 1) return 1.0 + lambda * rho;
    if (homeGoals === 1 && awayGoals === 0) return 1.0 + mu * rho;
    if (homeGoals === 1 && awayGoals === 1) return 1.0 - rho;
    return 1.0;
  }
}
