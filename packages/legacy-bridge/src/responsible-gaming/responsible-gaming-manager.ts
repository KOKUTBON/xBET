/**
 * Responsible Gaming Manager
 * Ported 1:1 from CakePHP UserSettings.php & RisksController.php.
 * Handles player self-protection, deposit/loss limits, 24h limit increase delay,
 * reality checks, cool-offs, and self-exclusion lockouts.
 */

import { randomUUID } from 'crypto';
import type {
  PlayerDepositLimits,
  PlayerLossLimits,
  PendingLimitChange,
  CoolOffRecord,
  SelfExclusionRecord,
  RealityCheckSummary,
  PlayerProtectionProfile,
} from './responsible-gaming-types.ts';

export interface DepositHistoryRecord {
  userId: string;
  amount: number;
  timestamp: Date;
}

export class ResponsibleGamingManager {
  private static instance: ResponsibleGamingManager;

  private profiles: Map<string, PlayerProtectionProfile> = new Map();
  private depositHistory: DepositHistoryRecord[] = [];

  private constructor() {}

  public static getInstance(): ResponsibleGamingManager {
    if (!ResponsibleGamingManager.instance) {
      ResponsibleGamingManager.instance = new ResponsibleGamingManager();
    }
    return ResponsibleGamingManager.instance;
  }

  public getOrCreateProfile(userId: string): PlayerProtectionProfile {
    let profile = this.profiles.get(userId);
    if (!profile) {
      profile = {
        userId,
        depositLimits: { dailyLimit: null, weeklyLimit: null, monthlyLimit: null },
        lossLimits: { dailyLossLimit: null, weeklyLossLimit: null },
        pendingLimitChanges: [],
        activeCoolOff: null,
        activeSelfExclusion: null,
        realityCheckIntervalMinutes: 60,
      };
      this.profiles.set(userId, profile);
    }
    return profile;
  }

  /**
   * Sets deposit limits with immediate effect on decreases, and 24h cooling-off delay on increases
   */
  public setDepositLimits(
    userId: string,
    newLimits: PlayerDepositLimits
  ): { profile: PlayerProtectionProfile; queuedChanges: PendingLimitChange[] } {
    const profile = this.getOrCreateProfile(userId);
    const queuedChanges: PendingLimitChange[] = [];
    const now = new Date();

    const limitKeys: Array<'dailyLimit' | 'weeklyLimit' | 'monthlyLimit'> = [
      'dailyLimit',
      'weeklyLimit',
      'monthlyLimit',
    ];

    for (const key of limitKeys) {
      const currentVal = profile.depositLimits[key];
      const proposedVal = newLimits[key];

      if (proposedVal === undefined || proposedVal === currentVal) continue;

      // Case 1: Limit decrease (or setting a limit where none existed) -> IMMEDIATE
      if (
        (currentVal === null || currentVal === undefined) ||
        (proposedVal !== null && proposedVal < currentVal)
      ) {
        profile.depositLimits[key] = proposedVal;
        console.log(`[ResponsibleGaming] Immediate limit decrease applied for ${userId}: ${key} = $${proposedVal}`);
      }
      // Case 2: Limit increase or removal -> 24-HOUR COOLING OFF QUEUE
      else {
        const changeRequest: PendingLimitChange = {
          id: `req-${randomUUID().substring(0, 8)}`,
          userId,
          limitType: key.replace('Limit', '') as any,
          newLimit: proposedVal as number,
          requestedAt: now,
          effectiveAt: new Date(now.getTime() + 24 * 60 * 60 * 1000), // +24 hours
          status: 'PENDING_COOL_OFF',
        };
        profile.pendingLimitChanges.push(changeRequest);
        queuedChanges.push(changeRequest);
        console.log(
          `[ResponsibleGaming] Limit increase queued for ${userId}: ${key} = $${proposedVal} (Effective in 24h at ${changeRequest.effectiveAt.toISOString()})`
        );
      }
    }

    return { profile, queuedChanges };
  }

  /**
   * Evaluates and applies any pending limit changes whose 24h cooling-off has elapsed
   */
  public processPendingLimitChanges(userId: string, currentTime: Date = new Date()): void {
    const profile = this.getOrCreateProfile(userId);
    for (const req of profile.pendingLimitChanges) {
      if (req.status === 'PENDING_COOL_OFF' && currentTime.getTime() >= req.effectiveAt.getTime()) {
        const key = `${req.limitType}Limit` as keyof PlayerDepositLimits;
        profile.depositLimits[key] = req.newLimit;
        req.status = 'APPLIED';
        console.log(`[ResponsibleGaming] Pending limit increase ACTIVATED for ${userId}: ${key} = $${req.newLimit}`);
      }
    }
  }

  /**
   * Record a successful deposit to update rolling period volumes
   */
  public recordDeposit(userId: string, amount: number, timestamp: Date = new Date()): void {
    this.depositHistory.push({ userId, amount, timestamp });
  }

