/**
 * Converted CakePHP RisksController
 * Handles 1:1 Risk Management, sports/leagues liability updates,
 * and high-odd / high-stake warning monitors.
 */

import { Group } from '../models/group.ts';
import { AppController } from './AppController.ts';

export interface RiskWarningTickets {
  bigOddTickets: Array<{ id: string; odd: number; stake: number; potentialWin: number }>;
  bigStakeTickets: Array<{ id: string; stake: number; user: string }>;
  bigWinningTickets: Array<{ id: string; winning: number; user: string }>;
  bigDeposits: Array<{ id: string; amount: number; user: string }>;
  bigWithdraws: Array<{ id: string; amount: number; user: string }>;
}

export class RisksController extends AppController {
  constructor(req?: any) {
    super(req);
    this.name = 'Risks';
  }

  public admin_index(): any {
    const user = this.request.user || { id: 1, group_id: Group.ADMINISTRATOR_GROUP };
    return this.renderJson(this.adminIndex(user));
  }

  public admin_warnings(): any {
    return this.renderJson(this.adminWarnings());
  }

  private globalRiskSettings: Record<string, any> = {
    highest_number_of_agents: { value: 50 },
    highest_number_of_users: { value: 500 },
    maxBet: { value: 5000.0 },
    minBet: { value: 1.0 },
    maxWin: { value: 50000.0 },
    bigOdd: 50.0,
    bigStake: 1000.0,
    bigWinning: 5000.0,
    bigDeposit: 2500.0,
    bigWithdraw: 2000.0,
  };

  /**
   * 1:1 Port of RisksController::admin_index
   */
  public adminIndex(currentUser: { id: number | string; group_id: number; referal_id?: number | string | null }): {
    settings: Record<string, any>;
    view: string;
  } {
    const settings = { ...this.globalRiskSettings };
    let view = 'admin_index';

    switch (currentUser.group_id) {
      case Group.BRANCH_GROUP:
        view = 'admin_index/branch_admin_index';
        settings.maxBet = { value: 2500.0 };
        settings.minBet = { value: 2.0 };
        settings.maxWin = { value: 25000.0 };
        break;
      case Group.AGENT_GROUP:
        view = 'admin_index/agent_admin_index';
        settings.maxBet = { value: 1000.0 };
        settings.minBet = { value: 5.0 };
        settings.maxWin = { value: 10000.0 };
        break;
      default:
        view = 'admin_index';
        break;
    }

    return { settings, view };
  }

  /**
   * 1:1 Port of RisksController::admin_warnings
   */
  public adminWarnings(
    allTickets: any[] = [],
    allDeposits: any[] = [],
    allWithdraws: any[] = []
  ): RiskWarningTickets {
    const bigOddThreshold = this.globalRiskSettings.bigOdd;
    const bigStakeThreshold = this.globalRiskSettings.bigStake;
    const bigWinningThreshold = this.globalRiskSettings.bigWinning;
    const bigDepositThreshold = this.globalRiskSettings.bigDeposit;
    const bigWithdrawThreshold = this.globalRiskSettings.bigWithdraw;

    return {
      bigOddTickets: allTickets.filter((t) => t.odd >= bigOddThreshold),
      bigStakeTickets: allTickets.filter((t) => t.stake >= bigStakeThreshold),
      bigWinningTickets: allTickets.filter((t) => t.potentialWin >= bigWinningThreshold),
      bigDeposits: allDeposits.filter((d) => d.amount >= bigDepositThreshold),
      bigWithdraws: allWithdraws.filter((w) => w.amount >= bigWithdrawThreshold),
    };
  }
}
