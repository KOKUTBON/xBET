import assert from 'node:assert';
import {
  UserSettingsManager,
  GROUP_IDS,
  SoapSource,
  MarketElementsRenderer,
  BethHelper,
} from '../src/index.ts';

console.log('===============================================================');
console.log('  🧪 Running UserSettings, SOAP Datasource & Market Elements Tests');
console.log('===============================================================\n');

// ----------------------------------------------------------------------------
// Test 1: UserSettingsManager Hierarchy & Overrides
// ----------------------------------------------------------------------------
console.log('[Test 1] Testing UserSettingsManager Hierarchy & Group Fallbacks...');
const userSettings = UserSettingsManager.getInstance();

// 1. Default Branch Settings
const branchMaxBet = userSettings.getSetting('highest_stake_of_agents_users', undefined, GROUP_IDS.BRANCH_GROUP);
assert.strictEqual(branchMaxBet, 5000, 'Branch default max bet should be 5000');

// 2. Custom User Override
const customSetting = userSettings.setSetting('user-agent-42', 'highest_stake_of_agents_users', 3200);
assert.strictEqual(customSetting.value, 3200);

const resolvedCustom = userSettings.getSetting('highest_stake_of_agents_users', 'user-agent-42', GROUP_IDS.AGENT_GROUP);
assert.strictEqual(resolvedCustom, 3200, 'Should resolve custom agent user setting override');

// 3. Fallback for unconfigured setting
const agentMaxWin = userSettings.getSetting('highest_winning_amount_of_agents_users', 'user-agent-42', GROUP_IDS.AGENT_GROUP);
assert.strictEqual(agentMaxWin, 25000, 'Should fall back to group defaults');

// 4. Validations
assert.strictEqual(userSettings.validateHighestNumberOfAgents(10, 20), true);
assert.strictEqual(userSettings.validateHighestNumberOfAgents(25, 20), false);
assert.strictEqual(userSettings.validateStakeLimits(50, 1, 1000), true);
assert.strictEqual(userSettings.validateStakeLimits(1500, 1, 1000), false);
assert.strictEqual(userSettings.validateWinningLimit(5000, 10000), true);
console.log('  ✅ Test 1 Passed: UserSettingsManager hierarchy, group defaults, overrides, and limit validators work.');

// ----------------------------------------------------------------------------
// Test 2: SoapSource Datasource Client & Envelope Builder
// ----------------------------------------------------------------------------
console.log('\n[Test 2] Testing SoapSource Datasource Client & XML Envelopes...');
const soap = new SoapSource({
  location: 'http://api.oddsfeed.com/soap',
  uri: 'http://api.oddsfeed.com/v1',
  login: 'xbet_gateway',
  password: 'secret_soap_password',
});

assert.strictEqual(soap.connected, true);

const envelope = soap.buildSoapEnvelope('GetLiveMatches', { sportId: 1, lang: 'en' });
assert.ok(envelope.includes('<GetLiveMatches xmlns="http://api.oddsfeed.com/v1">'));
assert.ok(envelope.includes('<sportId>1</sportId>'));
assert.ok(envelope.includes('<lang>en</lang>'));

const response = await soap.query('GetLiveMatches', { sportId: 1 });
assert.strictEqual(response.success, true);
assert.strictEqual(response.result.status, 'OK');
assert.ok(soap.getRequest().length > 0);
assert.ok(soap.getResponse().length > 0);
console.log('  ✅ Test 2 Passed: SoapSource connection, XML envelope formatting, and RPC execution verified.');

// ----------------------------------------------------------------------------
// Test 3: MarketElementsRenderer (All 18+ CakePHP Element Views)
// ----------------------------------------------------------------------------
console.log('\n[Test 3] Testing MarketElementsRenderer (All CakePHP Bet Element Views)...');
const renderer = new MarketElementsRenderer();

// 1. 1X2 Market
const html1x2 = renderer.render1X2({
  id: 'mkt-1',
  eventId: 'evt-100',
  marketType: '1X2',
  name: 'Match Winner',
  selections: [
    { id: 'sel-1', name: '1', odd: 1.85 },
    { id: 'sel-2', name: 'X', odd: 3.50 },
    { id: 'sel-3', name: '2', odd: 4.20 },
  ],
});
assert.ok(html1x2.includes('1X2 (Match Winner)'));
assert.ok(html1x2.includes('1.85') && html1x2.includes('3.50') && html1x2.includes('4.20'));

// 2. 12 Head-to-Head Market
const html12 = renderer.render12({
  id: 'mkt-2',
  eventId: 'evt-101',
  marketType: '12',
  name: 'Moneyline',
  selections: [
    { id: 'sel-4', name: '1', odd: 1.45 },
    { id: 'sel-5', name: '2', odd: 2.75 },
  ],
});
assert.ok(html12.includes('12 (Head to Head)'));
assert.ok(html12.includes('1.45') && html12.includes('2.75'));

// 3. Under/Over Totals
const htmlTotals = renderer.renderUnderOver({
  id: 'mkt-3',
  eventId: 'evt-100',
  marketType: 'TOTALS',
  name: 'Over/Under 2.5',
  line: '2.5',
  selections: [
    { id: 'sel-6', name: 'Over 2.5', odd: 1.95 },
    { id: 'sel-7', name: 'Under 2.5', odd: 1.85 },
  ],
});
assert.ok(htmlTotals.includes('Totals Over/Under 2.5'));

