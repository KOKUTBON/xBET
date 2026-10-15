/**
 * Backoffice Dynamic Content & CMS Types & Contracts
 * Ported from CakePHP app/Plugin/Content/ (News, Slides, Menus, Pages)
 */

export const BannerZone = {
  HOME_MAIN: 'HOME_MAIN',
  SPORTSBOOK_HERO: 'SPORTSBOOK_HERO',
  LIVE_CASINO: 'LIVE_CASINO',
  MOBILE_SLIDER: 'MOBILE_SLIDER',
} as const;
export type BannerZone = (typeof BannerZone)[keyof typeof BannerZone];

export interface BannerRecord {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  mobileImageUrl?: string;
  targetUrl: string;
  ctaText?: string;
  zone: BannerZone;
  locale: string; // 'all', 'eng', 'spa', 'ger', etc.
  sortOrder: number;
  isActive: boolean;
  startsAt?: Date;
  endsAt?: Date;
  clicksCount: number;
  createdAt: Date;
}

export interface NewsTranslation {
  locale: string;
  title: string;
  summary: string;
  contentHtml: string;
}

export const NewsCategory = {
  FOOTBALL: 'FOOTBALL',
  TENNIS: 'TENNIS',
  BASKETBALL: 'BASKETBALL',
  CASINO: 'CASINO',
  POKER: 'POKER',
  PROMOTIONS: 'PROMOTIONS',
  COMPANY: 'COMPANY',
} as const;
export type NewsCategory = (typeof NewsCategory)[keyof typeof NewsCategory];

export interface NewsArticleRecord {
  id: string;
  slug: string;
  category: NewsCategory;
  featuredImageUrl?: string;
  translations: Record<string, NewsTranslation>; // locale -> translation
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  viewsCount: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SportRuleRecord {
  id: string;
  sportId: string;
  sportName: string;
  category: string; // e.g. 'General', 'Settlement', 'Overtime', 'Special Bets'
  title: string;
  content: string;
  locale: string;
  createdAt: Date;
  updatedAt: Date;
}

export const MenuZone = {
  HEADER: 'HEADER',
  FOOTER: 'FOOTER',
  SIDEBAR: 'SIDEBAR',
  USER_PANEL: 'USER_PANEL',
} as const;
export type MenuZone = (typeof MenuZone)[keyof typeof MenuZone];

export interface MenuItemRecord {
  id: string;
  parentId?: string | null;
  zone: MenuZone;
  title: string;
  localizedTitles?: Record<string, string>; // locale -> title
  url: string;
  icon?: string;
  sortOrder: number;
  requiresAuth: boolean;
  openInNewTab: boolean;
  locale: string;
  isActive: boolean;
}

export interface MenuNode extends MenuItemRecord {
  children: MenuNode[];
}

export interface CmsPageRecord {
  id: string;
  slug: string; // e.g. 'terms', 'privacy', 'responsible-gambling', 'faq'
  title: string;
  contentHtml: string;
  locale: string;
  status: 'DRAFT' | 'PUBLISHED';
  metaTitle?: string;
  metaDescription?: string;
  publishedAt?: Date | null;
  updatedAt: Date;
}

export interface PlatformSettings {
  siteName: string;
  contactEmail: string;
  supportPhone?: string;
  defaultCurrency: string;
  defaultLocale: string;
  maxTicketStake: number;
  maxTicketWinning: number;
  serviceFeePercentage: number;
  isMaintenanceMode: boolean;
  maintenanceMessage?: string;
  minDeposit: number;
  minWithdraw: number;
}
