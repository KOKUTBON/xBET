/**
 * Dynamic Platform Settings & Configuration Engine
 * Ported 1:1 from CakePHP Setting.php model and SettingsController.php.
 * Manages general, risk, tickets, warnings, deposit, withdrawal, and SEO settings.
 */

export interface GeneralSettings {
  siteName: string;
  siteUrl: string;
  defaultCurrency: string;
  defaultTimezone: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  itemsPerPage: number;
  contactEmail: string;
}

export interface RiskSettings {
  minStake: number;
  maxStake: number;
  maxWinningPerTicket: number;
  maxDailyWinningPerUser: number;
  minOdds: number;
  maxTotalOdds: number;
  maxCombinationsCount: number;
  maxLiabilityPerMatch: number;
  cancellationGraceWindowMinutes: number;
}

export interface CombiBoostTier {
  minLegs: number;
  maxLegs?: number;
  bonusPercent: number;
}

export interface TicketsSettings {
  enableCombiBonusBoost: boolean;
  combiBoostTiers: CombiBoostTier[];
  retailServiceFeePercent: number;
  barcodeFormat: string;
  ticketHeaderMessage: string;
  ticketFooterMessage: string;
  allowCashierCancellation: boolean;
}

export interface WarningsSettings {
  highStakeAlertThreshold: number;
  highWinningAlertThreshold: number;
  suspiciousOddsSpikeAlert: boolean;
  alertEmailRecipient: string;
}

export interface DepositSettings {
  dailyDepositLimit: number;
  weeklyDepositLimit: number;
  monthlyDepositLimit: number;
  minDepositAmount: number;
  maxDepositAmount: number;
  maxDepositsPerHour: number;
}

export interface WithdrawSettings {
  minWithdrawAmount: number;
  maxWithdrawAmount: number;
  autoApproveLimit: number;
  kycRequiredThreshold: number;
  manualReviewTriggerAmount: number;
}

export interface SeoSettings {
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  ogImage: string;
}

export interface FullPlatformSettings {
  general: GeneralSettings;
  risk: RiskSettings;
  tickets: TicketsSettings;
  warnings: WarningsSettings;
  deposits: DepositSettings;
  withdraws: WithdrawSettings;
  seo: SeoSettings;
}

export class PlatformSettingsManager {
  private static instance: PlatformSettingsManager;

  private settings: FullPlatformSettings = {
    general: {
      siteName: 'xBET Modern Platform',
      siteUrl: 'https://xbet.modern.platform',
      defaultCurrency: 'USD',
      defaultTimezone: 'UTC',
      maintenanceMode: false,
      maintenanceMessage: 'Platform undergoing scheduled maintenance. Back shortly.',
      itemsPerPage: 20,
      contactEmail: 'support@xbet.modern.platform',
    },
    risk: {
      minStake: 0.50,
      maxStake: 10000.0,
      maxWinningPerTicket: 100000.0,
      maxDailyWinningPerUser: 250000.0,
      minOdds: 1.05,
      maxTotalOdds: 10000.0,
      maxCombinationsCount: 30,
      maxLiabilityPerMatch: 50000.0,
      cancellationGraceWindowMinutes: 5,
    },
    tickets: {
      enableCombiBonusBoost: true,
      combiBoostTiers: [
        { minLegs: 4, maxLegs: 4, bonusPercent: 5.0 },
        { minLegs: 5, maxLegs: 5, bonusPercent: 7.5 },
        { minLegs: 6, maxLegs: 7, bonusPercent: 10.0 },
        { minLegs: 8, maxLegs: 9, bonusPercent: 15.0 },
        { minLegs: 10, maxLegs: 14, bonusPercent: 20.0 },
        { minLegs: 15, maxLegs: 19, bonusPercent: 50.0 },
        { minLegs: 20, bonusPercent: 100.0 },
      ],
      retailServiceFeePercent: 0.0,
      barcodeFormat: 'CODE128',
      ticketHeaderMessage: 'Thank you for playing with xBET',
      ticketFooterMessage: 'Gamble Responsibly. 18+ Only.',
      allowCashierCancellation: true,
    },
    warnings: {
      highStakeAlertThreshold: 2500.0,
      highWinningAlertThreshold: 15000.0,
      suspiciousOddsSpikeAlert: true,
      alertEmailRecipient: 'risk-desk@xbet.modern.platform',
    },
    deposits: {
      dailyDepositLimit: 50000.0,
      weeklyDepositLimit: 200000.0,
      monthlyDepositLimit: 500000.0,
      minDepositAmount: 10.0,
      maxDepositAmount: 100000.0,
      maxDepositsPerHour: 10,
    },
    withdraws: {
      minWithdrawAmount: 15.0,
      maxWithdrawAmount: 100000.0,
      autoApproveLimit: 500.0,
      kycRequiredThreshold: 2000.0,
      manualReviewTriggerAmount: 5000.0,
    },
    seo: {
      metaTitle: 'xBET - In-Play Live Sports Betting & Casino',
      metaDescription: 'Experience real-time sports betting, live in-play odds, provably fair casino, and Texas Holdem.',
      metaKeywords: 'sports betting, inplay, odds, casino, poker, live odds, xbet',
      ogImage: '/public/og-banner.jpg',
    },
  };

  private constructor() {}

  public static getInstance(): PlatformSettingsManager {
    if (!PlatformSettingsManager.instance) {
      PlatformSettingsManager.instance = new PlatformSettingsManager();
    }
    return PlatformSettingsManager.instance;
  }

  public getSettings<K extends keyof FullPlatformSettings>(category: K): FullPlatformSettings[K] {
    return { ...this.settings[category] };
  }

  public getAllSettings(): FullPlatformSettings {
    return JSON.parse(JSON.stringify(this.settings));
  }

  public updateSettings<K extends keyof FullPlatformSettings>(
    category: K,
    partial: Partial<FullPlatformSettings[K]>
  ): FullPlatformSettings[K] {
    this.settings[category] = {
      ...this.settings[category],
      ...partial,
    };
    console.log(`[PlatformSettings] Updated category '${category}' successfully.`);
    return { ...this.settings[category] };
  }

  /**
   * Calculates Combi Bonus percentage for an accumulator with given leg count
   */
  public getCombiBonusPercent(legCount: number): number {
    if (!this.settings.tickets.enableCombiBonusBoost || legCount < 4) {
      return 0.0;
    }

    const tier = this.settings.tickets.combiBoostTiers.find((t) => {
      if (t.maxLegs !== undefined) {
        return legCount >= t.minLegs && legCount <= t.maxLegs;
      }
      return legCount >= t.minLegs;
    });

    return tier ? tier.bonusPercent : 0.0;
  }

  public getMaxPayoutLimit(): number {
    return this.settings.risk.maxWinningPerTicket;
  }

  public getCancellationWindowMinutes(): number {
    return this.settings.risk.cancellationGraceWindowMinutes;
  }

  public isUnderMaintenance(): boolean {
    return this.settings.general.maintenanceMode;
  }
}
