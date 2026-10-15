/**
 * Advanced Risk Management & Fraud Detection Engine
 * Evaluates live bet liability exposure, enforces velocity rate-limits,
 * detects multi-account collusion, and profiles sharp punters.
 */

import { randomUUID } from 'crypto';
import {
  PlayerRiskProfile,
  RiskLevel,
  RiskFlagType,
} from './risk-types.ts';
import type {
  RiskEvaluationResult,
  LiabilityRecord,
  FraudAlert,
  RiskEngineConfig,
} from './risk-types.ts';

export class RiskEngine {
  private static instance: RiskEngine;
  private config: RiskEngineConfig;

  // Player risk profiles: userId -> PlayerRiskProfile
  private playerProfiles: Map<string, PlayerRiskProfile> = new Map();

  // Liability tracking: key = `${fixtureId}::${marketName}::${selectionName}` -> LiabilityRecord
  private liabilities: Map<string, LiabilityRecord> = new Map();

  // Bet history for velocity checks: userId -> timestamp[]
  private userBetHistory: Map<string, number[]> = new Map();

  // Collusion tracking: IP -> { userId: string; selectionKey: string; timestamp: number }[]
  private ipHistory: Map<string, Array<{ userId: string; selectionKey: string; timestamp: number }>> = new Map();

  // Backoffice fraud alerts
  private fraudAlerts: FraudAlert[] = [];

  private constructor() {
    this.config = {
      defaultMaxStake: 5000.0,
      defaultMaxWin: 100000.0,
      defaultMaxFixtureLiability: 25000.0, // Max bookmaker payout risk per selection
      velocityWindowSeconds: 10,
      maxBetsPerWindow: 3,
      collusionWindowSeconds: 60,
      sharpStakeMultiplier: 0.20, // Sharp bettors restricted to 20% standard stake
    };
  }

  public static getInstance(): RiskEngine {
    if (!RiskEngine.instance) {
      RiskEngine.instance = new RiskEngine();
    }
    return RiskEngine.instance;
  }

