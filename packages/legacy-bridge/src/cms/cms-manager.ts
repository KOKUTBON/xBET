import { randomUUID } from 'crypto';
import {
  BannerZone,
  MenuZone,
  NewsCategory,
} from './cms-types.ts';
import type {
  BannerRecord,
  NewsArticleRecord,
  NewsTranslation,
  SportRuleRecord,
  MenuItemRecord,
  MenuNode,
  CmsPageRecord,
  PlatformSettings,
} from './cms-types.ts';

export class CmsManager {
  private static instance: CmsManager;
  private banners: Map<string, BannerRecord> = new Map();
  private newsArticles: Map<string, NewsArticleRecord> = new Map();
  private sportRules: Map<string, SportRuleRecord> = new Map();
  private menuItems: Map<string, MenuItemRecord> = new Map();
  private cmsPages: Map<string, CmsPageRecord> = new Map(); // key = `${slug}_${locale}`
  private settings: PlatformSettings;

  private constructor() {
    this.settings = {
      siteName: 'XBET',
      contactEmail: 'support@xbet.local',
      supportPhone: '+44 8000 288 365',
      defaultCurrency: 'USD',
      defaultLocale: 'eng',
      maxTicketStake: 50000.0,
      maxTicketWinning: 250000.0,
      serviceFeePercentage: 0.0,
      isMaintenanceMode: false,
      minDeposit: 10.0,
      minWithdraw: 20.0,
    };

    this.seedDefaults();
  }

  public static getInstance(): CmsManager {
    if (!CmsManager.instance) {
      CmsManager.instance = new CmsManager();
    }
    return CmsManager.instance;
  }

  // --------------------------------------------------------------------------
  // Banner Management
  // --------------------------------------------------------------------------
  public createBanner(params: {
    title: string;
    subtitle?: string;
    imageUrl: string;
    targetUrl: string;
    ctaText?: string;
    zone: BannerZone;
    locale?: string;
    sortOrder?: number;
    startsAt?: Date;
    endsAt?: Date;
  }): BannerRecord {
    const id = `bnr_${randomUUID().slice(0, 8)}`;
    const banner: BannerRecord = {
      id,
      title: params.title,
      subtitle: params.subtitle,
      imageUrl: params.imageUrl,
      targetUrl: params.targetUrl,
      ctaText: params.ctaText || 'Bet Now',
      zone: params.zone,
      locale: params.locale || 'all',
      sortOrder: params.sortOrder || 0,
      isActive: true,
      startsAt: params.startsAt,
      endsAt: params.endsAt,
      clicksCount: 0,
      createdAt: new Date(),
    };

    this.banners.set(id, banner);
    console.log(`[CMS:Banner] Created Banner '${banner.title}' for Zone [${banner.zone}] (Locale: ${banner.locale})`);
    return banner;
  }

  public trackSlideClick(id: string): boolean {
    const banner = this.banners.get(id);
    if (banner) {
      banner.clicksCount++;
      return true;
    }
    return false;
  }

