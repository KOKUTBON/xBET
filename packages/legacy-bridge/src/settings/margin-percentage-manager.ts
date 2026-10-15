/**
 * Admin Winning/Losing Percentage, Game RTP & Agent Commission Manager
 * Ports and modernizes all CakePHP GameSetting, Setting, and UserSettings
 * percentage management logic for:
 * 1. Casino Game RTP & Win Occurrence percentages (Blackjack, Roulette, Slots, Scratch, Keno, etc.)
 * 2. Sportsbook Market Overround Margins & Service Fees
 * 3. Multi-tier Agent & Branch Profit/Loss (P&L) Commission Sharing
 */

export interface CasinoGameRtpConfig {
  gameId: string;
  gameName: string;
  winOccurrencePct: number; // 0 to 100% (100 = true fair / standard probability)
  bonusOccurrencePct?: number;
  rowPercentages?: {
    row1: number;
    row2: number;
    row3: number;
  };
  jackpotContributionPct: number;
  targetRtp: number; // e.g. 96.5%
}

export interface SportsbookMarginConfig {
  defaultOverroundMarginPct: number; // e.g. 5.0% (105% book)
  serviceFeePct: number; // e.g. 2.0%
  depositFundingBonusPct: number;
  referralDepositBonusPct: number;
  maxWinningCapPerTicket: number;
  minOdds: number;
  maxOdds: number;
}

export interface AgentCommissionStructure {
  agentId: string;
  agentName: string;
  role: 'SUPER_ADMIN' | 'BRANCH' | 'AGENT' | 'CASHIER';
  turnoverCommissionPct: number; // % on gross bet turnover (e.g. 1.5%)
  lossCommissionPct: number; // % on net punter loss (Deposits - Withdrawals or Stakes - Wins, e.g. 25.0%)
  weeklyResetEnabled: boolean;
}

export interface PnLCommissionCalculation {
  agentId: string;
  totalTurnover: number;
  totalStakes: number;
  totalWins: number;
  grossGamingRevenue: number; // Stakes - Wins
  turnoverCommission: number;
  lossCommission: number;
  totalPayoutDue: number;
}

export class MarginPercentageManager {
  private static instance: MarginPercentageManager;

  // 1. Casino Game Win Occurrence Settings (Ported from CakePHP GameSetting.php)
  private casinoConfigs: Map<string, CasinoGameRtpConfig> = new Map();

  // 2. Sportsbook Margin & Fee Settings (Ported from CakePHP Setting.php)
  private sportsbookConfig: SportsbookMarginConfig = {
    defaultOverroundMarginPct: 5.0,
    serviceFeePct: 0.0,
    depositFundingBonusPct: 10.0,
    referralDepositBonusPct: 5.0,
    maxWinningCapPerTicket: 100000.0,
    minOdds: 1.05,
    maxOdds: 1000.0,
  };

  // 3. Hierarchical Agent Commission Structures (Ported from CakePHP UserSettings.php)
  private agentCommissions: Map<string, AgentCommissionStructure> = new Map();

  private constructor() {
    this.initializeDefaultCasinoSettings();
  }

  public static getInstance(): MarginPercentageManager {
    if (!MarginPercentageManager.instance) {
      MarginPercentageManager.instance = new MarginPercentageManager();
    }
    return MarginPercentageManager.instance;
  }

  private initializeDefaultCasinoSettings(): void {
    const defaults: CasinoGameRtpConfig[] = [
      { gameId: 'blackjack', gameName: 'Blackjack Classic', winOccurrencePct: 100, targetRtp: 99.5, jackpotContributionPct: 0 },
      { gameId: 'roulette', gameName: 'European Roulette', winOccurrencePct: 100, targetRtp: 97.3, jackpotContributionPct: 0 },
      { gameId: 'baccarat', gameName: 'Baccarat Professional', winOccurrencePct: 100, targetRtp: 98.9, jackpotContributionPct: 0 },
      { gameId: 'high_low', gameName: 'High-Low Cards', winOccurrencePct: 100, targetRtp: 96.0, jackpotContributionPct: 0 },
      { gameId: 'keno', gameName: 'Keno Classic', winOccurrencePct: 90, targetRtp: 92.0, jackpotContributionPct: 1.0 },
      { gameId: 'bingo', gameName: 'Bingo 75', winOccurrencePct: 95, targetRtp: 94.0, jackpotContributionPct: 1.5 },
      {
        gameId: 'scratch',
        gameName: 'Lucky Scratch',
        winOccurrencePct: 85,
        targetRtp: 95.0,
        jackpotContributionPct: 2.0,
        rowPercentages: { row1: 70, row2: 25, row3: 5 },
      },
      { gameId: 'slot_chicken', gameName: 'Crazy Chicken Slots', winOccurrencePct: 92, bonusOccurrencePct: 15, targetRtp: 96.2, jackpotContributionPct: 2.5 },
      { gameId: 'slot_fruits', gameName: 'Fruit Party Deluxe', winOccurrencePct: 94, bonusOccurrencePct: 12, targetRtp: 96.5, jackpotContributionPct: 2.0 },
      { gameId: 'slot_ramses', gameName: 'Ramses Gold 5-Reel', winOccurrencePct: 93, bonusOccurrencePct: 14, targetRtp: 96.0, jackpotContributionPct: 3.0 },
    ];

    for (const conf of defaults) {
      this.casinoConfigs.set(conf.gameId, conf);
    }
  }

