/**
 * Verification Test Suite for Admin Backoffice & 6 Multi-Role Sub-Dashboards
 */

import { DashboardService } from '../src/dashboard/dashboard-service.ts';
import { TicketMonitor } from '../src/dashboard/ticket-monitor.ts';
import { RoleDashboardViews } from '../src/dashboard/role-views.ts';

async function runDashboardViewsTests() {
  console.log('===============================================================');
  console.log('  📊 Running Admin Backoffice & Multi-Role Dashboards Test Suite');
  console.log('===============================================================');

  const dashboardService = DashboardService.getInstance();
  const ticketMonitor = TicketMonitor.getInstance();

  // --------------------------------------------------------------------------
  // Test 1: Super Administrator Global KPI Aggregation
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Super Administrator Global KPIs...');
  const adminKpi = dashboardService.getAdministratorMetrics();
  console.log(`  Turnover: $${adminKpi.totalTurnover.toLocaleString()} | Payouts: $${adminKpi.totalPayouts.toLocaleString()} | GGR: $${adminKpi.grossGamingRevenue.toLocaleString()} (${adminKpi.houseMarginPercentage}%)`);

  if (adminKpi.grossGamingRevenue !== adminKpi.totalTurnover - adminKpi.totalPayouts) {
    throw new Error('GGR calculation mismatch');
  }
  const adminHtml = RoleDashboardViews.renderAdministratorView();
  if (!adminHtml.includes('Super Administrator') || !adminHtml.includes('Gross Turnover')) {
    throw new Error('Administrator view markup failed');
  }
  console.log('  ✅ Test 1 Passed: Super Administrator KPIs and view rendered.');

  // --------------------------------------------------------------------------
  // Test 2: Master Agent / Affiliate Downline & Commissions
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Master Agent Downline & Commission Calculation...');
  const agentKpi = dashboardService.getAgentMetrics('agent_london');
  console.log(`  Agent: ${agentKpi.agentUsername} | Branches: ${agentKpi.totalBranchesCount} | Turnover: $${agentKpi.turnoverGenerated} | Commission: $${agentKpi.commissionEarned} (${agentKpi.commissionRatePercentage}%)`);

  const expectedCommission = (agentKpi.turnoverGenerated * agentKpi.commissionRatePercentage) / 100;
  if (agentKpi.commissionEarned !== expectedCommission) {
    throw new Error('Agent commission calculation mismatch');
  }
  const agentHtml = RoleDashboardViews.renderAgentView('agent_london');
  if (!agentHtml.includes('Master Agent Portal') || !agentHtml.includes('Commission Earned')) {
    throw new Error('Agent view markup failed');
  }
  console.log('  ✅ Test 2 Passed: Master Agent metrics and view rendered.');

  // --------------------------------------------------------------------------
  // Test 3: Retail Shop Branch Operations
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Retail Shop Branch Daily Till Summary...');
  const branchKpi = dashboardService.getBranchMetrics('Retail Branch #01');
  console.log(`  Shop: ${branchKpi.branchName} | Cashiers: ${branchKpi.activeCashiersCount} | In: $${branchKpi.dailyTurnover} | Out: $${branchKpi.dailyPayouts} | Net Till: $${branchKpi.netCashTillBalance}`);

  if (branchKpi.netCashTillBalance !== branchKpi.dailyTurnover - branchKpi.dailyPayouts) {
    throw new Error('Branch net till calculation mismatch');
  }
  const branchHtml = RoleDashboardViews.renderBranchView();
  if (!branchHtml.includes('Retail Shop Branch') || !branchHtml.includes('Net Cash Till')) {
    throw new Error('Branch view markup failed');
  }
  console.log('  ✅ Test 3 Passed: Branch shop till metrics and view rendered.');

  // --------------------------------------------------------------------------
  // Test 4: Cashier Terminal Till Shift
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Cashier Terminal Shift Float Balancing...');
  const cashierKpi = dashboardService.getCashierTillMetrics('cashier_tom');
  console.log(`  Cashier: ${cashierKpi.cashierUsername} | Tickets Sold: ${cashierKpi.ticketsSoldToday} | Paid: ${cashierKpi.winningTicketsPaidToday} | Cash Drawer: $${cashierKpi.currentDrawerFloat}`);

  const expectedFloat = 500.0 + cashierKpi.cashReceivedToday - cashierKpi.cashPaidToday;
  if (cashierKpi.currentDrawerFloat !== expectedFloat) {
    throw new Error('Cashier drawer float mismatch');
  }
  const cashierHtml = RoleDashboardViews.renderCashierView();
  if (!cashierHtml.includes('Cashier Terminal Till') || !cashierHtml.includes('Cash in Drawer')) {
    throw new Error('Cashier view markup failed');
  }
  console.log('  ✅ Test 4 Passed: Cashier till shift float balancing and view rendered.');

  // --------------------------------------------------------------------------
  // Test 5: Master Tickets Live Monitor Filter
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Master Tickets Live Monitor Status Filters...');
  const allTickets = ticketMonitor.getTicketsByStatus('ALL');
  const wonTickets = ticketMonitor.getTicketsByStatus('WON');
  const pendingTickets = ticketMonitor.getTicketsByStatus('PENDING');

  console.log(`  Tickets Count: All (${allTickets.length}) | Won (${wonTickets.length}) | Pending (${pendingTickets.length})`);
  if (wonTickets.length === 0 || pendingTickets.length === 0 || allTickets.length !== wonTickets.length + pendingTickets.length) {
    throw new Error('Ticket monitor status filtering mismatch');
  }

  const ticketsHtml = RoleDashboardViews.renderTicketsView('ALL');
  if (!ticketsHtml.includes('Master Tickets Live Monitor') || !ticketsHtml.includes('SLIP-841920-101')) {
    throw new Error('Tickets view markup failed');
  }
  console.log('  ✅ Test 5 Passed: Tickets monitor status filtering and markup verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Step 6 Admin Multi-Role Dashboard Tests Passed!       ');
  console.log('===============================================================');
  process.exit(0);
}

runDashboardViewsTests().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
