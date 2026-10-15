/**
 * Affiliate & CPA Postback Tracking Engine Test Suite
 * Tests campaign click tracking, attribution, FTD CPA qualification,
 * S2S postbacks, 2-tier sub-affiliates, RevShare calculations, and KPI metrics.
 */

import { AffiliateManager } from '../src/affiliates/affiliate-manager.ts';
import { CommissionModel, ConversionEventType } from '../src/affiliates/affiliate-types.ts';

async function runAffiliateTests() {
  console.log('===============================================================');
  console.log('  🤝 Running Affiliate & CPA Postback Tracking Test Suite     ');
  console.log('===============================================================');

  const affiliateManager = AffiliateManager.getInstance();

  // Track dispatched postbacks for testing
  const dispatchedPostbacks: string[] = [];
  affiliateManager.postbackHandler = async (url: string) => {
    dispatchedPostbacks.push(url);
    console.log(`  [Postback:S2S] Dispatched -> ${url}`);
    return true;
  };

  // --------------------------------------------------------------------------
  // Test 1: Register Master Affiliate & Sub-Affiliate
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Registering Master and Sub-Affiliates...');
  const masterAff = affiliateManager.registerAffiliate({
    id: 'aff_master_media',
    name: 'TopMedia Global Network',
    email: 'partners@example.com',
    commissionModel: CommissionModel.HYBRID,
    cpaBounty: 150.0,
    revSharePercent: 0.35, // 35% NGR
    minDepositForCpa: 25.0,
    subAffiliateRevSharePercent: 0.10, // 10% sub-affiliate override
    postbackUrl: 'https://tracker.example.com/pb?click_id={click_id}&event={event}&payout={payout}&sub1={sub1}',
  });

  const subAff = affiliateManager.registerAffiliate({
    id: 'aff_sub_blogger',
    name: 'Football Tips Daily Blog',
    email: 'tips@example.com',
    commissionModel: CommissionModel.CPA,
    cpaBounty: 100.0,
    minDepositForCpa: 20.0,
    parentAffiliateId: masterAff.id, // Linked to master
    postbackUrl: 'https://runcpa.com/api/postback?tid={click_id}&amount={amount}&payout={payout}&event={event}',
  });

  console.log(`  Registered Master: ${masterAff.name} | Sub-Affiliate: ${subAff.name}`);
  if (subAff.parentAffiliateId !== masterAff.id) throw new Error('Parent affiliate link failed');
  console.log('  ✅ Test 1 Passed: Multi-tier affiliates registered with custom postback URLs.');

  // --------------------------------------------------------------------------
  // Test 2: Ad Campaign Click Tracking & Attribution
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Tracking Campaign Clicks & User Attribution...');
  const click = affiliateManager.recordClick({
    affiliateId: subAff.id,
    campaignId: 'camp_ucl_2026',
    subId1: 'facebook_feed',
    subId2: 'banner_300x250',
    ipAddress: '192.168.1.100',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
  });

  console.log(`  Generated Click ID: ${click.clickId}`);
  const testUserId = 'player_aff_test_001';
  const isAttributed = affiliateManager.attributeUser(testUserId, click.clickId);
  if (!isAttributed) throw new Error('User attribution failed');
  console.log(`  Player ${testUserId} attributed to Click ${click.clickId}`);
  console.log('  ✅ Test 2 Passed: Campaign click recorded and player attributed.');

  // --------------------------------------------------------------------------
  // Test 3: Player Registration Conversion & S2S Postback
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Processing Registration Conversion & S2S Postback...');
  const regConv = await affiliateManager.onUserRegistered(testUserId);

  console.log(`  Conversion ID: ${regConv?.id} | Status: ${regConv?.postbackStatus}`);
  console.log(`  Dispatched URL: ${regConv?.postbackUrlDispatched}`);

  if (!regConv || regConv.eventType !== ConversionEventType.REGISTRATION) {
    throw new Error('Registration conversion was not created');
  }
  if (!regConv.postbackUrlDispatched?.includes('event=REGISTRATION') || !regConv.postbackUrlDispatched?.includes(click.clickId)) {
    throw new Error('Postback macro substitution failed for registration');
  }
  console.log('  ✅ Test 3 Passed: Registration conversion logged and S2S postback dispatched.');

  // --------------------------------------------------------------------------
  // Test 4: First-Time Deposit (FTD) & CPA Bounty Qualification
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Processing First-Time Deposit (FTD) for CPA Bounty...');
  const ftdConv = await affiliateManager.onDepositCompleted(testUserId, 50.0, true, 'USD');

  console.log(`  FTD Conversion: ${ftdConv?.id} | Event: ${ftdConv?.eventType} | Commission: $${ftdConv?.commissionEarned}`);
  console.log(`  Sub-Affiliate Balance: $${subAff.balance} (Expected: $100.00)`);

  if (!ftdConv || ftdConv.commissionEarned !== 100.0) {
    throw new Error('CPA bounty was not awarded on qualifying FTD');
  }
  if (subAff.balance !== 100.0) {
    throw new Error('Sub-affiliate balance was not credited');
  }
  if (!ftdConv.postbackUrlDispatched?.includes('payout=100') || !ftdConv.postbackUrlDispatched?.includes('amount=50')) {
    throw new Error('Postback URL missing payout or deposit amount macro values');
  }
  console.log('  ✅ Test 4 Passed: Qualifying FTD triggered CPA bounty and S2S postback.');

  // --------------------------------------------------------------------------
  // Test 5: 2-Tier Sub-Affiliate Override
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Verifying 2-Tier Master Affiliate Override Commission...');
  // Master receives 5% of sub-affiliate $100 bounty = $5.00
  console.log(`  Master Affiliate Balance: $${masterAff.balance} (Expected: $5.00 override)`);
  if (masterAff.balance !== 5.0) {
    throw new Error('Master affiliate did not receive sub-affiliate override');
  }
  console.log('  ✅ Test 5 Passed: 2-Tier sub-affiliate override accurately credited to master.');

  // --------------------------------------------------------------------------
  // Test 6: Ongoing Revenue Share on Player NGR
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Processing Monthly Revenue Share on Player NGR...');
  // Master affiliate has 35% RevShare
  const revShareConv = affiliateManager.calculateRevShare(masterAff.id, 2000.0, 'USD');
  console.log(`  RevShare Earned: $${revShareConv?.commissionEarned} on $2000 NGR @ 35%`);
  console.log(`  Master Total Balance: $${masterAff.balance} (Expected: $5 + $700 = $705.00)`);

  if (!revShareConv || revShareConv.commissionEarned !== 700.0) {
    throw new Error('RevShare commission calculation failed');
  }
  if (masterAff.balance !== 705.0) {
    throw new Error('Master affiliate balance mismatch after RevShare');
  }
  console.log('  ✅ Test 6 Passed: Residual Revenue Share credited accurately.');

  // --------------------------------------------------------------------------
  // Test 7: Affiliate Performance KPIs & Analytics
  // --------------------------------------------------------------------------
  console.log('\n[Test 7] Checking Affiliate Performance Statistics & Conversion Rate...');
  const subStats = affiliateManager.getAffiliateStats(subAff.id);
  console.log(`  Sub-Affiliate Stats: Clicks: ${subStats.totalClicks} | Regs: ${subStats.totalRegistrations} | FTDs: ${subStats.totalFtds} | Conv Rate: ${subStats.conversionRatePercent}% | Earned: $${subStats.totalCommissionEarned}`);

  if (subStats.totalClicks !== 1 || subStats.totalRegistrations !== 1 || subStats.totalFtds !== 1) {
    throw new Error('Affiliate stats aggregation counts mismatch');
  }
  if (subStats.conversionRatePercent !== 100.0 || subStats.totalCommissionEarned !== 100.0) {
    throw new Error('Conversion rate or total earned calculation failed');
  }
  console.log('  ✅ Test 7 Passed: Affiliate performance dashboard KPIs verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Affiliate & CPA Postback Tracking Tests Passed!       ');
  console.log('===============================================================');
  process.exit(0);
}

runAffiliateTests().catch((err) => {
  console.error('❌ Affiliate Tests failed:', err);
  process.exit(1);
});
