/**
 * Financial & Agent Hierarchy Reporting Engine
 * Computes global turnover, winning payouts, GGR, NGR, hold margins,
 * cashier shift float reconciliation, sportsbook breakdown, and multi-tier agent commissions.
 */

import { TicketManager } from '../tickets/ticket-manager.ts';
import type { LegacyTicketRecord } from '../tickets/ticket-manager.ts';
import { DepositManager } from '../payments/deposit-manager.ts';
import { WithdrawManager } from '../payments/withdraw-manager.ts';
import { UserManager } from '../users/user-manager.ts';

export interface DateRangeFilter {
  fromDate?: Date;
  toDate?: Date;
  currencyCode?: string;
}

export interface FinancialSummaryReport {
  period: { from: string; to: string };
  currency: string;
  turnover: number;
  totalTickets: number;
  payouts: number;
  grossGamingRevenue: number; // GGR = Turnover - Payouts
  totalBonusesGranted: number;
  gamingTaxAmount: number; // e.g. 5% tax on GGR
  netGamingRevenue: number; // NGR = GGR - Bonuses - Tax
  holdPercentage: number; // GGR / Turnover * 100
  totalDeposits: number;
  totalWithdrawals: number;
  netCashFlow: number; // Deposits - Withdrawals
  unsettledStakes: number;
}

export interface DailyFinancialRow {
  date: string;
  ticketCount: number;
  turnover: number;
  payouts: number;
  ggr: number;
  holdPercentage: number;
  activePlayers: number;
}

export interface CashierDailyShiftReport {
  cashierId: string;
  branchId: string;
  shiftDate: string;
  openingFloat: number;
  cashInTickets: number;
  ticketsSold: number;
  cashOutPayouts: number;
  ticketsPaid: number;
  voucherDeposits: number;
  expectedClosingFloat: number;
  actualClosingFloat: number;
  variance: number; // actual - expected (positive = surplus, negative = shortage)
}

export interface SportsbookPerformanceRow {
  sportName: string;
  marketName: string;
  ticketLegCount: number;
  turnover: number;
  wonAmount: number;
  ggr: number;
  holdPercentage: number;
}

export interface AgentCommissionRow {
  agentId: string;
  agentName: string;
  role: string;
  downlineUsersCount: number;
  downlineTurnover: number;
  downlinePayouts: number;
  downlineGgr: number;
  commissionRate: number; // e.g. 0.05 (5% on turnover) or 0.20 (20% on GGR)
  commissionType: 'TURNOVER' | 'GGR_REVENUE_SHARE';
  netCommissionEarned: number;
}

export class FinancialReportingEngine {
  private static instance: FinancialReportingEngine;
  private ticketManager: TicketManager;
  private depositManager: DepositManager;
  private withdrawManager: WithdrawManager;
  private userManager: UserManager;

  private constructor() {
    this.ticketManager = TicketManager.getInstance();
    this.depositManager = DepositManager.getInstance();
    this.withdrawManager = WithdrawManager.getInstance();
    this.userManager = UserManager.getInstance();
  }

  public static getInstance(): FinancialReportingEngine {
    if (!FinancialReportingEngine.instance) {
      FinancialReportingEngine.instance = new FinancialReportingEngine();
    }
    return FinancialReportingEngine.instance;
  }

