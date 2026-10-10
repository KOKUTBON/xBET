/**
 * Quantitative Scenario-Based Net Exposure Risk Engine (Phase 4)
 * 
 * Computes aggregate bookmaker liability across the complete discrete score grid (i, j)
 * (e.g. 0-0, 1-0, 0-1, 2-1...) factoring in all active 1X2, Over/Under, BTTS, and Correct Score
 * positions simultaneously on a fixture.
 * 
 * Core Capabilities:
 * 1. Joint Scenario Matrix: Computes net bookmaker P&L (gross stakes - winning payouts) for every scoreline.
 * 2. Probability-Weighted Expected P&L: Integrates with Bivariate Poisson probabilities.
 * 3. Worst-Case Drawdown & Value at Risk: Detects maximum loss scenario across all outcomes.
 * 4. Pre-Placement Scenario Gate: Validates proposed bets against max permissible scenario loss limits.
 * 5. Dynamic Market Shading: Identifies high-concentration scorelines and recommends odds shading discounts.
 * 6. Atomic Snapshot/Restore: Preserves serializable transaction boundaries during placement rollbacks.
 */

export interface ScenarioScore {
  home: number;
  away: number;
}

export interface TicketPosition {
  ticketId: string;
  fixtureId: string;
  marketType: '1X2' | 'TOTAL_GOALS' | 'BTTS' | 'CORRECT_SCORE' | string;
  selection: string; // 'HOME' | 'DRAW' | 'AWAY' | 'OVER' | 'UNDER' | 'YES' | 'NO' | '2-1'
  line?: number;     // e.g. 2.5, 1.5, 3.5
  stake: number;
  potentialPayout: number;
  status: 'ACCEPTED' | 'SETTLED' | 'VOID' | 'CASHED_OUT';
}

export interface ScenarioCell {
  home: number;
  away: number;
  probability?: number;
  totalWinningPayout: number;
  netPnL: number; // positive = bookmaker profit, negative = bookmaker loss
}

export interface ScenarioExposureReport {
  fixtureId: string;
  totalGrossStake: number;
  totalTickets: number;
  grid: ScenarioCell[];
  worstCaseScenario: {
    home: number;
    away: number;
    netLoss: number; // >= 0
    totalWinningPayout: number;
  };
  bestCaseScenario: {
    home: number;
    away: number;
    netProfit: number;
  };
  expectedPnL?: number; // Probability-weighted expected profit
  maxScenarioLoss: number;
  isWithinPolicyLimit: boolean;
  scenarioLimit: number;
}

export interface ProposedBetEvaluation {
  approved: boolean;
  currentMaxLoss: number;
  projectedMaxLoss: number;
  scenarioLimit: number;
  reason?: string;
  maxPermissibleStake?: number;
}

export interface MarketShadingAdjustment {
  marketType: string;
  selection: string;
  riskWeight: number; // normalized severity: > 1.0 indicates heavy exposure
  shadingMultiplier: number; // e.g. 0.95 means shorten odds by 5%
  recommendedAction: 'SHORTEN' | 'LENGTHEN' | 'NEUTRAL';
}

export class ScenarioExposureEngine {
  private static instance: ScenarioExposureEngine;
  private ticketsByFixture: Map<string, Map<string, TicketPosition>> = new Map();
  public defaultScenarioLimit: number = 25000.0; // Max permissible bookmaker loss on any single scoreline (PTS)
  public maxSimulatedGoals: number = 6;         // Grid size 0-6 goals each team (49 discrete scenarios)

  private constructor() {}

  public static getInstance(): ScenarioExposureEngine {
    if (!ScenarioExposureEngine.instance) {
      ScenarioExposureEngine.instance = new ScenarioExposureEngine();
    }
    return ScenarioExposureEngine.instance;
  }

  public static resetInstance(): void {
    ScenarioExposureEngine.instance = undefined as any;
  }

