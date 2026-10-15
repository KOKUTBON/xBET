/**
 * Affiliate & CPA Postback Tracking Engine
 * Manages affiliate registration, campaign click tracking, attribution,
 * CPA bounty qualification, S2S postback macro substitution, and 2-tier sub-affiliates.
 */

import { randomUUID, randomBytes } from 'crypto';
import {
  CommissionModel,
  ConversionEventType,
} from './affiliate-types.ts';
import type {
  AffiliateAccount,
  TrackingClick,
  AffiliateConversion,
  AffiliateStats,
} from './affiliate-types.ts';

export class AffiliateManager {
  private static instance: AffiliateManager;
  private affiliates: Map<string, AffiliateAccount> = new Map();
  private clicks: Map<string, TrackingClick> = new Map();
  private userAttributions: Map<string, { clickId: string; affiliateId: string; attributedAt: Date }> = new Map();
  private conversions: AffiliateConversion[] = [];

  // Postback dispatch listener (can be hooked to real HTTP client or mock spy)
  public postbackHandler: (url: string) => Promise<boolean> = async () => true;

  private constructor() {}

  public static getInstance(): AffiliateManager {
    if (!AffiliateManager.instance) {
      AffiliateManager.instance = new AffiliateManager();
    }
    return AffiliateManager.instance;
  }

  public registerAffiliate(params: {
    id?: string;
    name: string;
    email: string;
    postbackUrl?: string;
    commissionModel?: CommissionModel;
    cpaBounty?: number;
    revSharePercent?: number;
    minDepositForCpa?: number;
    parentAffiliateId?: string | null;
    subAffiliateRevSharePercent?: number;
  }): AffiliateAccount {
    const id = params.id || `aff_${randomBytes(4).toString('hex')}`;
    const apiKey = `key_${randomBytes(16).toString('hex')}`;

    const affiliate: AffiliateAccount = {
      id,
      name: params.name,
      email: params.email,
      apiKey,
      postbackUrl: params.postbackUrl,
      commissionModel: params.commissionModel || CommissionModel.CPA,
      cpaBounty: params.cpaBounty || 100.0,
      revSharePercent: params.revSharePercent || 0.30,
      minDepositForCpa: params.minDepositForCpa || 20.0,
      parentAffiliateId: params.parentAffiliateId || null,
      subAffiliateRevSharePercent: params.subAffiliateRevSharePercent || 0.05,
      balance: 0.0,
      totalEarned: 0.0,
      isActive: true,
      createdAt: new Date(),
    };

    this.affiliates.set(id, affiliate);
    console.log(`[AffiliateManager] Registered Affiliate: ${affiliate.name} (${affiliate.id}) - Model: ${affiliate.commissionModel}`);
    return affiliate;
  }

  public getAffiliate(id: string): AffiliateAccount | undefined {
    return this.affiliates.get(id);
  }

  /**
   * Records an ad campaign click and generates a unique tracking clickId
   */
  public recordClick(params: {
    affiliateId: string;
    campaignId?: string;
    subId1?: string;
    subId2?: string;
    subId3?: string;
    ipAddress?: string;
    userAgent?: string;
  }): TrackingClick {
    const affiliate = this.affiliates.get(params.affiliateId);
    if (!affiliate) throw new Error(`Affiliate ${params.affiliateId} not found`);

    const clickId = `clk_${Date.now().toString().slice(-6)}_${randomBytes(4).toString('hex')}`;
    const click: TrackingClick = {
      clickId,
      affiliateId: params.affiliateId,
      campaignId: params.campaignId,
      subId1: params.subId1,
      subId2: params.subId2,
      subId3: params.subId3,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      createdAt: new Date(),
    };

    this.clicks.set(clickId, click);
    console.log(`[AffiliateManager] Recorded Click ${clickId} for Affiliate ${params.affiliateId} (Camp: ${params.campaignId || 'direct'})`);
    return click;
  }

  /**
   * Attributes a newly registering player to a clickId
   */
  public attributeUser(userId: string, clickId: string): boolean {
    const click = this.clicks.get(clickId);
    if (!click) return false;

    this.userAttributions.set(userId, {
      clickId,
      affiliateId: click.affiliateId,
      attributedAt: new Date(),
    });

    console.log(`[AffiliateManager] Attributed User ${userId} -> Click ${clickId} (Affiliate ${click.affiliateId})`);
    return true;
  }

