export interface LeagueMenuItem {
  id: number;
  name: string;
  slug: string;
  activeEventsCount: number;
}

export interface CountryMenuItem {
  id: number;
  name: string;
  code: string; // ISO 2-letter
  flagIcon: string;
  leagues: LeagueMenuItem[];
}

export class CountriesMenuBuilder {
  public static getCountriesMenu(_lang: string = 'eng'): CountryMenuItem[] {
    return [
      {
        id: 1,
        name: 'England',
        code: 'GB',
        flagIcon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
        leagues: [
          { id: 101, name: 'Premier League', slug: 'premier-league', activeEventsCount: 10 },
          { id: 102, name: 'Championship', slug: 'championship', activeEventsCount: 12 },
          { id: 103, name: 'FA Cup', slug: 'fa-cup', activeEventsCount: 4 },
        ],
      },
      {
        id: 2,
        name: 'Spain',
        code: 'ES',
        flagIcon: '🇪🇸',
        leagues: [
          { id: 201, name: 'La Liga', slug: 'la-liga', activeEventsCount: 10 },
          { id: 202, name: 'Copa del Rey', slug: 'copa-del-rey', activeEventsCount: 6 },
        ],
      },
      {
        id: 3,
        name: 'Germany',
        code: 'DE',
        flagIcon: '🇩🇪',
        leagues: [
          { id: 301, name: 'Bundesliga', slug: 'bundesliga', activeEventsCount: 9 },
          { id: 302, name: 'DFB Pokal', slug: 'dfb-pokal', activeEventsCount: 4 },
        ],
      },
      {
        id: 4,
        name: 'Italy',
        code: 'IT',
        flagIcon: '🇮🇹',
        leagues: [
          { id: 401, name: 'Serie A', slug: 'serie-a', activeEventsCount: 10 },
          { id: 402, name: 'Coppa Italia', slug: 'coppa-italia', activeEventsCount: 4 },
        ],
      },
      {
        id: 5,
        name: 'International',
        code: 'INT',
        flagIcon: '🌍',
        leagues: [
          { id: 501, name: 'UEFA Champions League', slug: 'champions-league', activeEventsCount: 8 },
          { id: 502, name: 'UEFA Europa League', slug: 'europa-league', activeEventsCount: 12 },
        ],
      },
    ];
  }
}