  /**
   * Validates if a proposed deposit amount satisfies player's active daily/weekly/monthly limits
   */
  public canDeposit(
    userId: string,
    amount: number,
    currentTime: Date = new Date()
  ): { allowed: boolean; reason?: string; currentTotal?: number; limit?: number } {
    this.processPendingLimitChanges(userId, currentTime);
    const profile = this.getOrCreateProfile(userId);

    // Check account lockout first
    const loginCheck = this.canLogin(userId, currentTime);
    if (!loginCheck.allowed) {
      return { allowed: false, reason: loginCheck.reason };
    }

    const oneDayAgo = new Date(currentTime.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(currentTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(currentTime.getTime() - 30 * 24 * 60 * 60 * 1000);

    const userDeposits = this.depositHistory.filter((d) => d.userId === userId);

    // Daily Limit Check
    if (profile.depositLimits.dailyLimit) {
      const dailyTotal = userDeposits
        .filter((d) => d.timestamp >= oneDayAgo)
        .reduce((sum, d) => sum + d.amount, 0);

      if (dailyTotal + amount > profile.depositLimits.dailyLimit) {
        return {
          allowed: false,
          reason: `Daily deposit limit exceeded. Max: $${profile.depositLimits.dailyLimit}, Current 24h: $${dailyTotal}, Attempted: $${amount}`,
          currentTotal: dailyTotal,
          limit: profile.depositLimits.dailyLimit,
        };
      }
    }

    // Weekly Limit Check
    if (profile.depositLimits.weeklyLimit) {
      const weeklyTotal = userDeposits
        .filter((d) => d.timestamp >= oneWeekAgo)
        .reduce((sum, d) => sum + d.amount, 0);

      if (weeklyTotal + amount > profile.depositLimits.weeklyLimit) {
        return {
          allowed: false,
          reason: `Weekly deposit limit exceeded. Max: $${profile.depositLimits.weeklyLimit}, Current 7d: $${weeklyTotal}, Attempted: $${amount}`,
          currentTotal: weeklyTotal,
          limit: profile.depositLimits.weeklyLimit,
        };
      }
    }

    // Monthly Limit Check
    if (profile.depositLimits.monthlyLimit) {
      const monthlyTotal = userDeposits
        .filter((d) => d.timestamp >= oneMonthAgo)
        .reduce((sum, d) => sum + d.amount, 0);

      if (monthlyTotal + amount > profile.depositLimits.monthlyLimit) {
        return {
          allowed: false,
          reason: `Monthly deposit limit exceeded. Max: $${profile.depositLimits.monthlyLimit}, Current 30d: $${monthlyTotal}, Attempted: $${amount}`,
          currentTotal: monthlyTotal,
          limit: profile.depositLimits.monthlyLimit,
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Activates temporary cool-off (e.g. 24h, 7 days, 30 days)
   */
  public setCoolOff(userId: string, durationHours: number, reason?: string): CoolOffRecord {
    const profile = this.getOrCreateProfile(userId);
    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);

    const record: CoolOffRecord = {
      userId,
      durationHours,
      startDate,
      endDate,
      reason,
      isActive: true,
    };
    profile.activeCoolOff = record;
    console.log(`[ResponsibleGaming] User ${userId} activated Cool-Off for ${durationHours} hours (Until ${endDate.toISOString()})`);
    return record;
  }

  /**
   * Activates self-exclusion (e.g. 6 months, 12 months, 5 years, or permanent)
   */
  public setSelfExclusion(
    userId: string,
    durationMonths: number,
    isPermanent: boolean = false,
    reason?: string
  ): SelfExclusionRecord {
    const profile = this.getOrCreateProfile(userId);
    const startDate = new Date();
    const endDate = isPermanent
      ? null
      : new Date(startDate.getTime() + durationMonths * 30 * 24 * 60 * 60 * 1000);

    const record: SelfExclusionRecord = {
      userId,
      durationMonths,
      isPermanent,
      startDate,
      endDate,
      reason,
      isActive: true,
    };
    profile.activeSelfExclusion = record;
    console.log(
      `[ResponsibleGaming] User ${userId} SELF-EXCLUDED (${isPermanent ? 'PERMANENT' : `${durationMonths} months`})`
    );
    return record;
  }

  /**
   * Checks if user is permitted to authenticate / log in
   */
  public canLogin(userId: string, currentTime: Date = new Date()): { allowed: boolean; reason?: string } {
    const profile = this.getOrCreateProfile(userId);

    // 1. Check Self-Exclusion
    if (profile.activeSelfExclusion && profile.activeSelfExclusion.isActive) {
      if (profile.activeSelfExclusion.isPermanent) {
        return {
          allowed: false,
          reason: 'ACCOUNT_SELF_EXCLUDED: Permanent self-exclusion is active.',
        };
      }
      if (profile.activeSelfExclusion.endDate && currentTime < profile.activeSelfExclusion.endDate) {
        return {
          allowed: false,
          reason: `ACCOUNT_SELF_EXCLUDED: Active until ${profile.activeSelfExclusion.endDate.toISOString()}.`,
        };
      } else {
        profile.activeSelfExclusion.isActive = false;
      }
    }

    // 2. Check Cool-Off
    if (profile.activeCoolOff && profile.activeCoolOff.isActive) {
      if (currentTime < profile.activeCoolOff.endDate) {
        return {
          allowed: false,
          reason: `ACCOUNT_COOL_OFF: Active until ${profile.activeCoolOff.endDate.toISOString()}.`,
        };
      } else {
        profile.activeCoolOff.isActive = false;
      }
    }

    return { allowed: true };
  }

  /**
   * Generates a Reality Check summary for an active session
   */
  public getRealityCheck(
    userId: string,
    sessionStartTime: Date,
    stats: { totalBets: number; totalWagered: number; totalWon: number }
  ): RealityCheckSummary {
    const now = new Date();
    const durationMinutes = Math.max(1, Math.round((now.getTime() - sessionStartTime.getTime()) / 60000));
    const netProfitLoss = parseFloat((stats.totalWon - stats.totalWagered).toFixed(2));

    return {
      userId,
      sessionDurationMinutes: durationMinutes,
      totalBetsPlaced: stats.totalBets,
      totalWagered: stats.totalWagered,
      totalWon: stats.totalWon,
      netProfitLoss,
      sessionStartTime: sessionStartTime.toISOString(),
      currentTime: now.toISOString(),
    };
  }
}