  /**
   * Evaluates if a given ticket selection wins for a specific discrete match scoreline (h, a).
   */
  public static doesSelectionWin(
    marketType: string,
    selection: string,
    line: number | undefined,
    homeGoals: number,
    awayGoals: number
  ): boolean {
    const normType = marketType.toUpperCase().trim();
    const normSel = selection.toUpperCase().trim();

    // 1X2 / Match Winner
    if (normType.includes('1X2') || normType.includes('MATCH_WINNER') || normType.includes('FULL_TIME_RESULT')) {
      if (normSel === 'HOME' || normSel === '1') return homeGoals > awayGoals;
      if (normSel === 'DRAW' || normSel === 'X') return homeGoals === awayGoals;
      if (normSel === 'AWAY' || normSel === '2') return homeGoals < awayGoals;
      return false;
    }

    // Over / Under Total Goals
    if (normType.includes('TOTAL') || normType.includes('OVER_UNDER')) {
      const totalGoals = homeGoals + awayGoals;
      const threshold = line ?? 2.5;
      if (normSel === 'OVER') return totalGoals > threshold;
      if (normSel === 'UNDER') return totalGoals < threshold;
      return false;
    }

    // Both Teams To Score (BTTS)
    if (normType.includes('BTTS') || normType.includes('BOTH_TEAMS')) {
      const bothScored = homeGoals >= 1 && awayGoals >= 1;
      if (normSel === 'YES') return bothScored;
      if (normSel === 'NO') return !bothScored;
      return false;
    }

    // Correct Score
    if (normType.includes('CORRECT_SCORE')) {
      const match = normSel.match(/(\d+)\s*[-:]\s*(\d+)/);
      if (match) {
        const targetH = parseInt(match[1], 10);
        const targetA = parseInt(match[2], 10);
        return homeGoals === targetH && awayGoals === targetA;
      }
      return false;
    }

    return false;
  }

  public registerTicket(ticket: TicketPosition): void {
    if (!this.ticketsByFixture.has(ticket.fixtureId)) {
      this.ticketsByFixture.set(ticket.fixtureId, new Map());
    }
    this.ticketsByFixture.get(ticket.fixtureId)!.set(ticket.ticketId, ticket);
  }

  public removeTicket(fixtureId: string, ticketId: string): void {
    const fixtureMap = this.ticketsByFixture.get(fixtureId);
    if (fixtureMap) {
      fixtureMap.delete(ticketId);
    }
  }

  public updateTicketStatus(
    fixtureId: string,
    ticketId: string,
    status: 'ACCEPTED' | 'SETTLED' | 'VOID' | 'CASHED_OUT',
    remainingStake?: number,
    remainingPotentialPayout?: number
  ): void {
    const fixtureMap = this.ticketsByFixture.get(fixtureId);
    const ticket = fixtureMap?.get(ticketId);
    if (ticket) {
      ticket.status = status;
      if (remainingStake !== undefined) ticket.stake = remainingStake;
      if (remainingPotentialPayout !== undefined) ticket.potentialPayout = remainingPotentialPayout;
    }
  }

  public getTickets(fixtureId: string): TicketPosition[] {
    const fixtureMap = this.ticketsByFixture.get(fixtureId);
    return fixtureMap ? Array.from(fixtureMap.values()) : [];
  }

  public getActiveFixturesCount(): number {
    return this.ticketsByFixture.size;
  }

  public getTotalTicketsCount(): number {
    let count = 0;
    for (const map of this.ticketsByFixture.values()) count += map.size;
    return count;
  }

  public getDefaultScenarioLimit(): number {
    return this.defaultScenarioLimit;
  }