  public getActiveBanners(zone?: BannerZone, locale: string = 'eng'): BannerRecord[] {
    const now = new Date();
    const result: BannerRecord[] = [];

    for (const b of this.banners.values()) {
      if (!b.isActive) continue;
      if (zone && b.zone !== zone) continue;
      if (b.locale !== 'all' && b.locale !== locale) continue;
      if (b.startsAt && now < b.startsAt) continue;
      if (b.endsAt && now > b.endsAt) continue;

      result.push(b);
    }

    return result.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  public deleteBanner(id: string): boolean {
    return this.banners.delete(id);
  }

  // --------------------------------------------------------------------------
  // News Articles CMS (CakePHP NewsController & News.php)
  // --------------------------------------------------------------------------
  public createNewsArticle(params: {
    slug: string;
    category: NewsCategory;
    featuredImageUrl?: string;
    translations: Record<string, NewsTranslation>;
    status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  }): NewsArticleRecord {
    const id = `news_${randomUUID().slice(0, 8)}`;
    const isPublished = (params.status || 'PUBLISHED') === 'PUBLISHED';
    const article: NewsArticleRecord = {
      id,
      slug: params.slug.toLowerCase(),
      category: params.category,
      featuredImageUrl: params.featuredImageUrl,
      translations: params.translations,
      status: params.status || 'PUBLISHED',
      viewsCount: 0,
      publishedAt: isPublished ? new Date() : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.newsArticles.set(id, article);
    console.log(`[CMS:News] Created News Article /news/${article.slug} [Category: ${article.category}]`);
    return article;
  }

  public getPublishedNews(locale: string = 'eng', category?: NewsCategory): Array<NewsArticleRecord & { title: string; summary: string; contentHtml: string }> {
    const result: Array<NewsArticleRecord & { title: string; summary: string; contentHtml: string }> = [];

    for (const a of this.newsArticles.values()) {
      if (a.status !== 'PUBLISHED') continue;
      if (category && a.category !== category) continue;

      const translation = a.translations[locale] || a.translations['eng'] || Object.values(a.translations)[0];
      if (translation) {
        result.push({
          ...a,
          title: translation.title,
          summary: translation.summary,
          contentHtml: translation.contentHtml,
        });
      }
    }

    return result.sort((a, b) => (b.publishedAt?.getTime() || 0) - (a.publishedAt?.getTime() || 0));
  }

  public getNewsBySlug(slug: string, locale: string = 'eng'): (NewsArticleRecord & { title: string; summary: string; contentHtml: string }) | undefined {
    const cleanSlug = slug.toLowerCase();
    for (const a of this.newsArticles.values()) {
      if (a.slug === cleanSlug && a.status === 'PUBLISHED') {
        const translation = a.translations[locale] || a.translations['eng'] || Object.values(a.translations)[0];
        if (translation) {
          return {
            ...a,
            title: translation.title,
            summary: translation.summary,
            contentHtml: translation.contentHtml,
          };
        }
      }
    }
    return undefined;
  }

  public incrementNewsViews(slug: string): boolean {
    const cleanSlug = slug.toLowerCase();
    for (const a of this.newsArticles.values()) {
      if (a.slug === cleanSlug) {
        a.viewsCount++;
        return true;
      }
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Sport Betting Rules CMS
  // --------------------------------------------------------------------------
  public createSportRule(params: {
    sportId: string;
    sportName: string;
    category?: string;
    title: string;
    content: string;
    locale?: string;
  }): SportRuleRecord {
    const id = `rule_${randomUUID().slice(0, 8)}`;
    const rule: SportRuleRecord = {
      id,
      sportId: params.sportId.toLowerCase(),
      sportName: params.sportName,
      category: params.category || 'General Rules',
      title: params.title,
      content: params.content,
      locale: params.locale || 'eng',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sportRules.set(id, rule);
    console.log(`[CMS:Rules] Created Rule '${rule.title}' for ${rule.sportName} (${rule.locale})`);
    return rule;
  }

  public getSportRules(sportId?: string, locale: string = 'eng'): SportRuleRecord[] {
    const result: SportRuleRecord[] = [];
    for (const r of this.sportRules.values()) {
      if (sportId && r.sportId !== sportId.toLowerCase()) continue;
      if (r.locale === locale || r.locale === 'all') {
        result.push(r);
      }
    }
    return result;
  }

  public searchSportRules(query: string, locale: string = 'eng'): SportRuleRecord[] {
    const cleanQuery = query.toLowerCase();
    const result: SportRuleRecord[] = [];

    for (const r of this.sportRules.values()) {
      if (r.locale !== locale && r.locale !== 'all') continue;

      if (
        r.title.toLowerCase().includes(cleanQuery) ||
        r.content.toLowerCase().includes(cleanQuery) ||
        r.sportName.toLowerCase().includes(cleanQuery)
      ) {
        result.push(r);
      }
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // Dynamic Navigation Menus
  // --------------------------------------------------------------------------
  public createMenuItem(params: {
    zone: MenuZone;
    parentId?: string | null;
    title: string;
    localizedTitles?: Record<string, string>;
    url: string;
    icon?: string;
    sortOrder?: number;
    requiresAuth?: boolean;
    openInNewTab?: boolean;
    locale?: string;
  }): MenuItemRecord {
    const id = `menu_${randomUUID().slice(0, 8)}`;
    const item: MenuItemRecord = {
      id,
      parentId: params.parentId || null,
      zone: params.zone,
      title: params.title,
      localizedTitles: params.localizedTitles || { eng: params.title },
      url: params.url,
      icon: params.icon,
      sortOrder: params.sortOrder || 0,
      requiresAuth: params.requiresAuth || false,
      openInNewTab: params.openInNewTab || false,
      locale: params.locale || 'all',
      isActive: true,
    };

    this.menuItems.set(id, item);
    return item;
  }

  public getMenuTree(zone: MenuZone, isAuthenticated: boolean = false, locale: string = 'eng'): MenuNode[] {
    const allItems: MenuItemRecord[] = [];
    for (const m of this.menuItems.values()) {
      if (!m.isActive || m.zone !== zone) continue;
      if (m.locale !== 'all' && m.locale !== locale) continue;
      if (m.requiresAuth && !isAuthenticated) continue;

      const localizedTitle = m.localizedTitles?.[locale] || m.localizedTitles?.['eng'] || m.title;
      allItems.push({ ...m, title: localizedTitle });
    }

    allItems.sort((a, b) => a.sortOrder - b.sortOrder);

    // Build hierarchy
    const itemMap = new Map<string, MenuNode>();
    const rootNodes: MenuNode[] = [];

    for (const item of allItems) {
      itemMap.set(item.id, { ...item, children: [] });
    }

    for (const item of allItems) {
      const node = itemMap.get(item.id)!;
      if (item.parentId && itemMap.has(item.parentId)) {
        itemMap.get(item.parentId)!.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }

    return rootNodes;
  }

  public getMenu(zone: MenuZone, isAuthenticated: boolean = false, locale: string = 'eng'): MenuItemRecord[] {
    const items: MenuItemRecord[] = [];

    for (const m of this.menuItems.values()) {
      if (!m.isActive || m.zone !== zone) continue;
      if (m.locale !== 'all' && m.locale !== locale) continue;
      if (m.requiresAuth && !isAuthenticated) continue;

      const localizedTitle = m.localizedTitles?.[locale] || m.localizedTitles?.['eng'] || m.title;
      items.push({ ...m, title: localizedTitle });
    }

    return items.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // --------------------------------------------------------------------------
  // CMS Content Pages (Terms, Privacy, FAQ, Responsible Gambling)
  // --------------------------------------------------------------------------
  public createOrUpdatePage(params: {
    slug: string;
    title: string;
    contentHtml: string;
    locale?: string;
    status?: 'DRAFT' | 'PUBLISHED';
    metaTitle?: string;
    metaDescription?: string;
  }): CmsPageRecord {
    const locale = params.locale || 'eng';
    const key = `${params.slug.toLowerCase()}_${locale}`;
    const existing = this.cmsPages.get(key);

    const isPublished = (params.status || 'PUBLISHED') === 'PUBLISHED';
    const page: CmsPageRecord = {
      id: existing ? existing.id : `page_${randomUUID().slice(0, 8)}`,
      slug: params.slug.toLowerCase(),
      title: params.title,
      contentHtml: params.contentHtml,
      locale,
      status: params.status || 'PUBLISHED',
      metaTitle: params.metaTitle || params.title,
      metaDescription: params.metaDescription,
      publishedAt: isPublished ? (existing?.publishedAt || new Date()) : null,
      updatedAt: new Date(),
    };

    this.cmsPages.set(key, page);
    console.log(`[CMS:Page] Saved Page /${page.slug} [${page.locale}] (Status: ${page.status})`);
    return page;
  }

  public getPageBySlug(slug: string, locale: string = 'eng'): CmsPageRecord | undefined {
    const key = `${slug.toLowerCase()}_${locale}`;
    const page = this.cmsPages.get(key);
    if (page && page.status === 'PUBLISHED') return page;

    // Fallback to English
    if (locale !== 'eng') {
      const fallbackKey = `${slug.toLowerCase()}_eng`;
      const fallbackPage = this.cmsPages.get(fallbackKey);
      if (fallbackPage && fallbackPage.status === 'PUBLISHED') return fallbackPage;
    }
    return undefined;
  }

  public getPublishedPages(locale: string = 'eng'): CmsPageRecord[] {
    const result: CmsPageRecord[] = [];
    for (const p of this.cmsPages.values()) {
      if (p.status === 'PUBLISHED' && (p.locale === locale || p.locale === 'eng')) {
        result.push(p);
      }
    }
    return result;
  }

  // --------------------------------------------------------------------------
  // Platform Settings
  // --------------------------------------------------------------------------
  public getSettings(): PlatformSettings {
    return { ...this.settings };
  }

  public updateSettings(partial: Partial<PlatformSettings>): PlatformSettings {
    this.settings = {
      ...this.settings,
      ...partial,
    };
    console.log(`[CMS:Settings] Updated platform configuration (SiteName: ${this.settings.siteName})`);
    return { ...this.settings };
  }

  // --------------------------------------------------------------------------
  // Initial Defaults Seeding
  // --------------------------------------------------------------------------
  private seedDefaults(): void {
    // 1. Promotional Banners
    this.createBanner({
      title: 'UEFA Champions League Final Offer',
      subtitle: '100% Deposit Match up to $200 with Promo Code WELCOME100',
      imageUrl: '/theme/Design/img/banners/home-banner.jpg',
      targetUrl: '/sports/event/ucl-final',
      ctaText: 'Bet Now',
      zone: BannerZone.HOME_MAIN,
      sortOrder: 1,
    });

    this.createBanner({
      title: 'Live Casino Golden Blackjack',
      subtitle: 'Play with Real Live Dealers 24/7',
      imageUrl: '/theme/Design/img/live-casino/skybanner2.jpg',
      targetUrl: '/casino/live-tables',
      ctaText: 'Play Live',
      zone: BannerZone.LIVE_CASINO,
      sortOrder: 1,
    });

    // 2. Sport Rules
    this.createSportRule({
      sportId: 'soccer',
      sportName: 'Soccer / Football',
      category: 'Match Settlement',
      title: '90-Minute Regulation Time Rule',
      content: 'All soccer match markets are settled on the basis of 90 minutes play (also referred to as Full Time). This includes normal injury and stoppage time added by the referee, but does not include Extra Time or Penalty Shootouts unless specifically stated.',
    });

    this.createSportRule({
      sportId: 'tennis',
      sportName: 'Tennis',
      category: 'Retirements & Walkovers',
      title: 'Tennis Player Retirement Rule',
      content: 'In the event of a tennis match starting but not being completed (due to player injury or retirement), all match winner bets stand provided at least one full set has been completed. Otherwise, bets are declared VOID.',
    });

    this.createSportRule({
      sportId: 'basketball',
      sportName: 'Basketball',
      category: 'Overtime Inclusion',
      title: 'Overtime Rules in Basketball Markets',
      content: 'All basketball markets include Overtime unless explicitly specified as 4th Quarter Only or Regular Time Only (e.g. 1X2 market).',
    });

    // 3. Navigation Menus
    this.createMenuItem({ zone: MenuZone.HEADER, title: 'Sports', url: '/sports', sortOrder: 1 });
    this.createMenuItem({ zone: MenuZone.HEADER, title: 'In-Play Live', url: '/live-betting', sortOrder: 2 });
    this.createMenuItem({ zone: MenuZone.HEADER, title: 'Casino', url: '/casino', sortOrder: 3 });
    this.createMenuItem({ zone: MenuZone.HEADER, title: 'Virtual Sports', url: '/virtualsports', sortOrder: 4 });
    this.createMenuItem({ zone: MenuZone.HEADER, title: 'My Account', url: '/user/profile', requiresAuth: true, sortOrder: 5 });

    this.createMenuItem({ zone: MenuZone.FOOTER, title: 'Terms & Conditions', url: '/pages/terms', sortOrder: 1 });
    this.createMenuItem({ zone: MenuZone.FOOTER, title: 'Responsible Gambling', url: '/pages/responsible-gambling', sortOrder: 2 });
    this.createMenuItem({ zone: MenuZone.FOOTER, title: 'Privacy Policy', url: '/pages/privacy', sortOrder: 3 });
    this.createMenuItem({ zone: MenuZone.FOOTER, title: 'Betting Rules', url: '/pages/rules', sortOrder: 4 });

    // 4. Standard CMS Pages
    this.createOrUpdatePage({
      slug: 'terms',
      title: 'General Terms and Conditions',
      contentHtml: '<h1>Terms and Conditions</h1><p>Welcome to XBET. By opening an account, you agree to adhere to our wagering and security policies...</p>',
      metaTitle: 'Terms & Conditions | XBET',
      metaDescription: 'Read the general terms, conditions, and betting regulations for XBET.',
    });

    this.createOrUpdatePage({
      slug: 'responsible-gambling',
      title: 'Responsible Gambling Policy',
      contentHtml: '<h1>Responsible Gambling</h1><p>We are dedicated to supporting responsible betting. Set deposit limits, loss limits, and self-exclusion periods...</p>',
      metaTitle: 'Responsible Gambling | XBET',
      metaDescription: 'Learn about our player protection tools, deposit limits, and self-exclusion.',
    });

    // 5. News Articles
    this.createNewsArticle({
      slug: 'champions-league-preview-2026',
      category: NewsCategory.FOOTBALL,
      featuredImageUrl: '/theme/Design/img/news/ucl-preview.jpg',
      translations: {
        eng: {
          locale: 'eng',
          title: 'Champions League Quarter-Finals: Tactical Breakdown & Form Guide',
          summary: 'An in-depth statistical preview of the upcoming European blockbuster matches.',
          contentHtml: '<p>The Champions League quarter-finals are set to deliver elite football drama...</p>',
        },
        spa: {
          locale: 'spa',
          title: 'Cuartos de Champions League: Análisis Táctico y Estadísticas',
          summary: 'Una previa estadística detallada de los próximos partidos europeos.',
          contentHtml: '<p>Los cuartos de final de la Champions League prometen un espectáculo emocionante...</p>',
        },
      },
    });

    this.createNewsArticle({
      slug: 'live-casino-golden-blackjack-launch',
      category: NewsCategory.CASINO,
      featuredImageUrl: '/theme/Design/img/news/blackjack-launch.jpg',
      translations: {
        eng: {
          locale: 'eng',
          title: 'New Live Golden Blackjack Tables Now Open with 99.5% RTP',
          summary: 'Experience real-time live dealers streamed in ultra-HD 60fps.',
          contentHtml: '<p>Our upgraded live dealer studio introduces high-roller Blackjack tables with interactive side bets...</p>',
        },
      },
    });
  }
}
