/**
 * Backoffice Dynamic Content & CMS Engine Test Suite
 * Tests promotional banners, sport betting rules, navigation menus,
 * CMS pages, and platform risk settings.
 */

import { CmsManager } from '../src/cms/cms-manager.ts';
import { BannerZone, MenuZone } from '../src/cms/cms-types.ts';

async function runCmsTests() {
  console.log('===============================================================');
  console.log('  🎨 Running Backoffice Dynamic Content & CMS Test Suite       ');
  console.log('===============================================================');

  const cms = CmsManager.getInstance();

  // --------------------------------------------------------------------------
  // Test 1: Dynamic Promotional Banners & Zone Targeting
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Promotional Banners & Zone Targeting...');

  // Create Spanish specific banner
  cms.createBanner({
    title: 'El Clásico Oferta Especial',
    subtitle: 'Apuesta $50 y recibe $25 en apuestas gratis',
    imageUrl: '/theme/Design/img/banners/clasico-es.jpg',
    targetUrl: '/spa/sports/event/el-clasico',
    ctaText: 'Apostar',
    zone: BannerZone.SPORTSBOOK_HERO,
    locale: 'spa',
    sortOrder: 1,
  });

  const homeBannersEng = cms.getActiveBanners(BannerZone.HOME_MAIN, 'eng');
  const heroBannersSpa = cms.getActiveBanners(BannerZone.SPORTSBOOK_HERO, 'spa');
  const heroBannersEng = cms.getActiveBanners(BannerZone.SPORTSBOOK_HERO, 'eng');

  console.log(`  HOME_MAIN (English): Found ${homeBannersEng.length} banners: "${homeBannersEng[0]?.title}"`);
  console.log(`  SPORTSBOOK_HERO (Spanish): Found ${heroBannersSpa.length} banners: "${heroBannersSpa[0]?.title}"`);
  console.log(`  SPORTSBOOK_HERO (English): Found ${heroBannersEng.length} banners`);

  if (homeBannersEng.length === 0 || !homeBannersEng[0].title.includes('Champions League')) {
    throw new Error('Default seeded home banner missing or wrong');
  }
  if (heroBannersSpa.length !== 1 || !heroBannersSpa[0].title.includes('El Clásico')) {
    throw new Error('Spanish hero banner not targeted properly');
  }
  if (heroBannersEng.length !== 0) {
    throw new Error('Spanish-only banner leaked into English query');
  }
  console.log('  ✅ Test 1 Passed: Banner zone and locale targeting verified.');

  // --------------------------------------------------------------------------
  // Test 2: Sport Betting Rules CMS & Full-Text Search
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Sport Betting Rules CMS & Keyword Search...');
  const soccerRules = cms.getSportRules('soccer', 'eng');
  console.log(`  Soccer Rules count: ${soccerRules.length} (Rule: "${soccerRules[0]?.title}")`);

  if (soccerRules.length === 0 || !soccerRules[0].content.includes('90 minutes play')) {
    throw new Error('Soccer 90-minute regulation rule not found');
  }

  // Search keyword "retirement"
  const searchRetirement = cms.searchSportRules('retirement', 'eng');
  console.log(`  Search 'retirement': Found ${searchRetirement.length} rules (Sport: ${searchRetirement[0]?.sportName})`);
  if (searchRetirement.length === 0 || searchRetirement[0].sportId !== 'tennis') {
    throw new Error('Search for retirement did not return tennis rule');
  }

  // Search keyword "overtime"
  const searchOvertime = cms.searchSportRules('overtime', 'eng');
  console.log(`  Search 'overtime': Found ${searchOvertime.length} rules (Sport: ${searchOvertime[0]?.sportName})`);
  if (searchOvertime.length === 0 || searchOvertime[0].sportId !== 'basketball') {
    throw new Error('Search for overtime did not return basketball rule');
  }
  console.log('  ✅ Test 2 Passed: Sport betting rules retrieval and keyword search verified.');

  // --------------------------------------------------------------------------
  // Test 3: Dynamic Navigation Menus (Header & Footer)
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Dynamic Navigation Menus & Auth Visibility...');
  const guestHeader = cms.getMenu(MenuZone.HEADER, false, 'eng');
  const authHeader = cms.getMenu(MenuZone.HEADER, true, 'eng');
  const footerMenu = cms.getMenu(MenuZone.FOOTER, false, 'eng');

  console.log(`  Guest Header Items (${guestHeader.length}): ${guestHeader.map((m) => m.title).join(' | ')}`);
  console.log(`  Authenticated Header Items (${authHeader.length}): ${authHeader.map((m) => m.title).join(' | ')}`);
  console.log(`  Footer Items (${footerMenu.length}): ${footerMenu.map((m) => m.title).join(' | ')}`);

  const hasMyAccountInGuest = guestHeader.some((m) => m.title === 'My Account');
  const hasMyAccountInAuth = authHeader.some((m) => m.title === 'My Account');

  if (hasMyAccountInGuest || !hasMyAccountInAuth) {
    throw new Error('Authentication guard failed for My Account menu item');
  }
  if (footerMenu.length < 4) {
    throw new Error('Expected at least 4 footer menu items');
  }
  console.log('  ✅ Test 3 Passed: Dynamic menus sorted and filtered by zone and auth state.');

  // --------------------------------------------------------------------------
  // Test 4: Custom CMS Pages & Fallback
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing CMS Content Pages (Terms, Responsible Gambling)...');
  const termsEng = cms.getPageBySlug('terms', 'eng');
  console.log(`  Page /terms: "${termsEng?.title}" (Meta: ${termsEng?.metaTitle})`);

  if (!termsEng || !termsEng.contentHtml.includes('Terms and Conditions')) {
    throw new Error('Terms CMS page resolution failed');
  }

  // Multi-language fallback (Spanish request for non-translated page falls back to English)
  const termsSpaFallback = cms.getPageBySlug('terms', 'spa');
  console.log(`  Page /terms (Spanish Fallback): "${termsSpaFallback?.title}"`);
  if (!termsSpaFallback || termsSpaFallback.slug !== 'terms') {
    throw new Error('CMS page English fallback failed');
  }

  // Create native Spanish privacy page
  cms.createOrUpdatePage({
    slug: 'privacy',
    title: 'Política de Privacidad',
    contentHtml: '<h1>Privacidad</h1><p>Nos comprometemos a proteger sus datos personales...</p>',
    locale: 'spa',
    status: 'PUBLISHED',
  });

  const privacySpa = cms.getPageBySlug('privacy', 'spa');
  console.log(`  Page /privacy (Spanish Native): "${privacySpa?.title}"`);
  if (!privacySpa || privacySpa.title !== 'Política de Privacidad') {
    throw new Error('Native Spanish CMS page resolution failed');
  }
  console.log('  ✅ Test 4 Passed: CMS pages and multi-language fallbacks verified.');

  // --------------------------------------------------------------------------
  // Test 5: Platform Settings & Risk Limits
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Platform Configuration & Risk Controls...');
  const initialSettings = cms.getSettings();
  console.log(`  Initial Site Name: ${initialSettings.siteName} | Max Winning Cap: $${initialSettings.maxTicketWinning.toLocaleString()}`);

  const updatedSettings = cms.updateSettings({
    maxTicketStake: 75000.0,
    maxTicketWinning: 500000.0,
    isMaintenanceMode: false,
  });

  console.log(`  Updated Max Stake: $${updatedSettings.maxTicketStake.toLocaleString()} | Max Winning Cap: $${updatedSettings.maxTicketWinning.toLocaleString()}`);
  if (updatedSettings.maxTicketStake !== 75000.0 || updatedSettings.maxTicketWinning !== 500000.0) {
    throw new Error('Platform settings update failed');
  }
  console.log('  ✅ Test 5 Passed: Platform settings and risk controls updated.');

  console.log('\n===============================================================');
  console.log('  🎉 All Backoffice Dynamic Content & CMS Tests Passed!        ');
  console.log('===============================================================');
  process.exit(0);
}

runCmsTests().catch((err) => {
  console.error('❌ CMS Tests failed:', err);
  process.exit(1);
});