  /**
   * Computes the complete net exposure grid across all (home, away) score scenarios.
   */
  public calculateExposure(
    fixtureId: string,
    probabilities?: Map<string, number>,
    scenarioLimit: number = this.defaultScenarioLimit
  ): ScenarioExposureReport {
    const tickets = this.getTickets(fixtureId).filter((t) => t.status === 'ACCEPTED');
    const totalGrossStake = tickets.reduce((sum, t) => sum + t.stake, 0);

    const maxG = this.maxSimulatedGoals;
    const grid: ScenarioCell[] = [];

    let worstLoss = 0;
    let worstScenario = { home: 0, away: 0, netLoss: 0, totalWinningPayout: 0 };
    let bestProfit = -Infinity;
    let bestScenario = { home: 0, away: 0, netProfit: 0 };
    let expectedPnL = 0;
    let hasProbs = false;

    for (let h = 0; h <= maxG; h++) {
      for (let a = 0; a <= maxG; a++) {
        let winningPayout = 0;

        for (const t of tickets) {
          if (ScenarioExposureEngine.doesSelectionWin(t.marketType, t.selection, t.line, h, a)) {
            winningPayout += t.potentialPayout;
          }
        }

        const netPnL = parseFloat((totalGrossStake - winningPayout).toFixed(2));
        const cellLoss = Math.max(0, -netPnL);

        const probKey = `${h}-${a}`;
        const prob = probabilities ? probabilities.get(probKey) : undefined;
        if (prob !== undefined) {
          expectedPnL += prob * netPnL;
          hasProbs = true;
        }

        grid.push({
          home: h,
          away: a,
          probability: prob,
          totalWinningPayout: parseFloat(winningPayout.toFixed(2)),
          netPnL,
        });

        if (cellLoss > worstLoss) {
          worstLoss = cellLoss;
          worstScenario = { home: h, away: a, netLoss: cellLoss, totalWinningPayout: winningPayout };
        }

        if (netPnL > bestProfit) {
          bestProfit = netPnL;
          bestScenario = { home: h, away: a, netProfit: netPnL };
        }
      }
    }

    return {
      fixtureId,
      totalGrossStake: parseFloat(totalGrossStake.toFixed(2)),
      totalTickets: tickets.length,
      grid,
      worstCaseScenario: worstScenario,
      bestCaseScenario: bestScenario,
      expectedPnL: hasProbs ? parseFloat(expectedPnL.toFixed(2)) : undefined,
      maxScenarioLoss: worstLoss,
      isWithinPolicyLimit: worstLoss <= scenarioLimit,
      scenarioLimit,
    };
  }

  /**
   * Pre-placement gate: Tests whether adding a proposed bet would breach scenario limits.
   * If it would breach the limit, calculates the maximum permissible stake that keeps exposure safe.
   */
  public evaluateProposedBet(
    fixtureId: string,
    proposed: {
      marketType: string;
      selection: string;
      line?: number;
      stake: number;
      odds: number;
    },
    scenarioLimit: number = this.defaultScenarioLimit
  ): ProposedBetEvaluation {
    const currentReport = this.calculateExposure(fixtureId, undefined, scenarioLimit);
    const potentialPayout = proposed.stake * proposed.odds;

    // Simulate addition of proposed bet
    const tickets = this.getTickets(fixtureId).filter((t) => t.status === 'ACCEPTED');
    const projectedGross = currentReport.totalGrossStake + proposed.stake;

    let projectedWorstLoss = 0;
    let worstWinningPayout = 0;
    let worstWinningDelta = 0;

    for (let h = 0; h <= this.maxSimulatedGoals; h++) {
      for (let a = 0; a <= this.maxSimulatedGoals; a++) {
        let winningPayout = 0;
        for (const t of tickets) {
          if (ScenarioExposureEngine.doesSelectionWin(t.marketType, t.selection, t.line, h, a)) {
            winningPayout += t.potentialPayout;
          }
        }

        const proposedWins = ScenarioExposureEngine.doesSelectionWin(
          proposed.marketType,
          proposed.selection,
          proposed.line,
          h,
          a
        );

        if (proposedWins) {
          winningPayout += potentialPayout;
        }

        const netLoss = Math.max(0, winningPayout - projectedGross);
        if (netLoss > projectedWorstLoss) {
          projectedWorstLoss = netLoss;
          worstWinningPayout = winningPayout;
          worstWinningDelta = proposedWins ? (proposed.odds - 1.0) : -1.0;
        }
      }
    }

    projectedWorstLoss = parseFloat(projectedWorstLoss.toFixed(2));

    if (projectedWorstLoss <= scenarioLimit) {
      return {
        approved: true,
        currentMaxLoss: currentReport.maxScenarioLoss,
        projectedMaxLoss: projectedWorstLoss,
        scenarioLimit,
      };
    }

    // Breached: Calculate max permitted stake
    // For the critical scenario: MaxStake * (odds - 1) <= scenarioLimit - currentMaxLoss
    const remainingHeadroom = Math.max(0, scenarioLimit - currentReport.maxScenarioLoss);
    const netMultiplier = Math.max(0.01, proposed.odds - 1.0);
    const maxPermittedStake = parseFloat((remainingHeadroom / netMultiplier).toFixed(2));

    return {
      approved: false,
      currentMaxLoss: currentReport.maxScenarioLoss,
      projectedMaxLoss: projectedWorstLoss,
      scenarioLimit,
      reason: `SCENARIO_EXPOSURE_BREACH: Projected loss (${projectedWorstLoss} PTS) exceeds scenario limit (${scenarioLimit} PTS).`,
      maxPermissibleStake: Math.max(0, maxPermittedStake),
    };
  }

