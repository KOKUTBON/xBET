/**
 * Affiliate & CPA Tracking Types & Contracts
 */

export const CommissionModel = {
  CPA: 'CPA',
  REV_SHARE: 'REV_SHARE',
  HYBRID: 'HYBRID',
} as const;
export type CommissionModel = (typeof CommissionModel)[keyof typeof CommissionModel];

export const ConversionEventType = {
  REGISTRATION: 'REGISTRATION',
  FTD: 'FTD', // First-Time Deposit
  QUALIFIED_DEPOSIT: 'QUALIFIED_DEPOSIT',
  REV_SHARE: 'REV_SHARE',
} as const;
export type ConversionEventType = (typeof ConversionEventType)[keyof typeof ConversionEventType];

export interface AffiliateAccount {
  id: string;
  name: string;
  email: string;
  apiKey: string;
  postbackUrl?: string; // e.g. https://tracker.com/postback?click_id={click_id}&payout={payout}&event={event}
  commissionModel: CommissionModel;
  cpaBounty: number; // e.g. $100 per qualified FTD
  revSharePercent: number; // e.g. 0.30 (30% NGR)
  minDepositForCpa: number; // e.g. $20 min deposit to qualify for CPA
  parentAffiliateId?: string | null; // For 2-tier sub-affiliates
  subAffiliateRevSharePercent: number; // e.g. 0.05 (5% of sub-affiliate earnings)
  balance: number;
  totalEarned: number;
  isActive: boolean;
  createdAt: Date;
}

export interface TrackingClick {
  clickId: string;
  affiliateId: string;
  campaignId?: string;
  subId1?: string;
  subId2?: string;
  subId3?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface AffiliateConversion {
  id: string;
  affiliateId: string;
  userId: string;
  clickId?: string;
  eventType: ConversionEventType;
  triggerAmount: number;
  commissionEarned: number;
  currencyCode: string;
  postbackUrlDispatched?: string;
  postbackStatus: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  createdAt: Date;
}

export interface AffiliateStats {
  affiliateId: string;
  totalClicks: number;
  totalRegistrations: number;
  totalFtds: number;
  conversionRatePercent: number; // (FTDs / Clicks) * 100
  totalCommissionEarned: number;
  currentBalance: number;
}