  public updateConfig(partial: Partial<RiskEngineConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  public setPlayerProfile(userId: string, profile: PlayerRiskProfile): void {
    this.playerProfiles.set(userId, profile);
    console.log(`[RiskEngine] Set User ${userId} Risk Profile: ${profile}`);
  }

  public getPlayerProfile(userId: string): PlayerRiskProfile {
    return this.playerProfiles.get(userId) || PlayerRiskProfile.RECREATIONAL;
  }

  /**
   * Pre-Placement Real-Time Risk & Fraud Evaluation
   */
  public evaluateBetPlacement(params: {
    userId: string;
    stake: number;
    potentialPayout: number;
    legs: Array<{
      fixtureId: string;
      fixtureName: string;
      marketName: string;
      selectionName: string;
      odds: number;
    }>;
    ipAddress?: string;
  }): RiskEvaluationResult {
    const now = Date.now();
    const profile = this.getPlayerProfile(params.userId);
    const flags: RiskFlagType[] = [];
    let riskScore = 10; // Baseline low risk

    // 1. Account Status Check
    if (profile === PlayerRiskProfile.SUSPENDED) {
      flags.push(RiskFlagType.ACCOUNT_SUSPENDED);
      return {
        allowed: false,
        riskScore: 100,
        flags,
        rejectionReason: 'Account is suspended by risk compliance.',
      };
    }

    // 2. Max Stake Allowance Check
    let effectiveMaxStake = this.config.defaultMaxStake;
    if (profile === PlayerRiskProfile.SHARP_PUNTER) {
      effectiveMaxStake = parseFloat((this.config.defaultMaxStake * this.config.sharpStakeMultiplier).toFixed(2));
      if (params.stake > effectiveMaxStake) {
        flags.push(RiskFlagType.SHARP_STAKE_THROTTLED);
        riskScore += 30;
      }
    } else if (profile === PlayerRiskProfile.VIP_HIGH_ROLLER) {
      effectiveMaxStake = this.config.defaultMaxStake * 5.0; // $25,000 for VIPs
    }

    if (params.stake > effectiveMaxStake) {
      flags.push(RiskFlagType.MAX_STAKE_EXCEEDED);
      return {
        allowed: false,
        riskScore: Math.min(100, riskScore + 40),
        flags,
        adjustedMaxStake: effectiveMaxStake,
        rejectionReason: `Stake of $${params.stake} exceeds maximum allowed limit of $${effectiveMaxStake}.`,
      };
    }

    // 3. Max Winning Cap Check
    if (params.potentialPayout > this.config.defaultMaxWin) {
      flags.push(RiskFlagType.MAX_WIN_CAP_EXCEEDED);
      return {
        allowed: false,
        riskScore: Math.min(100, riskScore + 40),
        flags,
        rejectionReason: `Potential win of $${params.potentialPayout} exceeds platform winning cap of $${this.config.defaultMaxWin}.`,
      };
    }

    // 4. Bet Velocity Rate-Limiter Check
    const userTimestamps = this.userBetHistory.get(params.userId) || [];
    const windowStart = now - this.config.velocityWindowSeconds * 1000;
    const recentBets = userTimestamps.filter((t) => t >= windowStart);

    if (recentBets.length >= this.config.maxBetsPerWindow) {
      flags.push(RiskFlagType.BET_VELOCITY_EXCEEDED);
      this.createFraudAlert({
        userId: params.userId,
        riskLevel: RiskLevel.HIGH,
        title: 'High Bet Velocity Detected',
        description: `User placed ${recentBets.length + 1} bets within ${this.config.velocityWindowSeconds}s (Bot or Latency Exploitation).`,
        flags: [RiskFlagType.BET_VELOCITY_EXCEEDED],
        ipAddress: params.ipAddress,
      });

      return {
        allowed: false,
        riskScore: 85,
        flags,
        rejectionReason: 'Bet velocity rate limit exceeded. Please wait a few seconds before placing another bet.',
      };
    }

    // 5. Multi-Accounting / Syndicate Collusion Check
    if (params.ipAddress) {
      const ipRecords = this.ipHistory.get(params.ipAddress) || [];
      const collusionStart = now - this.config.collusionWindowSeconds * 1000;
      const recentIpBets = ipRecords.filter((r) => r.timestamp >= collusionStart);

      for (const leg of params.legs) {
        const key = `${leg.fixtureId}::${leg.marketName}::${leg.selectionName}`;
        const matchingCollusion = recentIpBets.find((r) => r.userId !== params.userId && r.selectionKey === key);

        if (matchingCollusion) {
          flags.push(RiskFlagType.MULTI_ACCOUNTING_COLLUSION);
          riskScore += 50;
          this.createFraudAlert({
            userId: params.userId,
            riskLevel: RiskLevel.CRITICAL,
            title: 'Syndicate / Multi-Accounting Collision Detected',
            description: `User ${params.userId} and User ${matchingCollusion.userId} placed identical selection '${leg.selectionName}' from same IP ${params.ipAddress} within ${this.config.collusionWindowSeconds}s.`,
            flags: [RiskFlagType.MULTI_ACCOUNTING_COLLUSION],
            ipAddress: params.ipAddress,
            metadata: { selectionKey: key, counterpartUserId: matchingCollusion.userId },
          });
        }
      }
    }

    // 6. Bookmaker Liability Exposure Check per Fixture / Selection
    for (const leg of params.legs) {
      const key = `${leg.fixtureId}::${leg.marketName}::${leg.selectionName}`;
      const currentLiability = this.liabilities.get(key)?.totalPotentialPayout || 0;
      const legPayout = params.stake * leg.odds;

      if (currentLiability + legPayout > this.config.defaultMaxFixtureLiability) {
        flags.push(RiskFlagType.HIGH_LIABILITY_EXPOSURE);
        riskScore += 35;

        const remainingLiability = Math.max(0, this.config.defaultMaxFixtureLiability - currentLiability);
        const adjustedStake = Math.floor(remainingLiability / (leg.odds > 1 ? leg.odds - 1 : 1));

        if (adjustedStake <= 1.0) {
          return {
            allowed: false,
            riskScore: 90,
            flags,
            adjustedMaxStake: 0,
            rejectionReason: `Market liability cap reached on ${leg.selectionName} (Current Exposure: $${currentLiability.toFixed(2)}).`,
          };
        }

        return {
          allowed: false,
          riskScore: 75,
          flags,
          adjustedMaxStake: adjustedStake,
          rejectionReason: `Stake exceeds market exposure cap. Max allowable stake is $${adjustedStake}.`,
        };
      }
    }

    return {
      allowed: true,
      riskScore,
      flags,
    };
  }

  /**
   * Commits the placed bet into liability accumulators and velocity buffers
   */
  public recordBetPlacement(params: {
    userId: string;
    stake: number;
    legs: Array<{
      fixtureId: string;
      fixtureName: string;
      marketName: string;
      selectionName: string;
      odds: number;
    }>;
    ipAddress?: string;
  }): void {
    const now = Date.now();

    // 1. Record User Velocity
    if (!this.userBetHistory.has(params.userId)) {
      this.userBetHistory.set(params.userId, []);
    }
    this.userBetHistory.get(params.userId)!.push(now);

    // 2. Record IP Collusion History
    if (params.ipAddress) {
      if (!this.ipHistory.has(params.ipAddress)) {
        this.ipHistory.set(params.ipAddress, []);
      }
      for (const leg of params.legs) {
        const key = `${leg.fixtureId}::${leg.marketName}::${leg.selectionName}`;
        this.ipHistory.get(params.ipAddress)!.push({
          userId: params.userId,
          selectionKey: key,
          timestamp: now,
        });
      }
    }

    // 3. Accumulate Market Liability
    for (const leg of params.legs) {
      const key = `${leg.fixtureId}::${leg.marketName}::${leg.selectionName}`;
      let record = this.liabilities.get(key);

      if (!record) {
        record = {
          fixtureId: leg.fixtureId,
          fixtureName: leg.fixtureName,
          marketName: leg.marketName,
          selectionName: leg.selectionName,
          totalStake: 0,
          totalPotentialPayout: 0,
          maxLiabilityLimit: this.config.defaultMaxFixtureLiability,
          currentExposurePercentage: 0,
        };
        this.liabilities.set(key, record);
      }

      record.totalStake += params.stake;
      record.totalPotentialPayout += params.stake * leg.odds;
      record.currentExposurePercentage = parseFloat(
        ((record.totalPotentialPayout / record.maxLiabilityLimit) * 100).toFixed(2)
      );

      console.log(
        `[RiskEngine:Liability] ${record.fixtureName} [${record.selectionName}]: Payout Exposure $${record.totalPotentialPayout.toFixed(2)} (${record.currentExposurePercentage}% of $${record.maxLiabilityLimit})`
      );
    }
  }

  public getMarketLiability(fixtureId: string, marketName: string, selectionName: string): LiabilityRecord | undefined {
    const key = `${fixtureId}::${marketName}::${selectionName}`;
    return this.liabilities.get(key);
  }

  public createFraudAlert(params: {
    userId: string;
    riskLevel: RiskLevel;
    title: string;
    description: string;
    flags: RiskFlagType[];
    ipAddress?: string;
    metadata?: Record<string, unknown>;
  }): FraudAlert {
    const alert: FraudAlert = {
      id: `alert_${randomUUID().slice(0, 8)}`,
      userId: params.userId,
      riskLevel: params.riskLevel,
      title: params.title,
      description: params.description,
      flags: params.flags,
      ipAddress: params.ipAddress,
      metadata: params.metadata,
      resolved: false,
      createdAt: new Date(),
    };

    this.fraudAlerts.unshift(alert);
    console.warn(`[RiskEngine:ALERT:${params.riskLevel}] ${params.title} for User ${params.userId}: ${params.description}`);
    return alert;
  }

  public getFraudAlerts(unresolvedOnly: boolean = false): FraudAlert[] {
    if (unresolvedOnly) {
      return this.fraudAlerts.filter((a) => !a.resolved);
    }
    return [...this.fraudAlerts];
  }

  public resolveFraudAlert(alertId: string, resolvedBy: string): boolean {
    const alert = this.fraudAlerts.find((a) => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedBy = resolvedBy;
      alert.resolvedAt = new Date();
      console.log(`[RiskEngine:ALERT] Alert ${alertId} resolved by ${resolvedBy}`);
      return true;
    }
    return false;
  }
}