  /**
   * Generates dynamic bookmaker odds shading recommendations based on scenario concentration.
   * Shaves down odds on over-exposed scenarios and lengthens countervailing odds to attract balancing flow.
   */
  public calculateMarketShading(
    fixtureId: string,
    scenarioLimit: number = this.defaultScenarioLimit
  ): MarketShadingAdjustment[] {
    const report = this.calculateExposure(fixtureId, undefined, scenarioLimit);
    const adjustments: MarketShadingAdjustment[] = [];

    const marketsToCheck = [
      { marketType: '1X2', selections: ['HOME', 'DRAW', 'AWAY'] },
      { marketType: 'TOTAL_GOALS', selections: ['OVER', 'UNDER'], line: 2.5 },
      { marketType: 'BTTS', selections: ['YES', 'NO'] },
    ];

    for (const m of marketsToCheck) {
      for (const sel of m.selections) {
        // Find worst loss among scenarios where this selection wins
        let maxSelLoss = 0;
        for (const cell of report.grid) {
          if (ScenarioExposureEngine.doesSelectionWin(m.marketType, sel, m.line, cell.home, cell.away)) {
            const loss = Math.max(0, -cell.netPnL);
            if (loss > maxSelLoss) maxSelLoss = loss;
          }
        }

        const riskRatio = scenarioLimit > 0 ? maxSelLoss / scenarioLimit : 0;
        let shadingMultiplier = 1.0;
        let recommendedAction: MarketShadingAdjustment['recommendedAction'] = 'NEUTRAL';

        if (riskRatio > 0.8) {
          // Critical exposure: Shorten odds aggressively (reduce by 4% to 8%)
          shadingMultiplier = Math.max(0.92, 1.0 - (riskRatio - 0.7) * 0.2);
          recommendedAction = 'SHORTEN';
        } else if (riskRatio < 0.2 && report.totalGrossStake > 500) {
          // Countervailing safe position: Slightly lengthen odds to attract balancing flow (up to +3%)
          shadingMultiplier = 1.03;
          recommendedAction = 'LENGTHEN';
        }

        adjustments.push({
          marketType: m.marketType,
          selection: sel,
          riskWeight: parseFloat(riskRatio.toFixed(3)),
          shadingMultiplier: parseFloat(shadingMultiplier.toFixed(3)),
          recommendedAction,
        });
      }
    }

    return adjustments;
  }

  public snapshot(): Map<string, TicketPosition[]> {
    const snap = new Map<string, TicketPosition[]>();
    for (const [fixId, map] of this.ticketsByFixture.entries()) {
      snap.set(fixId, Array.from(map.values()).map((t) => ({ ...t })));
    }
    return snap;
  }

  public restore(snap: Map<string, TicketPosition[]>): void {
    this.ticketsByFixture.clear();
    for (const [fixId, list] of snap.entries()) {
      const map = new Map<string, TicketPosition>();
      for (const t of list) map.set(t.ticketId, { ...t });
      this.ticketsByFixture.set(fixId, map);
    }
  }

  public reset(fixtureId?: string): void {
    if (fixtureId) {
      this.ticketsByFixture.delete(fixtureId);
    } else {
      this.ticketsByFixture.clear();
    }
  }
}
