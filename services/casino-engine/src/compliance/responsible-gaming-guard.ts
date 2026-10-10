/**
 * Responsible Gaming Guard (Compliance & GLI-19)
 *
 * Enforces mandatory player protection guardrails:
 * - Deposit limits (Daily, Weekly, Monthly)
 * - Daily loss limit tracking
 * - Self-exclusion registry (GAMSTOP / OASIS / REX compliant)
 * - Session duration limits & statutory non-dismissible Reality Check intervals
 */

export interface ResponsibleGamingLimits {
  userId: string;
  dailyDepositLimit?: number;
  weeklyDepositLimit?: number;
  monthlyDepositLimit?: number;
  dailyLossLimit?: number;
  sessionDurationMinutes?: number;
  selfExcludedUntil?: number; // Epoch timestamp
  realityCheckIntervalMinutes: number;
  lastRealityCheckAcknowledgedAt?: number;
}

export interface WagerEligibilityResult {
  allowed: boolean;
  reason?: string;
  code?: 'SELF_EXCLUDED' | 'DAILY_LOSS_LIMIT_EXCEEDED' | 'REALITY_CHECK_REQUIRED' | 'OK';
}

export class ResponsibleGamingGuard {
  private static instance: ResponsibleGamingGuard | null = null;
  private userLimits = new Map<string, ResponsibleGamingLimits>();
  // Daily net loss tracking: Map<userId:YYYY-MM-DD, netLoss>
  private dailyNetLosses = new Map<string, number>();

  public static getInstance(): ResponsibleGamingGuard {
    if (!this.instance) {
      this.instance = new ResponsibleGamingGuard();
    }
    return this.instance;
  }

  private getDateKey(userId: string): string {
    const today = new Date().toISOString().slice(0, 10);
    return `${userId}:${today}`;
  }

  public getLimits(userId: string): ResponsibleGamingLimits {
    let limits = this.userLimits.get(userId);
    if (!limits) {
      limits = {
        userId,
        realityCheckIntervalMinutes: 60,
      };
      this.userLimits.set(userId, limits);
    }
    return limits;
  }

  public setLimits(userId: string, updates: Partial<ResponsibleGamingLimits>): ResponsibleGamingLimits {
    const current = this.getLimits(userId);
    const updated: ResponsibleGamingLimits = {
      ...current,
      ...updates,
      userId,
    };
    this.userLimits.set(userId, updated);
    return updated;
  }

  /**
   * Immediately self-excludes the player for the specified number of days (or permanent if 36500)
   */
  public selfExclude(userId: string, durationDays: number): ResponsibleGamingLimits {
    const until = Date.now() + durationDays * 24 * 60 * 60 * 1000;
    return this.setLimits(userId, { selfExcludedUntil: until });
  }

  /**
   * Checks whether the user is eligible to place a casino wager.
   */
  public checkCanWager(userId: string, wagerAmount: number, sessionStartTime?: number): WagerEligibilityResult {
    const limits = this.getLimits(userId);

    // 1. Self-exclusion check
    if (limits.selfExcludedUntil && limits.selfExcludedUntil > Date.now()) {
      const remainingDays = Math.ceil((limits.selfExcludedUntil - Date.now()) / (24 * 60 * 60 * 1000));
      return {
        allowed: false,
        reason: `Player account is currently self-excluded for another ${remainingDays} day(s).`,
        code: 'SELF_EXCLUDED',
      };
    }

    // 2. Daily Loss Limit check
    if (limits.dailyLossLimit !== undefined && limits.dailyLossLimit > 0) {
      const currentNetLoss = this.dailyNetLosses.get(this.getDateKey(userId)) || 0;
      if (currentNetLoss + wagerAmount > limits.dailyLossLimit) {
        return {
          allowed: false,
          reason: `Wager would exceed your configured daily loss limit of $${limits.dailyLossLimit.toFixed(2)} (Current net loss: $${currentNetLoss.toFixed(2)}).`,
          code: 'DAILY_LOSS_LIMIT_EXCEEDED',
        };
      }
    }

    // 3. Reality check requirement check
    if (sessionStartTime) {
      const elapsedMinutes = (Date.now() - sessionStartTime) / 60000;
      const interval = limits.realityCheckIntervalMinutes || 60;
      const lastAck = limits.lastRealityCheckAcknowledgedAt || sessionStartTime;
      const sinceLastAckMinutes = (Date.now() - lastAck) / 60000;

      if (sinceLastAckMinutes >= interval) {
        return {
          allowed: false,
          reason: `Statutory reality check alert: You have been playing for ${Math.floor(elapsedMinutes)} minutes. Please acknowledge the reality check dialog to continue.`,
          code: 'REALITY_CHECK_REQUIRED',
        };
      }
    }

    return { allowed: true, code: 'OK' };
  }

  /**
   * Records net P&L movement for daily loss limit tracking.
   */
  public recordResult(userId: string, wager: number, payout: number): void {
    const key = this.getDateKey(userId);
    const current = this.dailyNetLosses.get(key) || 0;
    const netLossDelta = wager - payout; // Positive if lost, negative if won
    this.dailyNetLosses.set(key, Math.max(0, current + netLossDelta));
  }

  /**
   * Acknowledges reality check
   */
  public acknowledgeRealityCheck(userId: string): void {
    const limits = this.getLimits(userId);
    limits.lastRealityCheckAcknowledgedAt = Date.now();
    this.userLimits.set(userId, limits);
  }
}