  /**
   * Generates Executive Global Financial KPI Summary
   */
  public generateFinancialSummary(filter?: DateRangeFilter): FinancialSummaryReport {
    const from = filter?.fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = filter?.toDate || new Date();
    const currency = filter?.currencyCode || 'USD';

    let turnover = 0;
    let totalTickets = 0;
    let payouts = 0;
    let unsettledStakes = 0;

    // Filter tickets from TicketManager
    // (In production this queries the DB with indexed date filters)
    const tickets = Array.from((this.ticketManager as any).tickets.values()) as LegacyTicketRecord[];

    for (const t of tickets) {
      if (t.createdAt >= from && t.createdAt <= to) {
        if (!filter?.currencyCode || t.currencyCode === currency) {
          totalTickets++;
          turnover += t.stake;

          if (t.status === 'WON' || t.status === 'PAID_OUT') {
            payouts += t.actualPayout || t.potentialPayout;
          } else if (t.status === 'PENDING') {
            unsettledStakes += t.stake;
          }
        }
      }
    }

    const ggr = parseFloat((turnover - payouts).toFixed(2));
    const holdPercentage = turnover > 0 ? parseFloat(((ggr / turnover) * 100).toFixed(2)) : 0.0;

    // Deposits & Bonuses
    let totalDeposits = 0;
    let totalBonuses = 0;
    for (const dep of this.depositManager.getAllDeposits()) {
      if (dep.createdAt >= from && dep.createdAt <= to && dep.status === 'COMPLETED') {
        totalDeposits += dep.amount;
        totalBonuses += dep.bonusAmount || 0;
      }
    }

    // Withdrawals
    let totalWithdrawals = 0;
    const allWithdrawals = Array.from((this.withdrawManager as any).withdrawals.values()) as any[];
    for (const wth of allWithdrawals) {
      if (wth.createdAt >= from && wth.createdAt <= to && wth.status === 'APPROVED') {
        totalWithdrawals += wth.amount;
      }
    }

    const taxRate = 0.05; // 5% statutory gross gaming tax
    const gamingTaxAmount = ggr > 0 ? parseFloat((ggr * taxRate).toFixed(2)) : 0;
    const netGamingRevenue = parseFloat((ggr - totalBonuses - gamingTaxAmount).toFixed(2));
    const netCashFlow = parseFloat((totalDeposits - totalWithdrawals).toFixed(2));

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      currency,
      turnover: parseFloat(turnover.toFixed(2)),
      totalTickets,
      payouts: parseFloat(payouts.toFixed(2)),
      grossGamingRevenue: ggr,
      totalBonusesGranted: parseFloat(totalBonuses.toFixed(2)),
      gamingTaxAmount,
      netGamingRevenue,
      holdPercentage,
      totalDeposits: parseFloat(totalDeposits.toFixed(2)),
      totalWithdrawals: parseFloat(totalWithdrawals.toFixed(2)),
      netCashFlow,
      unsettledStakes: parseFloat(unsettledStakes.toFixed(2)),
    };
  }

  /**
   * Generates Daily Time-Series Operator Report
   */
  public generateOperatorDaily(filter?: DateRangeFilter): DailyFinancialRow[] {
    const from = filter?.fromDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const to = filter?.toDate || new Date();

    const tickets = Array.from((this.ticketManager as any).tickets.values()) as LegacyTicketRecord[];
    const dayMap = new Map<string, { turnover: number; payouts: number; count: number; players: Set<string> }>();

    for (const t of tickets) {
      if (t.createdAt >= from && t.createdAt <= to) {
        const dayKey = t.createdAt.toISOString().slice(0, 10);
        if (!dayMap.has(dayKey)) {
          dayMap.set(dayKey, { turnover: 0, payouts: 0, count: 0, players: new Set() });
        }
        const row = dayMap.get(dayKey)!;
        row.turnover += t.stake;
        row.count++;
        row.players.add(t.userId);
        if (t.status === 'WON' || t.status === 'PAID_OUT') {
          row.payouts += t.actualPayout || t.potentialPayout;
        }
      }
    }

    const result: DailyFinancialRow[] = [];
    for (const [date, data] of dayMap.entries()) {
      const ggr = parseFloat((data.turnover - data.payouts).toFixed(2));
      const hold = data.turnover > 0 ? parseFloat(((ggr / data.turnover) * 100).toFixed(2)) : 0;
      result.push({
        date,
        ticketCount: data.count,
        turnover: parseFloat(data.turnover.toFixed(2)),
        payouts: parseFloat(data.payouts.toFixed(2)),
        ggr,
        holdPercentage: hold,
        activePlayers: data.players.size,
      });
    }

    return result.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Cashier Terminal Shift Float Reconciliation
   */
  public generateCashierDaily(params: {
    cashierId: string;
    branchId?: string;
    shiftDate?: Date;
    openingFloat: number;
    actualClosingFloat: number;
  }): CashierDailyShiftReport {
    const shiftDay = (params.shiftDate || new Date()).toISOString().slice(0, 10);
    const tickets = Array.from((this.ticketManager as any).tickets.values()) as LegacyTicketRecord[];

    let cashInTickets = 0;
    let ticketsSold = 0;
    let cashOutPayouts = 0;
    let ticketsPaid = 0;

    for (const t of tickets) {
      const ticketDay = t.createdAt.toISOString().slice(0, 10);
      if (t.cashierId === params.cashierId && ticketDay === shiftDay) {
        cashInTickets += t.stake;
        ticketsSold++;
      }
      if (t.cashierId === params.cashierId && t.paidAt && t.paidAt.toISOString().slice(0, 10) === shiftDay) {
        cashOutPayouts += t.actualPayout || t.potentialPayout;
        ticketsPaid++;
      }
    }

    const expectedClosingFloat = parseFloat(
      (params.openingFloat + cashInTickets - cashOutPayouts).toFixed(2)
    );
    const variance = parseFloat((params.actualClosingFloat - expectedClosingFloat).toFixed(2));

    return {
      cashierId: params.cashierId,
      branchId: params.branchId || 'BR-01',
      shiftDate: shiftDay,
      openingFloat: parseFloat(params.openingFloat.toFixed(2)),
      cashInTickets: parseFloat(cashInTickets.toFixed(2)),
      ticketsSold,
      cashOutPayouts: parseFloat(cashOutPayouts.toFixed(2)),
      ticketsPaid,
      voucherDeposits: 0,
      expectedClosingFloat,
      actualClosingFloat: parseFloat(params.actualClosingFloat.toFixed(2)),
      variance,
    };
  }

  /**
   * Sportsbook Performance Rollup by Sport & Market Type
   */
  public generateSportsbookPerformance(filter?: DateRangeFilter): SportsbookPerformanceRow[] {
    const from = filter?.fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = filter?.toDate || new Date();

    const tickets = Array.from((this.ticketManager as any).tickets.values()) as LegacyTicketRecord[];
    const categoryMap = new Map<string, { count: number; turnover: number; won: number }>();

    for (const t of tickets) {
      if (t.createdAt >= from && t.createdAt <= to) {
        for (const leg of t.legs) {
          const sport = leg.fixtureName.includes(' vs ') ? 'Soccer' : 'Sports';
          const key = `${sport}::${leg.marketName || 'Match Winner'}`;

          if (!categoryMap.has(key)) {
            categoryMap.set(key, { count: 0, turnover: 0, won: 0 });
          }
          const item = categoryMap.get(key)!;
          item.count++;
          item.turnover += t.stake / t.legs.length;
          if (t.status === 'WON' || t.status === 'PAID_OUT') {
            item.won += (t.actualPayout || t.potentialPayout) / t.legs.length;
          }
        }
      }
    }

    const rows: SportsbookPerformanceRow[] = [];
    for (const [key, val] of categoryMap.entries()) {
      const [sportName, marketName] = key.split('::');
      const turnover = parseFloat(val.turnover.toFixed(2));
      const wonAmount = parseFloat(val.won.toFixed(2));
      const ggr = parseFloat((turnover - wonAmount).toFixed(2));
      const holdPercentage = turnover > 0 ? parseFloat(((ggr / turnover) * 100).toFixed(2)) : 0;

      rows.push({
        sportName,
        marketName,
        ticketLegCount: val.count,
        turnover,
        wonAmount,
        ggr,
        holdPercentage,
      });
    }

    return rows;
  }

  /**
   * Agent Downline Commission Calculation
   */
  public generateAgentCommissions(params: {
    commissionRate?: number; // default 5% turnover commission
    commissionType?: 'TURNOVER' | 'GGR_REVENUE_SHARE';
    filter?: DateRangeFilter;
  }): AgentCommissionRow[] {
    const rate = params.commissionRate || 0.05;
    const type = params.commissionType || 'TURNOVER';
    const users = this.userManager.getAllUsers();
    const tickets = Array.from((this.ticketManager as any).tickets.values()) as LegacyTicketRecord[];

    const agentRows: AgentCommissionRow[] = [];

    for (const user of users) {
      if (user.role === 'AGENT' || user.role === 'SUBADMIN' || user.role === 'BRANCH') {
        // Collect downline users
        const downline = users.filter((u) => u.parentId === user.id);
        const downlineIds = new Set(downline.map((d) => d.id));
        downlineIds.add(user.id);

        let turnover = 0;
        let payouts = 0;

        for (const t of tickets) {
          if (downlineIds.has(t.userId) || t.cashierId === user.id || t.branchId === user.id) {
            turnover += t.stake;
            if (t.status === 'WON' || t.status === 'PAID_OUT') {
              payouts += t.actualPayout || t.potentialPayout;
            }
          }
        }

        const ggr = parseFloat((turnover - payouts).toFixed(2));
        let netCommission = 0;
        if (type === 'TURNOVER') {
          netCommission = parseFloat((turnover * rate).toFixed(2));
        } else {
          netCommission = ggr > 0 ? parseFloat((ggr * rate).toFixed(2)) : 0;
        }

        agentRows.push({
          agentId: user.id,
          agentName: user.username,
          role: user.role,
          downlineUsersCount: downline.length,
          downlineTurnover: parseFloat(turnover.toFixed(2)),
          downlinePayouts: parseFloat(payouts.toFixed(2)),
          downlineGgr: ggr,
          commissionRate: rate,
          commissionType: type,
          netCommissionEarned: netCommission,
        });
      }
    }

    return agentRows;
  }
}
