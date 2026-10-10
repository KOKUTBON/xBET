import { UserRole } from '../auth/role-hierarchy.ts';
import { UserManager } from '../users/user-manager.ts';
import { TicketManager } from '../tickets/ticket-manager.ts';
import { WithdrawManager } from '../payments/withdraw-manager.ts';

export interface AdminGlobalMetrics {
  totalTurnover: number;
  totalPayouts: number;
  grossGamingRevenue: number;
  houseMarginPercentage: number;
  activeTicketsCount: number;
  totalUsersCount: number;
  pendingKycCount: number;
  pendingWithdrawalsCount: number;
}

export interface AgentMetrics {
  agentUsername: string;
  totalBranchesCount: number;
  turnoverGenerated: number;
  commissionEarned: number;
  commissionRatePercentage: number;
  availableCreditFloat: number;
}

export interface BranchMetrics {
  branchName: string;
  activeCashiersCount: number;
  dailyTurnover: number;
  dailyPayouts: number;
  netCashTillBalance: number;
  totalTicketsCount: number;
}

export interface CashierTillMetrics {
  cashierUsername: string;
  shiftStartTime: Date;
  ticketsSoldToday: number;
  winningTicketsPaidToday: number;
  cashReceivedToday: number;
  cashPaidToday: number;
  currentDrawerFloat: number;
}

export class DashboardService {
  private static instance: DashboardService;
  private userManager: UserManager;
  private ticketManager: TicketManager;
  private withdrawManager: WithdrawManager;

  private constructor() {
    this.userManager = UserManager.getInstance();
    this.ticketManager = TicketManager.getInstance();
    this.withdrawManager = WithdrawManager.getInstance();
  }

  public static getInstance(): DashboardService {
    if (!DashboardService.instance) {
      DashboardService.instance = new DashboardService();
    }
    return DashboardService.instance;
  }

  public getAdministratorMetrics(): AdminGlobalMetrics {
    const totalTurnover = 254800.0;
    const totalPayouts = 231600.0;
    const grossGamingRevenue = parseFloat((totalTurnover - totalPayouts).toFixed(2));
    const houseMarginPercentage = parseFloat(((grossGamingRevenue / totalTurnover) * 100).toFixed(2));

    return {
      totalTurnover,
      totalPayouts,
      grossGamingRevenue,
      houseMarginPercentage,
      activeTicketsCount: 42,
      totalUsersCount: 1250,
      pendingKycCount: 5,
      pendingWithdrawalsCount: 2,
    };
  }

  public getAgentMetrics(agentUserId: string): AgentMetrics {
    const agent = this.userManager.getUserById(agentUserId);
    const turnoverGenerated = 48500.0;
    const commissionRatePercentage = 5.0; // 5% turnover commission
    const commissionEarned = parseFloat(((turnoverGenerated * commissionRatePercentage) / 100).toFixed(2));

    return {
      agentUsername: agent?.username || 'agent_master',
      totalBranchesCount: 4,
      turnoverGenerated,
      commissionEarned,
      commissionRatePercentage,
      availableCreditFloat: agent?.availableCredit ?? 7000.0,
    };
  }

  public getBranchMetrics(branchName: string = 'Retail Branch #01'): BranchMetrics {
    const dailyTurnover = 6800.0;
    const dailyPayouts = 4950.0;
    const netCashTillBalance = parseFloat((dailyTurnover - dailyPayouts).toFixed(2));

    return {
      branchName,
      activeCashiersCount: 3,
      dailyTurnover,
      dailyPayouts,
      netCashTillBalance,
      totalTicketsCount: 84,
    };
  }

  public getCashierTillMetrics(cashierUserId: string): CashierTillMetrics {
    const cashier = this.userManager.getUserById(cashierUserId);
    const cashReceivedToday = 1450.0;
    const cashPaidToday = 820.0;
    const currentDrawerFloat = parseFloat((500.0 + cashReceivedToday - cashPaidToday).toFixed(2));

    return {
      cashierUsername: cashier?.username || 'cashier_tom',
      shiftStartTime: new Date(),
      ticketsSoldToday: 24,
      winningTicketsPaidToday: 8,
      cashReceivedToday,
      cashPaidToday,
      currentDrawerFloat,
    };
  }
}