  // --------------------------------------------------------------------------
  // Casino Win/Loss % Management
  // --------------------------------------------------------------------------
  public getCasinoConfig(gameId: string): CasinoGameRtpConfig | undefined {
    return this.casinoConfigs.get(gameId);
  }

  public getAllCasinoConfigs(): CasinoGameRtpConfig[] {
    return Array.from(this.casinoConfigs.values());
  }

  public updateCasinoWinOccurrence(gameId: string, winOccurrencePct: number): CasinoGameRtpConfig {
    if (winOccurrencePct < 0 || winOccurrencePct > 100) {
      throw new Error('Win occurrence percentage must be between 0 and 100%');
    }
    const config = this.casinoConfigs.get(gameId);
    if (!config) throw new Error(`Game ${gameId} not found in configuration registry`);

    config.winOccurrencePct = winOccurrencePct;
    return config;
  }

  public updateCasinoBonusOccurrence(gameId: string, bonusOccurrencePct: number): CasinoGameRtpConfig {
    const config = this.casinoConfigs.get(gameId);
    if (!config) throw new Error(`Game ${gameId} not found`);
    config.bonusOccurrencePct = bonusOccurrencePct;
    return config;
  }

  public updateScratchRowPercentages(row1: number, row2: number, row3: number): CasinoGameRtpConfig {
    if (row1 + row2 + row3 !== 100) {
      throw new Error('Scratch row win percentages must sum to 100%');
    }
    const config = this.casinoConfigs.get('scratch')!;
    config.rowPercentages = { row1, row2, row3 };
    return config;
  }

  /**
   * Applies the win occurrence probability filter to a proposed game round.
   * If winOccurrencePct = 100, returns original outcome.
   * If outcome exceeds threshold, shifts outcome to house advantage.
   */
  public evaluateCasinoOutcome(gameId: string, rawRandomPct: number): { isWinningOutcome: boolean; appliedWinRate: number } {
    const config = this.casinoConfigs.get(gameId);
    const winRate = config ? config.winOccurrencePct : 100;

    if (winRate >= 100) {
      return { isWinningOutcome: true, appliedWinRate: 100 };
    }

    const isWinning = rawRandomPct * 100 <= winRate;
    return { isWinningOutcome: isWinning, appliedWinRate: winRate };
  }

  // --------------------------------------------------------------------------
  // Sportsbook Overround Margin & Service Fees
  // --------------------------------------------------------------------------
  public getSportsbookConfig(): SportsbookMarginConfig {
    return { ...this.sportsbookConfig };
  }

  public updateSportsbookConfig(updates: Partial<SportsbookMarginConfig>): SportsbookMarginConfig {
    this.sportsbookConfig = {
      ...this.sportsbookConfig,
      ...updates,
    };
    return { ...this.sportsbookConfig };
  }

  /**
   * Calculates odds overround margin given fair probabilities
   */
  public applyOverroundMargin(fairProbabilities: number[], marginPct?: number): number[] {
    const margin = (marginPct !== undefined ? marginPct : this.sportsbookConfig.defaultOverroundMarginPct) / 100;
    const totalFair = fairProbabilities.reduce((a, b) => a + b, 0);
    const targetBook = 1.0 + margin;

    return fairProbabilities.map((prob) => {
      const adjustedProb = (prob / totalFair) * targetBook;
      const odds = 1 / adjustedProb;
      return Number(odds.toFixed(2));
    });
  }

  /**
   * Calculates service fee deducted/added to stake
   */
  public calculateStakeWithServiceFee(baseStake: number): { baseStake: number; serviceFee: number; totalStake: number } {
    const feePct = this.sportsbookConfig.serviceFeePct;
    const serviceFee = Number(((baseStake * feePct) / 100).toFixed(2));
    return {
      baseStake,
      serviceFee,
      totalStake: Number((baseStake + serviceFee).toFixed(2)),
    };
  }

  // --------------------------------------------------------------------------
  // Agent Hierarchical Profit & Loss Commission Sharing
  // --------------------------------------------------------------------------
  public setAgentCommission(config: AgentCommissionStructure): AgentCommissionStructure {
    this.agentCommissions.set(config.agentId, { ...config });
    return config;
  }

  public getAgentCommission(agentId: string): AgentCommissionStructure | undefined {
    return this.agentCommissions.get(agentId);
  }

  /**
   * Calculates P&L commission settlement for an agent given player turnover & wins
   */
  public calculateAgentPnLCommission(
    agentId: string,
    totalStakes: number,
    totalWins: number
  ): PnLCommissionCalculation {
    const structure = this.agentCommissions.get(agentId) || {
      agentId,
      agentName: 'Default Agent',
      role: 'AGENT',
      turnoverCommissionPct: 1.0,
      lossCommissionPct: 20.0,
      weeklyResetEnabled: true,
    };

    const ggr = totalStakes - totalWins; // Positive when house/agent wins, negative when punters win
    const turnoverCommission = Number(((totalStakes * structure.turnoverCommissionPct) / 100).toFixed(2));

    // Loss commission applies to net positive GGR (when players lose money)
    const netLossAmount = Math.max(0, ggr);
    const lossCommission = Number(((netLossAmount * structure.lossCommissionPct) / 100).toFixed(2));

    const totalPayoutDue = Number((turnoverCommission + lossCommission).toFixed(2));

    return {
      agentId,
      totalTurnover: totalStakes,
      totalStakes,
      totalWins,
      grossGamingRevenue: ggr,
      turnoverCommission,
      lossCommission,
      totalPayoutDue,
    };
  }
}
