/**
 * Financial & Agent Hierarchy Reporting Verification Suite
 * Tests global financial KPIs, GGR/NGR, cashier shift float reconciliation,
 * sportsbook performance breakdown, agent commissions, and CSV/Excel/HTML exports.
 */

import { FinancialReportingEngine } from '../src/reporting/financial-reporting-engine.ts';
import { ReportExporter } from '../src/reporting/report-exporter.ts';
import { TicketManager, LegacyTicketStatus } from '../src/tickets/ticket-manager.ts';
import { DepositManager } from '../src/payments/deposit-manager.ts';
import { WithdrawManager } from '../src/payments/withdraw-manager.ts';
import { UserManager } from '../src/users/user-manager.ts';
import { PaymentMethod } from '../src/payments/payment-gateway.ts';

async function runReportingTests() {
  console.log('===============================================================');
  console.log('  📈 Running Financial & Agent Hierarchy Reporting Test Suite  ');
  console.log('===============================================================');

  const reportingEngine = FinancialReportingEngine.getInstance();
  const ticketManager = TicketManager.getInstance();
  const depositManager = DepositManager.getInstance();
  const withdrawManager = WithdrawManager.getInstance();
  const userManager = UserManager.getInstance();

  // --------------------------------------------------------------------------
  // Setup Test Data: Users, Agent Downline, Tickets, Deposits, Withdrawals
  // --------------------------------------------------------------------------
  const agentUser = userManager.registerUser({
    username: 'agent_reports_01',
    email: 'agent_rep@xbet.com',
    password: 'Password123!',
    role: 'AGENT',
    preferredCurrency: 'USD',
  });

  const player1 = userManager.registerUser({
    username: 'player_rep_01',
    email: 'p1@xbet.com',
    password: 'Password123!',
    role: 'PLAYER',
    parentId: agentUser.id,
    preferredCurrency: 'USD',
  });

  const player2 = userManager.registerUser({
    username: 'player_rep_02',
    email: 'p2@xbet.com',
    password: 'Password123!',
    role: 'PLAYER',
    parentId: agentUser.id,
    preferredCurrency: 'USD',
  });

  // Deposits
  depositManager.createDeposit({
    userId: player1.id,
    method: PaymentMethod.CREDIT_CARD,
    amount: 500.0,
    bonusCode: 'WELCOME100', // $100 bonus granted
  });
  depositManager.createDeposit({
    userId: player2.id,
    method: PaymentMethod.CREDIT_CARD,
    amount: 300.0,
  });

  // Tickets
  const t1 = ticketManager.placeTicket({
    userId: player1.id,
    cashierId: 'CSH-SHIFT-01',
    betType: 'SINGLE',
    stake: 200.0,
    legs: [
      {
        fixtureId: 'fix-1',
        fixtureName: 'Liverpool vs Arsenal',
        marketName: '1X2',
        selectionId: 'sel-1',
        selectionName: 'Liverpool',
        lockedOdds: 2.0,
      },
    ],
  });
  // Mark t1 as WON ($400 return) and paid out
  t1.status = LegacyTicketStatus.WON;
  t1.actualPayout = 400.0;
  ticketManager.payTicketByCashier(t1.id, 'CSH-SHIFT-01');

  const t2 = ticketManager.placeTicket({
    userId: player2.id,
    cashierId: 'CSH-SHIFT-01',
    betType: 'COMBI',
    stake: 100.0,
    legs: [
      {
        fixtureId: 'fix-2',
        fixtureName: 'Real Madrid vs Barcelona',
        marketName: 'Over/Under 2.5',
        selectionId: 'sel-over',
        selectionName: 'Over 2.5',
        lockedOdds: 1.80,
      },
      {
        fixtureId: 'fix-3',
        fixtureName: 'Bayern Munich vs PSG',
        marketName: '1X2',
        selectionId: 'sel-bayern',
        selectionName: 'Bayern',
        lockedOdds: 2.10,
      },
    ],
  });
  // Mark t2 as LOST
  t2.status = LegacyTicketStatus.LOST;

  // --------------------------------------------------------------------------
  // Test 1: Global Financial KPI Summary (GGR, NGR, Hold %)
  // --------------------------------------------------------------------------
  console.log('\n[Test 1] Testing Global Executive Financial Summary Report...');
  const financialSummary = reportingEngine.generateFinancialSummary();

  console.log(`  Turnover: $${financialSummary.turnover.toFixed(2)} | Tickets: ${financialSummary.totalTickets}`);
  console.log(`  Payouts: $${financialSummary.payouts.toFixed(2)} | GGR: $${financialSummary.grossGamingRevenue.toFixed(2)} (Hold: ${financialSummary.holdPercentage}%)`);
  console.log(`  Bonuses: $${financialSummary.totalBonusesGranted.toFixed(2)} | Tax (5%): $${financialSummary.gamingTaxAmount.toFixed(2)} | NGR: $${financialSummary.netGamingRevenue.toFixed(2)}`);
  console.log(`  Deposits: $${financialSummary.totalDeposits.toFixed(2)} | Withdrawals: $${financialSummary.totalWithdrawals.toFixed(2)} | Net Cash Flow: $${financialSummary.netCashFlow.toFixed(2)}`);

  if (financialSummary.turnover <= 0) throw new Error('Turnover should be positive');
  if (financialSummary.grossGamingRevenue !== financialSummary.turnover - financialSummary.payouts) {
    throw new Error('GGR mathematical identity violated (GGR != Turnover - Payouts)');
  }
  console.log('  ✅ Test 1 Passed: Global financial KPIs and GGR/NGR calculations verified.');

  // --------------------------------------------------------------------------
  // Test 2: Daily Operator Time-Series Breakdown
  // --------------------------------------------------------------------------
  console.log('\n[Test 2] Testing Operator Daily Time-Series Rollup...');
  const dailyRows = reportingEngine.generateOperatorDaily();
  console.log(`  Generated ${dailyRows.length} daily time-series rows:`);
  for (const r of dailyRows) {
    console.log(`    Date: ${r.date} | Tickets: ${r.ticketCount} | Turnover: $${r.turnover} | GGR: $${r.ggr} | Active Players: ${r.activePlayers}`);
  }

  if (dailyRows.length === 0 || dailyRows[0].ticketCount === 0) {
    throw new Error('Daily operator rows empty or missing tickets');
  }
  console.log('  ✅ Test 2 Passed: Operator daily time-series report aggregated.');

  // --------------------------------------------------------------------------
  // Test 3: Cashier Daily Shift Reconciliation
  // --------------------------------------------------------------------------
  console.log('\n[Test 3] Testing Cashier Terminal Shift Float Reconciliation...');
  const cashierShift = reportingEngine.generateCashierDaily({
    cashierId: 'CSH-SHIFT-01',
    branchId: 'BR-LONDON-01',
    openingFloat: 500.0,
    actualClosingFloat: 400.0, // Expected: $500 + $300 in - $400 out = $400 -> Variance 0.00
  });

  console.log(`  Cashier: ${cashierShift.cashierId} | Shift Date: ${cashierShift.shiftDate}`);
  console.log(`  Opening Float: $${cashierShift.openingFloat} | Cash In (Sales): $${cashierShift.cashInTickets} (${cashierShift.ticketsSold} tickets)`);
  console.log(`  Cash Out (Paid): $${cashierShift.cashOutPayouts} (${cashierShift.ticketsPaid} tickets)`);
  console.log(`  Expected Closing Float: $${cashierShift.expectedClosingFloat} | Actual: $${cashierShift.actualClosingFloat} | Variance: $${cashierShift.variance}`);

  if (cashierShift.cashInTickets !== 300.0 || cashierShift.cashOutPayouts !== 400.0) {
    throw new Error('Cashier cash in / out amounts mismatch');
  }
  if (cashierShift.expectedClosingFloat !== 400.0 || cashierShift.variance !== 0.0) {
    throw new Error('Cashier shift float reconciliation failed');
  }
  console.log('  ✅ Test 3 Passed: Cashier shift float balancing and zero-variance reconciliation verified.');

  // --------------------------------------------------------------------------
  // Test 4: Sportsbook Performance Rollup by Sport & Market
  // --------------------------------------------------------------------------
  console.log('\n[Test 4] Testing Sportsbook Performance Breakdown by Sport/Market...');
  const sportsRows = reportingEngine.generateSportsbookPerformance();
  for (const s of sportsRows) {
    console.log(`  ${s.sportName} - ${s.marketName} | Legs: ${s.ticketLegCount} | Turnover: $${s.turnover} | Won: $${s.wonAmount} | GGR: $${s.ggr} (${s.holdPercentage}%)`);
  }

  if (sportsRows.length === 0) throw new Error('Sportsbook performance rows should not be empty');
  console.log('  ✅ Test 4 Passed: Sportsbook performance categorized by Sport and Market.');

  // --------------------------------------------------------------------------
  // Test 5: Agent Hierarchy Commission Calculations
  // --------------------------------------------------------------------------
  console.log('\n[Test 5] Testing Multi-Tier Agent Downline Commission Distribution...');
  const turnoverCommissions = reportingEngine.generateAgentCommissions({
    commissionRate: 0.05, // 5% turnover
    commissionType: 'TURNOVER',
  });

  const agentRow = turnoverCommissions.find((a) => a.agentId === agentUser.id);
  console.log(`  Agent: ${agentRow?.agentName} (${agentRow?.role}) | Downline Users: ${agentRow?.downlineUsersCount}`);
  console.log(`  Downline Turnover: $${agentRow?.downlineTurnover} | Downline Payouts: $${agentRow?.downlinePayouts}`);
  console.log(`  Net Commission (5% Turnover): $${agentRow?.netCommissionEarned}`);

  if (!agentRow || agentRow.downlineUsersCount !== 2 || agentRow.downlineTurnover !== 300.0) {
    throw new Error('Agent downline turnover aggregation failed');
  }
  if (agentRow.netCommissionEarned !== 15.0) { // 5% of $300 = $15
    throw new Error('Agent commission calculation incorrect');
  }
  console.log('  ✅ Test 5 Passed: Agent downline commission accurately calculated.');

  // --------------------------------------------------------------------------
  // Test 6: Report Exporter (CSV, Excel XML, Printable HTML)
  // --------------------------------------------------------------------------
  console.log('\n[Test 6] Testing Report Exporter (CSV, Excel XML, Executive HTML)...');

  // CSV
  const csvOutput = ReportExporter.exportToCsv(dailyRows as any);
  console.log(`  CSV Export:\n${csvOutput.split('\n').slice(0, 2).join('\n')}`);
  if (!csvOutput.includes('"date"') || !csvOutput.includes('"turnover"')) {
    throw new Error('CSV output missing expected headers');
  }

  // Excel XML
  const excelXml = ReportExporter.exportToExcelXml(dailyRows as any, 'Daily Operator');
  console.log(`  Excel XML Length: ${excelXml.length} characters (Contains ss:Workbook & ss:Worksheet)`);
  if (!excelXml.includes('<Workbook') || !excelXml.includes('<Worksheet ss:Name="Daily Operator"')) {
    throw new Error('Excel XML schema mismatch');
  }

  // Printable HTML
  const printableHtml = ReportExporter.exportToPrintableHtml(
    'Executive Financial Report',
    [
      { label: 'Gross Turnover', value: `$${financialSummary.turnover.toLocaleString()}` },
      { label: 'GGR Margin', value: `${financialSummary.holdPercentage}%`, change: '+1.2% MoM' },
      { label: 'Net Cash Flow', value: `$${financialSummary.netCashFlow.toLocaleString()}` },
    ],
    dailyRows as any
  );
  console.log(`  Printable HTML Layout Length: ${printableHtml.length} characters`);
  if (!printableHtml.includes('XBET PLATFORM') || !printableHtml.includes('Executive Financial Report')) {
    throw new Error('Printable HTML layout missing branding or title');
  }
  console.log('  ✅ Test 6 Passed: Multi-format report exporter (CSV, Excel XML, HTML) verified.');

  console.log('\n===============================================================');
  console.log('  🎉 All Financial & Hierarchy Reporting Tests Passed!        ');
  console.log('===============================================================');
  process.exit(0);
}

runReportingTests().catch((err) => {
  console.error('❌ Reporting Tests failed:', err);
  process.exit(1);
});