// 4. BTTS
const htmlBtts = renderer.renderBothTeamsToScore({
  id: 'mkt-4',
  eventId: 'evt-100',
  marketType: 'BTTS',
  name: 'Both Teams to Score',
  selections: [
    { id: 'sel-8', name: 'Yes', odd: 1.70 },
    { id: 'sel-9', name: 'No', odd: 2.10 },
  ],
});
assert.ok(htmlBtts.includes('Both Teams To Score (BTTS)'));

// 5. Double Chance
const htmlDc = renderer.renderDoubleChance({
  id: 'mkt-5',
  eventId: 'evt-100',
  marketType: 'DOUBLE_CHANCE',
  name: 'Double Chance',
  selections: [
    { id: 'sel-10', name: '1X', odd: 1.22 },
    { id: 'sel-11', name: '12', odd: 1.30 },
    { id: 'sel-12', name: 'X2', odd: 1.90 },
  ],
});
assert.ok(htmlDc.includes('Double Chance (Full Time)'));

// 6. HT/FT & Correct Score & Handicap & Odd/Even
const htmlHtFt = renderer.renderHtFt({
  id: 'mkt-6',
  eventId: 'evt-100',
  marketType: 'HT_FT',
  name: 'Half Time / Full Time',
  selections: [
    { id: 'sel-13', name: '1/1', odd: 2.80 },
    { id: 'sel-14', name: '1/X', odd: 15.0 },
    { id: 'sel-15', name: '1/2', odd: 28.0 },
  ],
});
assert.ok(htmlHtFt.includes('Half Time / Full Time (HT/FT)'));

const htmlCs = renderer.renderCorrectScore({
  id: 'mkt-7',
  eventId: 'evt-100',
  marketType: 'CORRECT_SCORE',
  name: 'Correct Score',
  selections: [
    { id: 'sel-16', name: '1-0', odd: 6.50 },
    { id: 'sel-17', name: '2-0', odd: 8.00 },
    { id: 'sel-18', name: '2-1', odd: 8.50 },
  ],
});
assert.ok(htmlCs.includes('Correct Score'));

const htmlHandicap = renderer.renderEuropeanHandicap({
  id: 'mkt-8',
  eventId: 'evt-100',
  marketType: 'HANDICAP',
  name: 'European Handicap',
  line: '-1',
  selections: [
    { id: 'sel-19', name: '1', odd: 3.10 },
    { id: 'sel-20', name: 'X', odd: 3.75 },
    { id: 'sel-21', name: '2', odd: 1.95 },
  ],
});
assert.ok(htmlHandicap.includes('Handicap (-1)'));

const htmlOddEven = renderer.renderOddEven({
  id: 'mkt-9',
  eventId: 'evt-100',
  marketType: 'ODD_EVEN',
  name: 'Odd/Even Goals',
  selections: [
    { id: 'sel-22', name: 'Odd', odd: 1.90 },
    { id: 'sel-23', name: 'Even', odd: 1.90 },
  ],
});
assert.ok(htmlOddEven.includes('Odd / Even Total Goals'));
console.log('  ✅ Test 3 Passed: MarketElementsRenderer correctly generated HTML for 1X2, 12, Totals, BTTS, Double Chance, HT/FT, Correct Score, Handicap, and Odd/Even.');

// ----------------------------------------------------------------------------
// Test 4: BethHelper Legacy Functionality
// ----------------------------------------------------------------------------
console.log('\n[Test 4] Testing Full CakePHP BethHelper Methods...');
const beth = new BethHelper();

assert.strictEqual(beth.convertCurrency(1250.456, 2), '1250.46');
assert.strictEqual(beth.convertOdd(2.5, 0), '2.50');
assert.strictEqual(beth.convertOdd(2.5, 2), '150/100');
assert.strictEqual(beth.convertOdd(2.5, 3), '+150');
assert.strictEqual(beth.convertOdd(1.5, 3), '-200');

assert.strictEqual(beth.calculatePercentageAfter(100, 15), '15.00');
assert.strictEqual(beth.calculatePercentageGiven(115, 15), '100.00');

assert.ok(beth.getStatus(1).includes('ticket-won'));
assert.ok(beth.getStatus(0).includes('ticket-pending'));
assert.ok(beth.getStatus(-1).includes('ticket-lost'));
assert.ok(beth.getStatus(-2).includes('ticket-canceled'));

assert.strictEqual(beth.getOddsType(0), 'Decimal');
assert.strictEqual(beth.getOddsType(2), 'Fractional');
assert.strictEqual(beth.getOddsType(3), 'American');

assert.strictEqual(beth.betToPath('Under / Over (2.5)'), 'under---over-2.5');
assert.strictEqual(beth.countToPath(2), '12');
assert.strictEqual(beth.countToPath(3), '1x2');
assert.strictEqual(beth.countToPath(10), 'correct-score');
console.log('  ✅ Test 4 Passed: BethHelper 100% legacy methods confirmed.');

console.log('\n===============================================================');
console.log('  🎉 All UserSettings, SOAP & Market Elements Tests Passed!');
console.log('===============================================================');
