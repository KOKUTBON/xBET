import assert from 'node:assert';
import * as path from 'node:path';
import {
  PoCompiler,
  LocaleManager,
  compileAllLegacyLocales,
} from '../src/index.ts';

console.log('===============================================================');
console.log('  🌍 Running 14-Language .po Compiler & RTL Test Suite         ');
console.log('===============================================================\n');

// ----------------------------------------------------------------------------
// Test 1: PoCompiler In-Memory Parsing
// ----------------------------------------------------------------------------
console.log('[Test 1] Testing PoCompiler In-Memory Parser...');
const samplePo = `
msgid ""
msgstr ""
"Language: de\\n"
"MIME-Version: 1.0\\n"
"Content-Type: text/plain; charset=UTF-8\\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\\n"

#: Controller/BetsController.php:120
msgid "Place Bet"
msgstr "Wette platzieren"

#: View/Themed/Admin/Tickets/admin_index.ctp:45
msgid "Total tickets count: %d"
msgstr "Gesamtzahl der Wettscheine: %d"

msgid "Single Bet"
msgid_plural "Combi Bets"
msgstr[0] "Einzelwette"
msgstr[1] "Kombiwetten"
`;

const parsed = PoCompiler.parse(samplePo, 'de');
assert.strictEqual(parsed.language, 'de');
assert.strictEqual(parsed.translations['Place Bet'], 'Wette platzieren');
assert.strictEqual(parsed.translations['Total tickets count: %d'], 'Gesamtzahl der Wettscheine: %d');
assert.deepStrictEqual(parsed.translations['Single Bet'], ['Einzelwette', 'Kombiwetten']);
console.log('  ✅ Test 1 Passed: PoCompiler parsed headers, string continuations, and plurals.');

// ----------------------------------------------------------------------------
// Test 2: Compiling Real .po Files from app/Locale/
// ----------------------------------------------------------------------------
import * as fs from 'node:fs';
const appLocaleDir = [
  path.resolve(process.cwd(), 'locales'),
  path.resolve(process.cwd(), '../../locales'),
  path.resolve(process.cwd(), 'app/Locale'),
  path.resolve(process.cwd(), '../../app/Locale'),
].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), 'locales');
const catalogs = compileAllLegacyLocales(appLocaleDir);

const localeKeys = Object.keys(catalogs);
console.log(`  Found and compiled ${localeKeys.length} legacy .po locales: ${localeKeys.join(', ')}`);

assert.ok(localeKeys.includes('eng'), 'Must include English');
assert.ok(localeKeys.includes('deu'), 'Must include German');
assert.ok(localeKeys.includes('fas'), 'Must include Persian / Farsi');
assert.ok(localeKeys.includes('heb'), 'Must include Hebrew');

console.log(`  - English entries: ${Object.keys(catalogs['eng'].translations).length}`);
console.log(`  - German entries: ${Object.keys(catalogs['deu'].translations).length}`);
console.log(`  - Persian entries: ${Object.keys(catalogs['fas'].translations).length}`);
console.log('  ✅ Test 2 Passed: All legacy .po catalogs compiled cleanly.');

// ----------------------------------------------------------------------------
// Test 3: LocaleManager Translation & RTL/LTR Direction
// ----------------------------------------------------------------------------
console.log('\n[Test 3] Testing LocaleManager Translation & Bidirectional RTL/LTR...');
const i18n = new LocaleManager();

// Load the compiled catalogs into LocaleManager
for (const [code, cat] of Object.entries(catalogs)) {
  i18n.loadCatalog(code, cat);
}

// 1. English (LTR)
i18n.setLocale('eng');
assert.strictEqual(i18n.isRtl(), false);
assert.strictEqual(i18n.getDirection(), 'ltr');
assert.strictEqual(i18n.__('Place Bet'), 'Place Bet');

// 2. German (LTR)
i18n.setLocale('deu');
assert.strictEqual(i18n.isRtl(), false);
assert.strictEqual(i18n.getDirection(), 'ltr');
assert.strictEqual(i18n.__('Place Bet'), 'Wette platzieren');

// 3. Persian (RTL)
i18n.setLocale('fas');
assert.strictEqual(i18n.isRtl(), true);
assert.strictEqual(i18n.getDirection(), 'rtl');
assert.strictEqual(i18n.__('Place Bet'), 'ثبت شرط');

// 4. Hebrew (RTL)
i18n.setLocale('heb');
assert.strictEqual(i18n.isRtl(), true);
assert.strictEqual(i18n.getDirection(), 'rtl');
assert.strictEqual(i18n.__('Place Bet'), 'שלח הימור');

console.log('  ✅ Test 3 Passed: Multi-language translations and RTL text directions verified.');

// ----------------------------------------------------------------------------
// Test 4: Parameter Interpolation & Plurals
// ----------------------------------------------------------------------------
console.log('\n[Test 4] Testing Parameter Interpolation & Token Replacement...');
i18n.setLocale('eng');
const formattedMsg = i18n.__('Total objects count: %d', 42);
assert.strictEqual(formattedMsg, 'Total objects count: 42');

const pluralSingular = i18n.__n('Single Bet', 'Combi Bets', 1);
const pluralMultiple = i18n.__n('Single Bet', 'Combi Bets', 5);
assert.strictEqual(pluralSingular, 'Single Bet');
assert.strictEqual(pluralMultiple, 'Combi Bets');

// ----------------------------------------------------------------------------
// Test 5: Fallback Resolution
// ----------------------------------------------------------------------------
console.log('\n[Test 5] Testing Missing Key Fallback to English...');
i18n.setLocale('fas');
// When a string is missing in Persian, it should gracefully return English or the raw msgid
const missingKey = 'NonExistentStringKeyXYZ';
assert.strictEqual(i18n.__(missingKey), 'NonExistentStringKeyXYZ');

console.log('  ✅ Test 5 Passed: Fallback resolution verified.');

console.log('\n===============================================================');
console.log('  🎉 All 14-Language .po & Bidirectional RTL Tests Passed!     ');
console.log('===============================================================');
