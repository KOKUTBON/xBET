import { LocaleManager } from '../i18n/locale-manager.ts';

export interface SportsMenuItem {
  id: number;
  name: string;
  slug: string;
  icon: string;
  activeEventsCount: number;
  liveEventsCount: number;
}

export class SportsMenuBuilder {
  private static i18n = LocaleManager.getInstance();

  public static getSportsMenu(lang: string = 'eng'): SportsMenuItem[] {
    const rawSports = [
      { id: 1, key: 'soccer', slug: 'soccer', icon: '⚽', active: 48, live: 3 },
      { id: 2, key: 'basketball', slug: 'basketball', icon: '🏀', active: 22, live: 1 },
      { id: 3, key: 'tennis', slug: 'tennis', icon: '🎾', active: 15, live: 0 },
      { id: 4, key: 'ice_hockey', slug: 'ice-hockey', icon: '🏒', active: 10, live: 0 },
      { id: 5, key: 'american_football', slug: 'american-football', icon: '🏈', active: 8, live: 0 },
    ];

    return rawSports.map((s) => ({
      id: s.id,
      name: this.i18n.translate(s.key, lang),
      slug: s.slug,
      icon: s.icon,
      activeEventsCount: s.active,
      liveEventsCount: s.live,
    }));
  }
}
