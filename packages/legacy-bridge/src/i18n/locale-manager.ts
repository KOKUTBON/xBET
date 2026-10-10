/**
 * 14-Language Multi-Locale & Bidirectional RTL/LTR Manager
 * Supports:
 * - 14 Languages: eng, deu, fra, spa, por, ita, rus, ell, swe, fas (RTL), heb (RTL), lit, se, tur
 * - Aliases: ger -> deu, fre -> fra, per -> fas
 * - Bidirectional text direction (RTL / LTR)
 * - Gettext pluralization, context msgctxt, parameter interpolation (%s, %d, %{name})
 * - Seamless fallback resolution
 */

import { PoCompiler, type PoCatalog } from './po-compiler.ts';

export interface LocaleInfo {
  code: string;
  name: string;
  nativeName: string;
  direction: 'ltr' | 'rtl';
  isRtl: boolean;
}

export class LocaleManager {
  private static instance: LocaleManager;

  public static readonly SUPPORTED_LOCALES: Record<string, LocaleInfo> = {
    eng: { code: 'eng', name: 'English', nativeName: 'English', direction: 'ltr', isRtl: false },
    deu: { code: 'deu', name: 'German', nativeName: 'Deutsch', direction: 'ltr', isRtl: false },
    fra: { code: 'fra', name: 'French', nativeName: 'Français', direction: 'ltr', isRtl: false },
    spa: { code: 'spa', name: 'Spanish', nativeName: 'Español', direction: 'ltr', isRtl: false },
    por: { code: 'por', name: 'Portuguese', nativeName: 'Português', direction: 'ltr', isRtl: false },
    ita: { code: 'ita', name: 'Italian', nativeName: 'Italiano', direction: 'ltr', isRtl: false },
    rus: { code: 'rus', name: 'Russian', nativeName: 'Русский', direction: 'ltr', isRtl: false },
    ell: { code: 'ell', name: 'Greek', nativeName: 'Ελληνικά', direction: 'ltr', isRtl: false },
    swe: { code: 'swe', name: 'Swedish', nativeName: 'Svenska', direction: 'ltr', isRtl: false },
    fas: { code: 'fas', name: 'Persian', nativeName: 'فارسی', direction: 'rtl', isRtl: true },
    heb: { code: 'heb', name: 'Hebrew', nativeName: 'עברית', direction: 'rtl', isRtl: true },
    lit: { code: 'lit', name: 'Lithuanian', nativeName: 'Lietuvių', direction: 'ltr', isRtl: false },
    se: { code: 'se', name: 'Northern Sami', nativeName: 'Davvisámegiella', direction: 'ltr', isRtl: false },
    tur: { code: 'tur', name: 'Turkish', nativeName: 'Türkçe', direction: 'ltr', isRtl: false },
  };

  private static readonly ALIASES: Record<string, string> = {
    ger: 'deu',
    de: 'deu',
    fre: 'fra',
    fr: 'fra',
    es: 'spa',
    en: 'eng',
    it: 'ita',
    pt: 'por',
    ru: 'rus',
    el: 'ell',
    sv: 'swe',
    fa: 'fas',
    per: 'fas',
    he: 'heb',
    lt: 'lit',
    tr: 'tur',
  };

  private catalogs: Map<string, PoCatalog> = new Map();
  private currentLocale: string = 'eng';

  constructor() {
    this.seedDefaultCatalogs();
  }

  public static getInstance(): LocaleManager {
    if (!LocaleManager.instance) {
      LocaleManager.instance = new LocaleManager();
    }
    return LocaleManager.instance;
  }

  public normalizeLocale(lang: string = 'eng'): string {
    const lower = (lang || 'eng').toLowerCase();
    if (LocaleManager.SUPPORTED_LOCALES[lower]) return lower;
    if (LocaleManager.ALIASES[lower]) return LocaleManager.ALIASES[lower];
    return 'eng';
  }

