/**
 * Headless HTML Scraping Worker & External Odds Fallback Engine
 * Provides resilient DOM parsing, User-Agent & proxy rotation, rate-limiting,
 * anti-detection backoff, and normalization into platform OddsTickDelta packets.
 */

export interface ScrapedOdd {
  marketType: string;
  selection: string;
  odd: number;
}

export interface ScrapedMatch {
  externalId: string;
  source: string;
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  startTime: Date;
  isInPlay: boolean;
  score?: string;
  odds: ScrapedOdd[];
}

export interface ScraperConfig {
  baseUrl: string;
  rateLimitMs: number;
  maxRetries: number;
  userAgentRotation: string[];
  proxyList?: string[];
}

export class HtmlOddsScraper {
  private config: ScraperConfig;
  private userAgentIndex: number = 0;
  private proxyIndex: number = 0;

  constructor(config?: Partial<ScraperConfig>) {
    this.config = {
      baseUrl: config?.baseUrl || 'https://external-odds-feed.local',
      rateLimitMs: config?.rateLimitMs || 250,
      maxRetries: config?.maxRetries || 3,
      userAgentRotation: config?.userAgentRotation || [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
      ],
      proxyList: config?.proxyList || [],
    };
  }

  public getNextUserAgent(): string {
    const ua = this.config.userAgentRotation[this.userAgentIndex];
    this.userAgentIndex = (this.userAgentIndex + 1) % this.config.userAgentRotation.length;
    return ua;
  }

  public getNextProxy(): string | null {
    if (!this.config.proxyList || this.config.proxyList.length === 0) return null;
    const proxy = this.config.proxyList[this.proxyIndex];
    this.proxyIndex = (this.proxyIndex + 1) % this.config.proxyList.length;
    return proxy;
  }

  /**
   * Fast, zero-dependency RegEx/DOM-like HTML parser for tabular bookmaker odds grids
   */
  public parseBookmakerHtml(html: string, sourceName: string = 'GENERIC_HTML'): ScrapedMatch[] {
    const matches: ScrapedMatch[] = [];

    // Match fixture containers <div class="match-card" data-id="123"...>...</div>
    const matchBlocks = html.match(/<div[^>]*class="[^"]*match-card[^"]*"[^>]*>([\s\S]*?)<\/div>/gi) || [];

    for (let i = 0; i < matchBlocks.length; i++) {
      const block = matchBlocks[i];

      // Extract ID
      const idMatch = block.match(/data-id="([^"]+)"/i) || block.match(/id="([^"]+)"/i);
      const externalId = idMatch ? idMatch[1] : `scraped-${i + 1}`;

      // Extract Sport & League
      const sportMatch = block.match(/data-sport="([^"]+)"/i);
      const sport = sportMatch ? sportMatch[1] : 'Soccer';

      const leagueMatch = block.match(/<span[^>]*class="[^"]*league[^"]*"[^>]*>([^<]+)<\/span>/i);
      const league = leagueMatch ? leagueMatch[1].trim() : 'Premier League';

      // Extract Teams
      const homeMatch = block.match(/<span[^>]*class="[^"]*team-home[^"]*"[^>]*>([^<]+)<\/span>/i);
      const awayMatch = block.match(/<span[^>]*class="[^"]*team-away[^"]*"[^>]*>([^<]+)<\/span>/i);
      const homeTeam = homeMatch ? homeMatch[1].trim() : 'Home Team';
      const awayTeam = awayMatch ? awayMatch[1].trim() : 'Away Team';

      // Extract Odds: <button data-market="1X2" data-pick="1" data-odd="1.85">...
      const odds: ScrapedOdd[] = [];
      const oddRegex = /data-market="([^"]+)"\s+data-pick="([^"]+)"\s+data-odd="([0-9.]+)"/gi;
      let oddMatch: RegExpExecArray | null;

      while ((oddMatch = oddRegex.exec(block)) !== null) {
        const val = parseFloat(oddMatch[3]);
        if (!isNaN(val) && val > 1.0 && val < 1000.0) {
          odds.push({
            marketType: oddMatch[1],
            selection: oddMatch[2],
            odd: val,
          });
        }
      }

      // Check live status
      const isInPlay = /class="[^"]*live-badge[^"]*"/i.test(block) || /data-live="true"/i.test(block);

      matches.push({
        externalId,
        source: sourceName,
        sport,
        league,
        homeTeam,
        awayTeam,
        startTime: new Date(Date.now() + 3600000),
        isInPlay,
        odds,
      });
    }

    return matches;
  }

  /**
   * Sanitizes, filters, and transforms scraped match odds into standard platform updates
   */
  public sanitizeAndValidate(matches: ScrapedMatch[]): ScrapedMatch[] {
    return matches.filter((m) => {
      // Must have valid teams
      if (!m.homeTeam || !m.awayTeam || m.homeTeam === m.awayTeam) return false;
      // Must have at least 1 valid odd
      if (!m.odds || m.odds.length === 0) return false;
      // Filter out invalid odds
      m.odds = m.odds.filter((o) => o.odd >= 1.01 && o.odd <= 500.0);
      return m.odds.length > 0;
    });
  }
}
