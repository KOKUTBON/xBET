/**
 * Responsible Gaming & Player Self-Protection Types
 * Ported from CakePHP UserSettings.php and RisksController.php
 */

export interface PlayerDepositLimits {
  dailyLimit?: number | null;
  weeklyLimit?: number | null;
  monthlyLimit?: number | null;
}

export interface PlayerLossLimits {
  dailyLossLimit?: number | null;
  weeklyLossLimit?: number | null;
}

export interface PendingLimitChange {
  id: string;
  userId: string;
  limitType: 'daily' | 'weekly' | 'monthly';
  newLimit: number;
  requestedAt: Date;
  effectiveAt: Date;
  status: 'PENDING_COOL_OFF' | 'APPLIED' | 'CANCELLED';
}

export interface CoolOffRecord {
  userId: string;
  durationHours: number;
  startDate: Date;
  endDate: Date;
  reason?: string;
  isActive: boolean;
}

export interface SelfExclusionRecord {
  userId: string;
  durationMonths: number; // e.g. 6, 12, 60, or 0 for permanent
  isPermanent: boolean;
  startDate: Date;
  endDate: Date | null;
  reason?: string;
  isActive: boolean;
}

export interface RealityCheckSummary {
  userId: string;
  sessionDurationMinutes: number;
  totalBetsPlaced: number;
  totalWagered: number;
  totalWon: number;
  netProfitLoss: number;
  sessionStartTime: string;
  currentTime: string;
}

export interface PlayerProtectionProfile {
  userId: string;
  depositLimits: PlayerDepositLimits;
  lossLimits: PlayerLossLimits;
  pendingLimitChanges: PendingLimitChange[];
  activeCoolOff?: CoolOffRecord | null;
  activeSelfExclusion?: SelfExclusionRecord | null;
  realityCheckIntervalMinutes: number;
}
