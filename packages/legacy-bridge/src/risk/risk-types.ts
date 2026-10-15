/**
 * Advanced Risk Management & Fraud Detection Types & Contracts
 */

export const PlayerRiskProfile = {
  RECREATIONAL: 'RECREATIONAL',
  VIP_HIGH_ROLLER: 'VIP_HIGH_ROLLER',
  SHARP_PUNTER: 'SHARP_PUNTER',
  BONUS_ABUSER: 'BONUS_ABUSER',
  SUSPENDED: 'SUSPENDED',
} as const;
export type PlayerRiskProfile = (typeof PlayerRiskProfile)[keyof typeof PlayerRiskProfile];

export const RiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const RiskFlagType = {
  MAX_STAKE_EXCEEDED: 'MAX_STAKE_EXCEEDED',
  MAX_WIN_CAP_EXCEEDED: 'MAX_WIN_CAP_EXCEEDED',
  HIGH_LIABILITY_EXPOSURE: 'HIGH_LIABILITY_EXPOSURE',
  BET_VELOCITY_EXCEEDED: 'BET_VELOCITY_EXCEEDED',
  MULTI_ACCOUNTING_COLLUSION: 'MULTI_ACCOUNTING_COLLUSION',
  SHARP_STAKE_THROTTLED: 'SHARP_STAKE_THROTTLED',
  BONUS_ABUSE_DETECTED: 'BONUS_ABUSE_DETECTED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
} as const;
export type RiskFlagType = (typeof RiskFlagType)[keyof typeof RiskFlagType];

export interface RiskEvaluationResult {
  allowed: boolean;
  riskScore: number; // 0 (safest) to 100 (highest risk)
  flags: RiskFlagType[];
  adjustedMaxStake?: number;
  rejectionReason?: string;
}

export interface LiabilityRecord {
  fixtureId: string;
  fixtureName: string;
  marketName: string;
  selectionName: string;
  totalStake: number;
  totalPotentialPayout: number;
  maxLiabilityLimit: number;
  currentExposurePercentage: number; // (totalPotentialPayout / maxLiabilityLimit) * 100
}

export interface FraudAlert {
  id: string;
  userId: string;
  riskLevel: RiskLevel;
  title: string;
  description: string;
  flags: RiskFlagType[];
  ipAddress?: string;
  metadata?: Record<string, unknown>;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date | null;
  createdAt: Date;
}

export interface RiskEngineConfig {
  defaultMaxStake: number;
  defaultMaxWin: number;
  defaultMaxFixtureLiability: number;
  velocityWindowSeconds: number;
  maxBetsPerWindow: number;
  collusionWindowSeconds: number;
  sharpStakeMultiplier: number; // e.g. 0.20 (sharp punters limited to 20% max stake)
}