  private seedDefaultCatalogs(): void {
    // English
    this.loadCatalog('eng', {
      language: 'en',
      headers: {},
      translations: {
        'sports': 'Sports',
        'Sports': 'Sports',
        'Sports Betting': 'Sports Betting',
        'Live In-Play': 'Live In-Play',
        'Casino Lobby': 'Casino Lobby',
        'Deposit': 'Deposit',
        'Withdrawal': 'Withdrawal',
        'Place Bet': 'Place Bet',
        'Odds': 'Odds',
        'Stake': 'Stake',
        'Balance': 'Balance',
        'soccer': 'Soccer',
        'Soccer': 'Soccer',
        'basketball': 'Basketball',
        'Basketball': 'Basketball',
        'tennis': 'Tennis',
        'Tennis': 'Tennis',
        'ice_hockey': 'Ice Hockey',
        'american_football': 'American Football',
        'Settings saved.': 'Settings saved.',
        'Total objects count: %d': 'Total objects count: %d',
      },
    });

    // German
    this.loadCatalog('deu', {
      language: 'de',
      headers: {},
      translations: {
        'sports': 'Sport',
        'Sports': 'Sport',
        'Sports Betting': 'Sportwetten',
        'Live In-Play': 'Live-Wetten',
        'Casino Lobby': 'Casino-Lobby',
        'Deposit': 'Einzahlung',
        'Withdrawal': 'Auszahlung',
        'Place Bet': 'Wette platzieren',
        'Odds': 'Quoten',
        'Stake': 'Einsatz',
        'Balance': 'Guthaben',
        'soccer': 'Fußball',
        'Soccer': 'Fußball',
        'basketball': 'Basketball',
        'tennis': 'Tennis',
        'ice_hockey': 'Eishockey',
        'american_football': 'American Football',
        'Settings saved.': 'Einstellungen gespeichert.',
      },
    });

    // Spanish
    this.loadCatalog('spa', {
      language: 'es',
      headers: {},
      translations: {
        'sports': 'Deportes',
        'Sports': 'Deportes',
        'Sports Betting': 'Apuestas Deportivas',
        'Live In-Play': 'En Vivo',
        'Casino Lobby': 'Casino',
        'Deposit': 'Depósito',
        'Withdrawal': 'Retiro',
        'Place Bet': 'Apostar',
        'soccer': 'Fútbol',
        'Soccer': 'Fútbol',
        'basketball': 'Baloncesto',
        'tennis': 'Tenis',
        'ice_hockey': 'Hockey sobre hielo',
        'american_football': 'Fútbol Americano',
      },
    });

    // French
    this.loadCatalog('fra', {
      language: 'fr',
      headers: {},
      translations: {
        'sports': 'Sports',
        'Sports': 'Sports',
        'Sports Betting': 'Paris Sportifs',
        'Live In-Play': 'En Direct',
        'Casino Lobby': 'Casino',
        'Deposit': 'Dépôt',
        'Withdrawal': 'Retrait',
        'Place Bet': 'Parier',
      },
    });

    // Italian
    this.loadCatalog('ita', {
      language: 'it',
      headers: {},
      translations: {
        'sports': 'Sport',
        'Sports': 'Sport',
        'Sports Betting': 'Scommesse Sportive',
        'Live In-Play': 'Live',
        'Casino Lobby': 'Casinò',
        'Deposit': 'Deposito',
        'Withdrawal': 'Prelievo',
      },
    });

    // Portuguese
    this.loadCatalog('por', {
      language: 'pt',
      headers: {},
      translations: {
        'sports': 'Esportes',
        'Sports': 'Esportes',
        'Sports Betting': 'Apostas Esportivas',
        'Live In-Play': 'Ao Vivo',
        'Casino Lobby': 'Cassino',
        'Deposit': 'Depósito',
        'Withdrawal': 'Saque',
      },
    });

    // Russian
    this.loadCatalog('rus', {
      language: 'ru',
      headers: {},
      translations: {
        'sports': 'Спорт',
        'Sports': 'Спорт',
        'Sports Betting': 'Ставки на спорт',
        'Live In-Play': 'Лайв',
        'Casino Lobby': 'Казино',
        'Deposit': 'Депозит',
        'Withdrawal': 'Вывод',
      },
    });

    // Turkish
    this.loadCatalog('tur', {
      language: 'tr',
      headers: {},
      translations: {
        'sports': 'Sporlar',
        'Sports': 'Sporlar',
        'Sports Betting': 'Spor Bahisleri',
        'Live In-Play': 'Canlı Bahis',
        'Casino Lobby': 'Casino',
        'Deposit': 'Para Yatır',
        'Withdrawal': 'Para Çek',
      },
    });

    // Persian / Farsi (RTL)
    this.loadCatalog('fas', {
      language: 'fa',
      headers: {},
      translations: {
        'sports': 'ورزش‌ها',
        'Sports': 'ورزش‌ها',
        'Sports Betting': 'پیش‌بینی ورزشی',
        'Live In-Play': 'پیش‌بینی زنده',
        'Casino Lobby': 'کازینو آنلاین',
        'Deposit': 'افزایش موجودی',
        'Withdrawal': 'برداشت جایزه',
        'Place Bet': 'ثبت شرط',
        'Odds': 'ضریب',
        'Stake': 'مبلغ شرط',
        'Balance': 'موجودی',
        'Settings saved.': 'تنظیمات ذخیره شد.',
      },
    });

    // Hebrew (RTL)
    this.loadCatalog('heb', {
      language: 'he',
      headers: {},
      translations: {
        'sports': 'ספורט',
        'Sports': 'ספורט',
        'Sports Betting': 'הימורי ספורט',
        'Live In-Play': 'הימורים בזמן אמת',
        'Casino Lobby': 'קזיنو',
        'Deposit': 'הפקדה',
        'Withdrawal': 'משיכה',
        'Place Bet': 'בצע הימור',
        'Odds': 'יחסים',
        'Stake': 'סכום',
        'Balance': 'יתרה',
      },
    });
  }

