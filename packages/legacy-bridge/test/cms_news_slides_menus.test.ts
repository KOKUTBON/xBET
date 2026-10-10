import { CmsManager } from '../src/cms/cms-manager.ts';
import { BannerZone, MenuZone, NewsCategory } from '../src/cms/cms-types.ts';

async function runTest() {
  console.log('===============================================================');
  console.log('  📰 Running CMS News, Promotional Slides & Dynamic Menus Suite');
  console.log('===============================================================');

  const cms = CmsManager.getInstance();

  // Test 1: News Article Creation & Multi-Language Translation
  console.log('\n[Test 1] Testing News Publishing & Multi-Language Translations...');
  const newsItem = cms.createNewsArticle({
    slug: 'world-cup-2026-stadium-guide',
    category: NewsCategory.FOOTBALL,
    featuredImageUrl: '/img/news/wc2026.jpg',
    translations: {
      eng: {
        locale: 'eng',
        title: 'World Cup 2026 Stadiums & Host City Breakdown',
        summary: 'Everything you need to know about the 16 host stadiums across USA, Canada, and Mexico.',
        contentHtml: '<p>The 2026 tournament will feature 48 teams competing across North America...</p>',
      },
      spa: {
        locale: 'spa',
        title: 'Guía de Estadios y Sedes del Mundial 2026',
        summary: 'Todo lo que necesitas saber sobre los 16 estadios en EE.UU., Canadá y México.',
        contentHtml: '<p>El torneo de 2026 contará con 48 selecciones compitiendo en América del Norte...</p>',
      },
      deu: {
        locale: 'deu',
        title: 'WM 2026 Stadien & Austragungsorte Übersicht',
        summary: 'Alle Details zu den 16 Austragungsstätten in Nordamerika.',
        contentHtml: '<p>Das Turnier 2026 wird mit 48 Teams in 16 Städten ausgetragen...</p>',
      },
    },
  });

  // Query in English
  const engNews = cms.getNewsBySlug('world-cup-2026-stadium-guide', 'eng');
  console.log('  English Title:', engNews?.title);
  if (!engNews || !engNews.title.includes('World Cup 2026 Stadiums')) {
    throw new Error('English news translation resolution failed');
  }

  // Query in Spanish
  const spaNews = cms.getNewsBySlug('world-cup-2026-stadium-guide', 'spa');
  console.log('  Spanish Title:', spaNews?.title);
  if (!spaNews || !spaNews.title.includes('Guía de Estadios')) {
    throw new Error('Spanish news translation resolution failed');
  }

  // Query in Italian (unsupported -> should fall back to English)
  const itaNews = cms.getNewsBySlug('world-cup-2026-stadium-guide', 'ita');
  console.log('  Fallback Title (ita -> eng):', itaNews?.title);
  if (!itaNews || !itaNews.title.includes('World Cup 2026 Stadiums')) {
    throw new Error('Italian fallback to English translation failed');
  }

  console.log('  ✅ Test 1 Passed: Multilingual news translation resolution & fallback verified.');

  // Test 2: News Category Filtering & View Counting
  console.log('\n[Test 2] Testing Category Filtering & View Counters...');
  const footballNews = cms.getPublishedNews('eng', NewsCategory.FOOTBALL);
  console.log('  Football Articles Count:', footballNews.length);
  if (footballNews.length < 2) {
    throw new Error('Category filtering returned insufficient articles');
  }

  cms.incrementNewsViews('world-cup-2026-stadium-guide');
  cms.incrementNewsViews('world-cup-2026-stadium-guide');
  const viewArticle = cms.getNewsBySlug('world-cup-2026-stadium-guide', 'eng');
  console.log('  Views after 2 impressions:', viewArticle?.viewsCount);
  if (viewArticle?.viewsCount !== 2) {
    throw new Error('View counter increment failed');
  }
  console.log('  ✅ Test 2 Passed: News category filtering and atomic view counters verified.');

  // Test 3: Hero Carousel & Promotional Slide Banners
  console.log('\n[Test 3] Testing Hero Carousel Banners & Scheduling...');
  const slide1 = cms.createBanner({
    title: 'Premier League Super Sunday Booster',
    subtitle: 'Enhanced odds on all Super Sunday derbies',
    imageUrl: '/img/banners/pl-super-sunday.jpg',
    targetUrl: '/sports/football/premier-league',
    zone: BannerZone.SPORTSBOOK_HERO,
    sortOrder: 1,
  });

  const activeSlides = cms.getActiveBanners(BannerZone.SPORTSBOOK_HERO);
  console.log('  Active Sportsbook Hero Slides Count:', activeSlides.length);
  if (activeSlides.length === 0 || activeSlides[0].title !== 'Premier League Super Sunday Booster') {
    throw new Error('Hero slide retrieval failed');
  }

  // Track clicks
  cms.trackSlideClick(slide1.id);
  cms.trackSlideClick(slide1.id);
  const updatedSlide = cms.getActiveBanners(BannerZone.SPORTSBOOK_HERO).find((s) => s.id === slide1.id);
  console.log('  Slide Clicks Count:', updatedSlide?.clicksCount);
  if (updatedSlide?.clicksCount !== 2) {
    throw new Error('Slide click tracking failed');
  }
  console.log('  ✅ Test 3 Passed: Promotional slide banners, active sorting, and click metrics verified.');

  // Test 4: Dynamic Hierarchical Navigation Menu Tree
  console.log('\n[Test 4] Testing Hierarchical Navigation Menu Tree...');
  
  // Create Root Menu Item
  const rootFootball = cms.createMenuItem({
    zone: MenuZone.SIDEBAR,
    title: 'Football',
    localizedTitles: { eng: 'Football', spa: 'Fútbol', deu: 'Fußball' },
    url: '/sports/football',
    sortOrder: 1,
  });

  // Create Child Sub-items
  cms.createMenuItem({
    zone: MenuZone.SIDEBAR,
    parentId: rootFootball.id,
    title: 'Premier League',
    localizedTitles: { eng: 'Premier League', spa: 'Liga Premier', deu: 'Premier League' },
    url: '/sports/football/epl',
    sortOrder: 1,
  });

  cms.createMenuItem({
    zone: MenuZone.SIDEBAR,
    parentId: rootFootball.id,
    title: 'La Liga',
    localizedTitles: { eng: 'La Liga', spa: 'LaLiga Española', deu: 'La Liga' },
    url: '/sports/football/laliga',
    sortOrder: 2,
  });

  // Query English Menu Tree
  const engMenuTree = cms.getMenuTree(MenuZone.SIDEBAR, false, 'eng');
  console.log('  English Root Sidebar Items:', engMenuTree.length);
  const footballNode = engMenuTree.find((n) => n.id === rootFootball.id);
  console.log(`  Root: ${footballNode?.title} (Children: ${footballNode?.children.length})`);
  if (!footballNode || footballNode.children.length !== 2) {
    throw new Error('Menu tree hierarchy construction failed');
  }

  // Query Spanish Menu Tree (Check localized label)
  const spaMenuTree = cms.getMenuTree(MenuZone.SIDEBAR, false, 'spa');
  const spaFootballNode = spaMenuTree.find((n) => n.id === rootFootball.id);
  console.log(`  Spanish Root: ${spaFootballNode?.title} | Sub: ${spaFootballNode?.children[1]?.title}`);
  if (spaFootballNode?.title !== 'Fútbol' || spaFootballNode?.children[1]?.title !== 'LaLiga Española') {
    throw new Error('Spanish menu localization failed');
  }
  console.log('  ✅ Test 4 Passed: Nested menu hierarchy and localized link labels verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All CMS News, Slides & Dynamic Menu Tests Passed!         ');
  console.log('===============================================================');
}

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