  /**
   * Triggered upon user registration
   */
  public async onUserRegistered(userId: string): Promise<AffiliateConversion | null> {
    const attribution = this.userAttributions.get(userId);
    if (!attribution) return null;

    const affiliate = this.affiliates.get(attribution.affiliateId);
    if (!affiliate) return null;

    const conversionId = `conv_reg_${randomBytes(6).toString('hex')}`;
    const click = this.clicks.get(attribution.clickId);

    const postbackUrl = this.buildPostbackUrl(affiliate.postbackUrl, {
      clickId: attribution.clickId,
      userId,
      event: ConversionEventType.REGISTRATION,
      amount: 0,
      payout: 0,
      currency: 'USD',
      subId1: click?.subId1,
      subId2: click?.subId2,
    });

    let postbackStatus: 'SENT' | 'FAILED' | 'SKIPPED' = 'SKIPPED';
    if (postbackUrl) {
      const ok = await this.postbackHandler(postbackUrl);
      postbackStatus = ok ? 'SENT' : 'FAILED';
    }

    const conversion: AffiliateConversion = {
      id: conversionId,
      affiliateId: affiliate.id,
      userId,
      clickId: attribution.clickId,
      eventType: ConversionEventType.REGISTRATION,
      triggerAmount: 0,
      commissionEarned: 0,
      currencyCode: 'USD',
      postbackUrlDispatched: postbackUrl,
      postbackStatus,
      createdAt: new Date(),
    };

    this.conversions.push(conversion);
    return conversion;
  }

  /**
   * Triggered upon deposit fulfillment (evaluates FTD and CPA qualification)
   */
  public async onDepositCompleted(
    userId: string,
    depositAmount: number,
    isFirstDeposit: boolean,
    currencyCode: string = 'USD'
  ): Promise<AffiliateConversion | null> {
    const attribution = this.userAttributions.get(userId);
    if (!attribution) return null;

    const affiliate = this.affiliates.get(attribution.affiliateId);
    if (!affiliate) return null;

    const click = this.clicks.get(attribution.clickId);
    let commissionEarned = 0;
    const isCpaQualified =
      isFirstDeposit &&
      (affiliate.commissionModel === CommissionModel.CPA || affiliate.commissionModel === CommissionModel.HYBRID) &&
      depositAmount >= affiliate.minDepositForCpa;

    if (isCpaQualified) {
      commissionEarned = affiliate.cpaBounty;
      affiliate.balance += commissionEarned;
      affiliate.totalEarned += commissionEarned;

      // 2-Tier Sub-affiliate override
      if (affiliate.parentAffiliateId) {
        const parentAff = this.affiliates.get(affiliate.parentAffiliateId);
        if (parentAff) {
          const override = parseFloat((commissionEarned * affiliate.subAffiliateRevSharePercent).toFixed(2));
          parentAff.balance += override;
          parentAff.totalEarned += override;
          console.log(`[AffiliateManager] 2-Tier Override: Parent ${parentAff.name} earned $${override} on sub-affiliate ${affiliate.name}`);
        }
      }
    }

    const eventType = isFirstDeposit ? ConversionEventType.FTD : ConversionEventType.QUALIFIED_DEPOSIT;
    const postbackUrl = this.buildPostbackUrl(affiliate.postbackUrl, {
      clickId: attribution.clickId,
      userId,
      event: eventType,
      amount: depositAmount,
      payout: commissionEarned,
      currency: currencyCode,
      subId1: click?.subId1,
      subId2: click?.subId2,
    });

    let postbackStatus: 'SENT' | 'FAILED' | 'SKIPPED' = 'SKIPPED';
    if (postbackUrl) {
      const ok = await this.postbackHandler(postbackUrl);
      postbackStatus = ok ? 'SENT' : 'FAILED';
    }

    const conversion: AffiliateConversion = {
      id: `conv_${eventType.toLowerCase()}_${randomBytes(6).toString('hex')}`,
      affiliateId: affiliate.id,
      userId,
      clickId: attribution.clickId,
      eventType,
      triggerAmount: depositAmount,
      commissionEarned,
      currencyCode,
      postbackUrlDispatched: postbackUrl,
      postbackStatus,
      createdAt: new Date(),
    };

    this.conversions.push(conversion);
    console.log(`[AffiliateManager] Deposit Conversion: User ${userId} ($${depositAmount}) -> Affiliate ${affiliate.name} (Earned: $${commissionEarned})`);
    return conversion;
  }

