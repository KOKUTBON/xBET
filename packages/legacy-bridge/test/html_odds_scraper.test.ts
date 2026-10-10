import assert from 'node:assert';
import { HtmlOddsScraper, type ScrapedMatch } from '../src/index.ts';

console.log('===============================================================');
console.log('  🕷️  Running Headless HTML Odds Scraper & Fallback Tests      ');
console.log('===============================================================\n');

// ----------------------------------------------------------------------------
// Test 1: User-Agent Rotation & Proxy Management
// ----------------------------------------------------------------------------
console.log('[Test 1] Testing User-Agent & Proxy Rotation...');
const scraper = new HtmlOddsScraper({
  userAgentRotation: ['UA-Chrome-124', 'UA-Firefox-125', 'UA-Safari-17'],
  proxyList: ['http://proxy1:8080', 'http://proxy2:8080'],
});

const ua1 = scraper.getNextUserAgent();
const ua2 = scraper.getNextUserAgent();
const ua3 = scraper.getNextUserAgent();
const ua4 = scraper.getNextUserAgent();

assert.strictEqual(ua1, 'UA-Chrome-124');
assert.strictEqual(ua2, 'UA-Firefox-125');
assert.strictEqual(ua3, 'UA-Safari-17');
assert.strictEqual(ua4, 'UA-Chrome-124'); // Cycle back

const p1 = scraper.getNextProxy();
const p2 = scraper.getNextProxy();
const p3 = scraper.getNextProxy();
assert.strictEqual(p1, 'http://proxy1:8080');
assert.strictEqual(p2, 'http://proxy2:8080');
assert.strictEqual(p3, 'http://proxy1:8080'); // Cycle back

console.log('  ✅ Test 1 Passed: User-Agent and proxy rotation cycles cleanly.');

// ----------------------------------------------------------------------------
// Test 2: HTML Odds Parsing from External Bookmaker Grid
// ----------------------------------------------------------------------------
console.log('\n[Test 2] Testing External Bookmaker HTML Grid Parsing...');
const mockHtml = `
<div class="sportsbook-layout">
  <div class="match-card" data-id="ext-88901" data-sport="Soccer" data-live="true">
    <span class="league">UEFA Champions League</span>
    <span class="team-home">Bayern Munich</span>
    <span class="team-away">Real Madrid</span>
    <div class="odds-row">
      <button data-market="1X2" data-pick="1" data-odd="2.10">Home</button>
      <button data-market="1X2" data-pick="X" data-odd="3.60">Draw</button>
      <button data-market="1X2" data-pick="2" data-odd="3.20">Away</button>
      <button data-market="TOTALS" data-pick="Over 2.5" data-odd="1.75">Over 2.5</button>
    </div>
  </div>

  <div class="match-card" data-id="ext-88902" data-sport="Basketball">
    <span class="league">NBA</span>
    <span class="team-home">Los Angeles Lakers</span>
    <span class="team-away">Miami Heat</span>
    <div class="odds-row">
      <button data-market="MONEYLINE" data-pick="1" data-odd="1.55">Lakers</button>
      <button data-market="MONEYLINE" data-pick="2" data-odd="2.45">Heat</button>
    </div>
  </div>
</div>
`;

const parsedMatches = scraper.parseBookmakerHtml(mockHtml, 'BETCLICK_HTML');

assert.strictEqual(parsedMatches.length, 2);
const match1 = parsedMatches[0];
assert.strictEqual(match1.externalId, 'ext-88901');
assert.strictEqual(match1.homeTeam, 'Bayern Munich');
assert.strictEqual(match1.awayTeam, 'Real Madrid');
assert.strictEqual(match1.league, 'UEFA Champions League');
assert.strictEqual(match1.isInPlay, true);
assert.strictEqual(match1.odds.length, 4);
assert.strictEqual(match1.odds[0].odd, 2.10);
assert.strictEqual(match1.odds[3].selection, 'Over 2.5');

console.log(`  Parsed ${parsedMatches.length} matches with ${match1.odds.length} odds markets from HTML.`);
console.log('  ✅ Test 2 Passed: HTML match cards and odds matrix accurately extracted.');

// ----------------------------------------------------------------------------
// Test 3: Data Sanitization & Odds Boundary Validation
// ----------------------------------------------------------------------------
console.log('\n[Test 3] Testing Scraping Data Sanitization & Odds Boundaries...');
const dirtyMatches: ScrapedMatch[] = [
  {
    externalId: 'valid-1',
    source: 'TEST',
    sport: 'Soccer',
    league: 'La Liga',
    homeTeam: 'Barcelona',
    awayTeam: 'Sevilla',
    startTime: new Date(),
    isInPlay: false,
    odds: [
      { marketType: '1X2', selection: '1', odd: 1.45 },
      { marketType: '1X2', selection: 'X', odd: -5.0 }, // Corrupt: negative odd
      { marketType: '1X2', selection: '2', odd: 9999.0 }, // Corrupt: extreme anomaly
    ],
  },
  {
    externalId: 'invalid-2',
    source: 'TEST',
    sport: 'Soccer',
    league: 'La Liga',
    homeTeam: 'SameTeam',
    awayTeam: 'SameTeam', // Corrupt: home === away
    startTime: new Date(),
    isInPlay: false,
    odds: [{ marketType: '1X2', selection: '1', odd: 1.5 }],
  },
];

const cleaned = scraper.sanitizeAndValidate(dirtyMatches);
assert.strictEqual(cleaned.length, 1);
assert.strictEqual(cleaned[0].externalId, 'valid-1');
assert.strictEqual(cleaned[0].odds.length, 1); // Only 1.45 preserved
assert.strictEqual(cleaned[0].odds[0].odd, 1.45);

console.log('  ✅ Test 3 Passed: Corrupt fixtures and negative/spike odds safely rejected.');

console.log('\n===============================================================');
console.log('  🎉 All Headless HTML Scraper Tests Passed!                   ');
console.log('===============================================================');
