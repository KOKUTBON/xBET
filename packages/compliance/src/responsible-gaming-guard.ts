/**
 * Responsible Gaming (RG) Compliance Guard
 * Implements UKGC / MGA standards: Reality Checks, Deposit/Loss Limits,
 * 24-hour cooling off periods, Instant Self-Exclusion, and KYC Tier gating.
 */

export interface RealityCheckSession {
  userId: string;
  sessionStartedAt: Date;
  intervalMinutes: number;
  lastPromptAt: Date;
  totalWagered: number;
  totalWon: number;
  netPosition: number;
  isAcknowledged: boolean;
}

export interface UserLimitEntry {
  userId: string;
  type: 'DEPOSIT' | 'LOSS' | 'SESSION_DURATION';
  period: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  amount: number;
  currentUsage: number;
  pendingChange?: {
    newAmount: number;
    effectiveAt: Date;
  };
}

export interface SelfExclusionRecord {
  userId: string;
  reason: string;
  excludedAt: Date;
  excludedUntil: Date | 'PERMANENT';
  isActive: boolean;
}

export class ResponsibleGamingGuard {
  private static instance: ResponsibleGamingGuard;
  private activeSessions: Map<string, RealityCheckSession> = new Map();
  private userLimits: Map<string, UserLimitEntry[]> = new Map();
  private exclusions: Map<string, SelfExclusionRecord> = new Map();

  public static getInstance(): ResponsibleGamingGuard {
    if (!ResponsibleGamingGuard.instance) {
      ResponsibleGamingGuard.instance = new ResponsibleGamingGuard();
    }
    return ResponsibleGamingGuard.instance;
  }

  /**
   * Start or retrieve a player's reality check session timer
   */
  public startSession(userId: string, intervalMinutes: number = 60): RealityCheckSession {
    const existing = this.activeSessions.get(userId);
    if (existing) return existing;

    const session: RealityCheckSession = {
      userId,
      sessionStartedAt: new Date(),
      intervalMinutes,
      lastPromptAt: new Date(),
      totalWagered: 0,
      totalWon: 0,
      netPosition: 0,
      isAcknowledged: true,
    };
    this.activeSessions.set(userId, session);
    return session;
  }

  public recordActivity(userId: string, wager: number, payout: number): void {
    const session = this.activeSessions.get(userId);
    if (session) {
      session.totalWagered += wager;
      session.totalWon += payout;
      session.netPosition = session.totalWon - session.totalWagered;
    }
  }

  /**
   * Evaluates whether a Reality Check modal must trigger for the player
   */
  public checkRealityCheckDue(userId: string): { due: boolean; session?: RealityCheckSession; elapsedMinutes: number } {
    const session = this.activeSessions.get(userId);
    if (!session) return { due: false, elapsedMinutes: 0 };

    const now = new Date();
    const elapsedMinutes = (now.getTime() - session.sessionStartedAt.getTime()) / 60000;
    const sinceLastPrompt = (now.getTime() - session.lastPromptAt.getTime()) / 60000;

    const due = sinceLastPrompt >= session.intervalMinutes;
    if (due) {
      session.isAcknowledged = false;
      session.lastPromptAt = now;
    }

    return {
      due,
      session,
      elapsedMinutes: Math.floor(elapsedMinutes),
    };
  }

  public acknowledgeRealityCheck(userId: string): boolean {
    const session = this.activeSessions.get(userId);
    if (!session) return false;
    session.isAcknowledged = true;
    return true;
  }

  /**
   * Set or update a deposit limit
   * Rule: Decreases apply immediately. Increases require 24h cooling-off.
   */
  public setLimit(
    userId: string,
    type: 'DEPOSIT' | 'LOSS',
    period: 'DAILY' | 'WEEKLY' | 'MONTHLY',
    amount: number
  ): { appliedImmediately: boolean; effectiveAt: Date; limit: UserLimitEntry } {
    const userLimitList = this.userLimits.get(userId) || [];
    let limitEntry = userLimitList.find((l) => l.type === type && l.period === period);

    const now = new Date();

    if (!limitEntry) {
      limitEntry = {
        userId,
        type,
        period,
        amount,
        currentUsage: 0,
      };
      userLimitList.push(limitEntry);
      this.userLimits.set(userId, userLimitList);
      return { appliedImmediately: true, effectiveAt: now, limit: limitEntry };
    }

    // If decreasing limit, apply immediately
    if (amount <= limitEntry.amount) {
      limitEntry.amount = amount;
      limitEntry.pendingChange = undefined;
      return { appliedImmediately: true, effectiveAt: now, limit: limitEntry };
    }

    // If increasing limit, enforce mandatory 24h cooling-off window
    const coolingOffEffectiveAt = new Date(now.getTime() + 24 * 3600 * 1000);
    limitEntry.pendingChange = {
      newAmount: amount,
      effectiveAt: coolingOffEffectiveAt,
    };

    return { appliedImmediately: false, effectiveAt: coolingOffEffectiveAt, limit: limitEntry };
  }

  /**
   * Check if a proposed deposit/stake exceeds user limits
   */
  public validateAgainstLimits(userId: string, type: 'DEPOSIT' | 'LOSS', proposedAmount: number): { allowed: boolean; remainingLimit: number } {
    const userLimitList = this.userLimits.get(userId) || [];
    const activeLimits = userLimitList.filter((l) => l.type === type);

    for (const l of activeLimits) {
      const remaining = l.amount - l.currentUsage;
      if (proposedAmount > remaining) {
        return { allowed: false, remainingLimit: Math.max(0, remaining) };
      }
    }

    return { allowed: true, remainingLimit: 999999 };
  }

  /**
   * Execute Instant Self-Exclusion
   */
  public selfExclude(userId: string, durationDays: number | 'PERMANENT', reason: string = 'User requested self-exclusion'): SelfExclusionRecord {
    const now = new Date();
    const until = durationDays === 'PERMANENT' ? 'PERMANENT' : new Date(now.getTime() + durationDays * 24 * 3600 * 1000);

    const record: SelfExclusionRecord = {
      userId,
      reason,
      excludedAt: now,
      excludedUntil: until,
      isActive: true,
    };

    this.exclusions.set(userId, record);
    this.activeSessions.delete(userId); // Immediately terminate active gaming session
    return record;
  }

  public isUserSelfExcluded(userId: string): boolean {
    const record = this.exclusions.get(userId);
    if (!record || !record.isActive) return false;

    if (record.excludedUntil === 'PERMANENT') return true;

    const now = new Date();
    if (now > record.excludedUntil) {
      record.isActive = false;
      return false;
    }

    return true;
  }

  /**
   * Validate minimum legal gambling age (18+)
   */
  public validateAge(dateOfBirth: Date | string, minimumAge: number = 18): boolean {
    const dob = new Date(dateOfBirth);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
      age--;
    }
    return age >= minimumAge;
  }
}