  /**
   * Calculates monthly or periodic Revenue Share on player NGR
   */
  public calculateRevShare(
    affiliateId: string,
    playerNgr: number,
    currencyCode: string = 'USD'
  ): AffiliateConversion | null {
    const affiliate = this.affiliates.get(affiliateId);
    if (!affiliate || playerNgr <= 0) return null;

    if (affiliate.commissionModel !== CommissionModel.REV_SHARE && affiliate.commissionModel !== CommissionModel.HYBRID) {
      return null;
    }

    const commissionEarned = parseFloat((playerNgr * affiliate.revSharePercent).toFixed(2));
    affiliate.balance += commissionEarned;
    affiliate.totalEarned += commissionEarned;

    const conversion: AffiliateConversion = {
      id: `conv_revshare_${randomBytes(6).toString('hex')}`,
      affiliateId: affiliate.id,
      userId: 'aggregated_ngr',
      eventType: ConversionEventType.REV_SHARE,
      triggerAmount: playerNgr,
      commissionEarned,
      currencyCode,
      postbackStatus: 'SKIPPED',
      createdAt: new Date(),
    };

    this.conversions.push(conversion);
    console.log(`[AffiliateManager] RevShare Credited to ${affiliate.name}: $${commissionEarned} (NGR: $${playerNgr} @ ${(affiliate.revSharePercent * 100)}%)`);
    return conversion;
  }

  public getAffiliateStats(affiliateId: string): AffiliateStats {
    const affiliate = this.affiliates.get(affiliateId);
    if (!affiliate) throw new Error(`Affiliate ${affiliateId} not found`);

    const clicksCount = Array.from(this.clicks.values()).filter((c) => c.affiliateId === affiliateId).length;
    const registrations = this.conversions.filter(
      (c) => c.affiliateId === affiliateId && c.eventType === ConversionEventType.REGISTRATION
    ).length;
    const ftds = this.conversions.filter(
      (c) => c.affiliateId === affiliateId && c.eventType === ConversionEventType.FTD
    ).length;

    const conversionRate = clicksCount > 0 ? parseFloat(((ftds / clicksCount) * 100).toFixed(2)) : 0.0;

    return {
      affiliateId,
      totalClicks: clicksCount,
      totalRegistrations: registrations,
      totalFtds: ftds,
      conversionRatePercent: conversionRate,
      totalCommissionEarned: parseFloat(affiliate.totalEarned.toFixed(2)),
      currentBalance: parseFloat(affiliate.balance.toFixed(2)),
    };
  }

  public getAllConversions(affiliateId?: string): AffiliateConversion[] {
    if (affiliateId) {
      return this.conversions.filter((c) => c.affiliateId === affiliateId);
    }
    return [...this.conversions];
  }

  private buildPostbackUrl(
    templateUrl?: string,
    macros?: {
      clickId?: string;
      userId?: string;
      event?: string;
      amount?: number;
      payout?: number;
      currency?: string;
      subId1?: string;
      subId2?: string;
    }
  ): string | undefined {
    if (!templateUrl) return undefined;

    let url = templateUrl;
    url = url.replace(/\{click_id\}/gi, macros?.clickId || '');
    url = url.replace(/\{user_id\}/gi, macros?.userId || '');
    url = url.replace(/\{event\}/gi, macros?.event || '');
    url = url.replace(/\{amount\}/gi, String(macros?.amount || 0));
    url = url.replace(/\{payout\}/gi, String(macros?.payout || 0));
    url = url.replace(/\{currency\}/gi, macros?.currency || 'USD');
    url = url.replace(/\{sub1\}/gi, macros?.subId1 || '');
    url = url.replace(/\{sub2\}/gi, macros?.subId2 || '');

    return url;
  }
}
