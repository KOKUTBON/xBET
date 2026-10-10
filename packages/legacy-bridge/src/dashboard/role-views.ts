import { DashboardService } from './dashboard-service.ts';
import { TicketMonitor } from './ticket-monitor.ts';

export class RoleDashboardViews {
  private static service = DashboardService.getInstance();
  private static ticketMonitor = TicketMonitor.getInstance();

  /**
   * Replicates admin_administrator.ctp
   */
  public static renderAdministratorView(): string {
    const kpi = this.service.getAdministratorMetrics();
    return `
      <div class="admin-dashboard-container">
        <h2>👑 Super Administrator Control Panel</h2>
        <div class="kpi-grid">
          <div class="kpi-card"><span>Gross Turnover</span><strong>$${kpi.totalTurnover.toLocaleString()}</strong></div>
          <div class="kpi-card"><span>GGR (Hold)</span><strong>$${kpi.grossGamingRevenue.toLocaleString()} (${kpi.houseMarginPercentage}%)</strong></div>
          <div class="kpi-card"><span>Active In-Play</span><strong>${kpi.activeTicketsCount} Tickets</strong></div>
          <div class="kpi-card"><span>Total Players</span><strong>${kpi.totalUsersCount} Users</strong></div>
        </div>
      </div>
    `;
  }

  /**
   * Replicates admin_subadmin.ctp
   */
  public static renderSubadminView(): string {
    return `
      <div class="admin-dashboard-container">
        <h2>🏢 Regional Subadmin Operations</h2>
        <div class="kpi-grid">
          <div class="kpi-card"><span>Regional Agents</span><strong>12 Active</strong></div>
          <div class="kpi-card"><span>KYC Queue</span><strong>5 Pending</strong></div>
          <div class="kpi-card"><span>Withdrawal Approvals</span><strong>2 Pending</strong></div>
        </div>
      </div>
    `;
  }

  /**
   * Replicates admin_agent.ctp
   */
  public static renderAgentView(agentId: string = 'agent_london'): string {
    const kpi = this.service.getAgentMetrics(agentId);
    return `
      <div class="admin-dashboard-container">
        <h2>💼 Master Agent Portal (${kpi.agentUsername})</h2>
        <div class="kpi-grid">
          <div class="kpi-card"><span>Downline Branches</span><strong>${kpi.totalBranchesCount} Shops</strong></div>
          <div class="kpi-card"><span>Turnover Generated</span><strong>$${kpi.turnoverGenerated.toLocaleString()}</strong></div>
          <div class="kpi-card"><span>Commission Earned</span><strong>$${kpi.commissionEarned} (${kpi.commissionRatePercentage}%)</strong></div>
          <div class="kpi-card"><span>Available Credit Float</span><strong>$${kpi.availableCreditFloat}</strong></div>
        </div>
      </div>
    `;
  }

  /**
   * Replicates admin_branch.ctp
   */
  public static renderBranchView(branchName: string = 'Retail Branch #01'): string {
    const kpi = this.service.getBranchMetrics(branchName);
    return `
      <div class="admin-dashboard-container">
        <h2>🏪 Retail Shop Branch (${kpi.branchName})</h2>
        <div class="kpi-grid">
          <div class="kpi-card"><span>Active Terminals</span><strong>${kpi.activeCashiersCount} Cashiers</strong></div>
          <div class="kpi-card"><span>Daily Turnover</span><strong>$${kpi.dailyTurnover}</strong></div>
          <div class="kpi-card"><span>Daily Payouts</span><strong>$${kpi.dailyPayouts}</strong></div>
          <div class="kpi-card"><span>Net Cash Till</span><strong>$${kpi.netCashTillBalance}</strong></div>
        </div>
      </div>
    `;
  }

  /**
   * Replicates admin_cashier.ctp
   */
  public static renderCashierView(cashierId: string = 'cashier_tom'): string {
    const kpi = this.service.getCashierTillMetrics(cashierId);
    return `
      <div class="admin-dashboard-container">
        <h2>🖥️ Cashier Terminal Till (${kpi.cashierUsername})</h2>
        <div class="kpi-grid">
          <div class="kpi-card"><span>Tickets Sold Today</span><strong>${kpi.ticketsSoldToday}</strong></div>
          <div class="kpi-card"><span>Payouts Redeemed</span><strong>${kpi.winningTicketsPaidToday}</strong></div>
          <div class="kpi-card"><span>Cash in Drawer</span><strong>$${kpi.currentDrawerFloat}</strong></div>
        </div>
      </div>
    `;
  }

  /**
   * Replicates admin_tickets.ctp
   */
  public static renderTicketsView(statusFilter: string = 'ALL'): string {
    const tickets = this.ticketMonitor.getTicketsByStatus(statusFilter);
    return `
      <div class="admin-dashboard-container">
        <h2>🎫 Master Tickets Live Monitor (${tickets.length} Records)</h2>
        <table class="admin-tickets-table">
          <thead>
            <tr><th>Ticket #</th><th>Type</th><th>Stake</th><th>Odds</th><th>Pot. Return</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${tickets
              .map(
                (t) => `
              <tr>
                <td>${t.slipNumber}</td>
                <td>${t.betType}</td>
                <td>$${t.stake.toFixed(2)}</td>
                <td>${t.totalOdds}</td>
                <td>$${t.potentialPayout.toFixed(2)}</td>
                <td>${t.status}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}