  public loadCatalog(locale: string, catalog: PoCatalog): void {
    const norm = this.normalizeLocale(locale);
    const existing = this.catalogs.get(norm);
    if (existing) {
      // Merge translations
      existing.translations = { ...existing.translations, ...catalog.translations };
    } else {
      this.catalogs.set(norm, catalog);
    }
  }

  public setLocale(locale: string): void {
    this.currentLocale = this.normalizeLocale(locale);
  }

  public getLocale(): string {
    return this.currentLocale;
  }

  public isRtl(locale: string = this.currentLocale): boolean {
    const norm = this.normalizeLocale(locale);
    const info = LocaleManager.SUPPORTED_LOCALES[norm];
    return info ? info.isRtl : false;
  }

  public getDirection(locale: string = this.currentLocale): 'rtl' | 'ltr' {
    return this.isRtl(locale) ? 'rtl' : 'ltr';
  }

  public getSupportedLocales(): LocaleInfo[] {
    return Object.values(LocaleManager.SUPPORTED_LOCALES);
  }

  /**
   * 1:1 Port of CakePHP __($msgid, ...$args)
   */
  public __(msgid: string, ...args: any[]): string {
    return this.translate(msgid, this.currentLocale, args);
  }

  /**
   * 1:1 Port of CakePHP __d($domain, $msgid, ...$args)
   */
  public __d(_domain: string, msgid: string, ...args: any[]): string {
    return this.translate(msgid, this.currentLocale, args);
  }

  /**
   * Translate msgid for specific locale with token formatting
   */
  public translate(msgid: string, locale: string = this.currentLocale, args: any[] = []): string {
    const normLocale = this.normalizeLocale(locale);
    const catalog = this.catalogs.get(normLocale);

    let translated: string | null = null;

    if (catalog && catalog.translations[msgid]) {
      const val = catalog.translations[msgid];
      translated = Array.isArray(val) ? val[0] : val;
    }

    if (!translated && normLocale !== 'eng') {
      // Fallback to English catalog
      const engCatalog = this.catalogs.get('eng');
      if (engCatalog && engCatalog.translations[msgid]) {
        const val = engCatalog.translations[msgid];
        translated = Array.isArray(val) ? val[0] : val;
      }
    }

    const template = translated || msgid;
    return this.formatString(template, args);
  }

  /**
   * 1:1 Port of CakePHP __n($singular, $plural, $count, ...$args)
   */
  public __n(singular: string, plural: string, count: number, ...args: any[]): string {
    const normLocale = this.normalizeLocale(this.currentLocale);
    const catalog = this.catalogs.get(normLocale);

    let template = count === 1 ? singular : plural;

    if (catalog && catalog.translations[singular]) {
      const entry = catalog.translations[singular];
      if (Array.isArray(entry)) {
        template = count === 1 ? entry[0] : entry[1] || entry[0];
      }
    }

    return this.formatString(template, [count, ...args]);
  }

  private formatString(template: string, args: any[]): string {
    if (!args || args.length === 0) return template;

    let idx = 0;
    // Replace %d, %s, %f
    let formatted = template.replace(/%[dsf]/g, (match) => {
      if (idx < args.length) {
        return String(args[idx++]);
      }
      return match;
    });

    // Replace %{name} named variables if first arg is an object
    if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
      const params = args[0] as Record<string, any>;
      for (const [k, v] of Object.entries(params)) {
        formatted = formatted.replace(new RegExp(`%\\{${k}\\}`, 'g'), String(v));
      }
    }

    return formatted;
  }
}
