/**
 * Verification Test Suite for Legacy Route Compatibility and Multi-Language Navigation
 */

import { LocaleManager } from '../src/i18n/locale-manager.ts';
import { SportsMenuBuilder } from '../src/navigation/sports-menu.ts';
import { CountriesMenuBuilder } from '../src/navigation/countries-menu.ts';
import { LegacyRouter } from '../src/router/legacy-router.ts';

async function runLegacyBridgeTests() {
  console.log('===============================================================');
  console.log('  🧪 Running Legacy Routing & Multi-Language Bridge Test Suite');
  console.log('===============================================================');

  const i18n = LocaleManager.getInstance();

  // --------------------------------------------------------------------------
  // Test 1: Multi-Language Dictionary & Normalization
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Multi-Language Locale Engine across 8 Languages...');
  const testCases = [
    { lang: 'eng', key: 'sports', expected: 'Sports' },
    { lang: 'spa', key: 'sports', expected: 'Deportes' },
    { lang: 'ger', key: 'sports', expected: 'Sport' },
    { lang: 'ita', key: 'sports', expected: 'Sport' },
    { lang: 'fre', key: 'sports', expected: 'Sports' },
    { lang: 'por', key: 'sports', expected: 'Esportes' },
    { lang: 'rus', key: 'sports', expected: 'Спорт' },
    { lang: 'tur', key: 'sports', expected: 'Sporlar' },
  ];

  for (const tc of testCases) {
    const translated = i18n.translate(tc.key, tc.lang);
    console.log(`  Locale [${tc.lang}]: "${tc.key}" -> "${translated}"`);
    if (translated !== tc.expected) {
      throw new Error(`Translation mismatch for ${tc.lang}: expected ${tc.expected}, got ${translated}`);
    }
  }
  console.log('  ✅ Test 1 Passed: All 8 languages normalized and translated accurately.');

  // --------------------------------------------------------------------------
  // Test 2: Sports Hierarchy AJAX Menu (/sports/getSportsMenu2)
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Sports AJAX Navigation Menu Generation...');
  const sportsEng = SportsMenuBuilder.getSportsMenu('eng');
  const sportsSpa = SportsMenuBuilder.getSportsMenu('spa');

  console.log(`  English Sports Menu: ${sportsEng.map((s) => s.name).join(', ')}`);
  console.log(`  Spanish Sports Menu: ${sportsSpa.map((s) => s.name).join(', ')}`);

  if (sportsEng.length < 5 || sportsEng[0].name !== 'Soccer' || sportsSpa[0].name !== 'Fútbol') {
    throw new Error('Sports menu localization failed');
  }
  console.log('  ✅ Test 2 Passed: getSportsMenu2 hierarchical payload verified.');

  // --------------------------------------------------------------------------
  // Test 3: Countries & Leagues AJAX Menu (/getCountriesMenu)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Countries & Leagues AJAX Menu...');
  const countries = CountriesMenuBuilder.getCountriesMenu('eng');
  console.log(`  Found ${countries.length} Country Regions (e.g. England with ${countries[0].leagues.length} leagues).`);
  if (countries[0].name !== 'England' || countries[0].leagues[0].name !== 'Premier League') {
    throw new Error('Countries menu structure invalid');
  }
  console.log('  ✅ Test 3 Passed: getCountriesMenu hierarchical payload verified.');

  // --------------------------------------------------------------------------
  // Test 4: Legacy Route Matching (1:1 CakePHP Routes)
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing 1:1 CakePHP URL Route Matching...');

  const routesToTest = [
    { url: '/eng/', expectedController: 'pages', expectedAction: 'main', expectedLang: 'eng' },
    { url: '/spa/sports', expectedController: 'sports', expectedAction: 'display', expectedLang: 'spa' },
    { url: '/ger/sports/getSportsMenu2', expectedController: 'sports', expectedAction: 'getSportsMenu2', expectedLang: 'ger' },
    { url: '/ita/getCountriesMenu', expectedController: 'countries', expectedAction: 'getCountriesMenu', expectedLang: 'ita' },
    { url: '/fre/live-betting', expectedController: 'live', expectedAction: 'display_sports', expectedLang: 'fre' },
    { url: '/por/live-betting/event/fix-456', expectedController: 'live', expectedAction: 'display_event', expectedLang: 'por', expectedParam: { id: 'fix-456' } },
    { url: '/rus/casino/games/blackjack_classic', expectedController: 'games', expectedAction: 'play', expectedLang: 'rus', expectedParam: { game: 'blackjack_classic' } },
    { url: '/tur/virtualsports', expectedController: 'virtualsports', expectedAction: 'index', expectedLang: 'tur' },
    { url: '/eng/tickets/print/slip-999', expectedController: 'tickets', expectedAction: 'print', expectedLang: 'eng', expectedParam: { id: 'slip-999' } },
    { url: '/spa/admin321', expectedController: 'users', expectedAction: 'admin_login', expectedLang: 'spa', expectedAdmin: true },
  ];

  for (const r of routesToTest) {
    const match = LegacyRouter.matchRoute(r.url);
    if (!match) throw new Error(`Failed to match route: ${r.url}`);

    console.log(`  URL: ${r.url.padEnd(38)} -> Controller: ${match.controller.padEnd(12)} Action: ${match.action.padEnd(16)} Lang: ${match.language}`);

    if (match.controller !== r.expectedController || match.action !== r.expectedAction || match.language !== r.expectedLang) {
      throw new Error(`Route mismatch for ${r.url}`);
    }

    if (r.expectedAdmin && !match.admin) {
      throw new Error(`Admin flag expected on ${r.url}`);
    }

    if (r.expectedParam) {
      const [paramKey, paramVal] = Object.entries(r.expectedParam)[0];
      if (match.params[paramKey] !== paramVal) {
        throw new Error(`Param mismatch on ${r.url}: expected ${paramKey}=${paramVal}, got ${match.params[paramKey]}`);
      }
    }
  }

  console.log('  ✅ Test 4 Passed: All CakePHP routes mapped and resolved 1:1.');

  console.log('\n===============================================================');
  console.log('  🎉 All Step 1 Legacy Bridge Tests Passed!                    ');
  console.log('===============================================================');
  process.exit(0);
}

runLegacyBridgeTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
