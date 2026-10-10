import { LocaleManager } from '../i18n/locale-manager.ts';
import type { SupportedLocale } from '../i18n/locale-manager.ts';
import { SportsMenuBuilder } from '../navigation/sports-menu.ts';
import { CountriesMenuBuilder } from '../navigation/countries-menu.ts';

export interface RouteMatchResult {
  language: SupportedLocale;
  plugin: string | null;
  controller: string;
  action: string;
  admin?: boolean;
  params: Record<string, string>;
  isApi: boolean;
}

export class LegacyRouter {
  private static i18n = LocaleManager.getInstance();

  public static matchRoute(pathname: string): RouteMatchResult | null {
    // Normalize path
    const cleanPath = pathname.replace(/^\/+|\/+$/g, '');
    const segments = cleanPath ? cleanPath.split('/') : [];

    // Language prefix extraction
    let language: SupportedLocale = 'eng';
    let pathSegments = segments;

    if (segments.length > 0 && /^[a-z]{3}$/i.test(segments[0])) {
      language = segments[0].toLowerCase() as any;
      pathSegments = segments.slice(1);
    }

    const subPath = pathSegments.join('/');

    // 1. Root / Home
    if (subPath === '') {
      return { language, plugin: 'content', controller: 'pages', action: 'main', params: {}, isApi: false };
    }

    // 2. Admin URL: admin321
    if (subPath === 'admin321' || subPath.startsWith('admin321/')) {
      return { language, plugin: null, controller: 'users', action: 'admin_login', admin: true, params: {}, isApi: false };
    }

    // 3. Navigation AJAX Menus
    if (subPath === 'sports/getSportsMenu2' || subPath === 'getSportsMenu') {
      return { language, plugin: null, controller: 'sports', action: 'getSportsMenu2', params: {}, isApi: true };
    }

    if (subPath === 'getCountriesMenu') {
      return { language, plugin: null, controller: 'countries', action: 'getCountriesMenu', params: {}, isApi: true };
    }

    // 4. Live Betting (In-Play)
    if (subPath === 'live-betting' || subPath === 'live') {
      return { language, plugin: null, controller: 'live', action: 'display_sports', params: {}, isApi: false };
    }

    if (subPath.startsWith('live-betting/event/') || subPath.startsWith('live/event/')) {
      const id = pathSegments[2] || '';
      return { language, plugin: null, controller: 'live', action: 'display_event', params: { id }, isApi: false };
    }

    // 5. Sportsbook Pre-match
    if (subPath === 'sports' || subPath.startsWith('sports/')) {
      const sportSlug = pathSegments[1] || '';
      return { language, plugin: null, controller: 'sports', action: 'display', params: { sport: sportSlug }, isApi: false };
    }

    // 6. Casino & Games
    if (subPath === 'casino') {
      return { language, plugin: 'Casino', controller: 'games', action: 'index', params: {}, isApi: false };
    }

    if (subPath.startsWith('casino/games/')) {
      const gameSlug = pathSegments[2] || '';
      return { language, plugin: 'Casino', controller: 'games', action: 'play', params: { game: gameSlug }, isApi: false };
    }

    // 7. Virtual Sports
    if (subPath === 'virtualsports' || subPath.startsWith('virtualsports/')) {
      return { language, plugin: 'Virtualsports', controller: 'virtualsports', action: 'index', params: {}, isApi: false };
    }

    // 8. Tickets (Placement, Print, Cashout)
    if (subPath === 'tickets/add') {
      return { language, plugin: null, controller: 'tickets', action: 'add', params: {}, isApi: true };
    }

    if (subPath.startsWith('tickets/print/')) {
      const id = pathSegments[2] || '';
      return { language, plugin: null, controller: 'tickets', action: 'print', params: { id }, isApi: false };
    }

    if (subPath.startsWith('tickets/cashout/')) {
      const id = pathSegments[2] || '';
      return { language, plugin: null, controller: 'tickets', action: 'cashout', params: { id }, isApi: true };
    }

    // 9. Deposits & Payments
    if (subPath === 'deposits/choose' || subPath.startsWith('deposits/')) {
      const action = pathSegments[1] || 'choose';
      return { language, plugin: 'Payments', controller: 'deposits', action, params: {}, isApi: false };
    }

    // 10. Fallback Content Pages
    if (subPath.startsWith('pages/')) {
      const page = pathSegments[1] || '';
      return { language, plugin: 'content', controller: 'pages', action: 'display', params: { page }, isApi: false };
    }

    return null;
  }

  /**
   * Dispatches and handles request matching the legacy routes
   */
  public static handleRequest(pathname: string): { status: number; contentType: string; body: unknown } {
    const match = this.matchRoute(pathname);
    if (!match) {
      return { status: 404, contentType: 'application/json', body: { error: 'Page Not Found', path: pathname } };
    }

    // Handle AJAX Navigation Menu endpoints
    if (match.controller === 'sports' && match.action === 'getSportsMenu2') {
      const menu = SportsMenuBuilder.getSportsMenu(match.language);
      return { status: 200, contentType: 'application/json', body: { sports: menu } };
    }

    if (match.controller === 'countries' && match.action === 'getCountriesMenu') {
      const menu = CountriesMenuBuilder.getCountriesMenu(match.language);
      return { status: 200, contentType: 'application/json', body: { countries: menu } };
    }

    return {
      status: 200,
      contentType: 'application/json',
      body: {
        success: true,
        route: match,
        translatedHeadings: {
          sports: this.i18n.translate('sports', match.language),
          in_play: this.i18n.translate('in_play', match.language),
          casino: this.i18n.translate('casino', match.language),
          virtual_sports: this.i18n.translate('virtual_sports', match.language),
        },
      },
    };
  }
}
