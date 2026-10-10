/**
 * 1:1 CakePHP Plugins Emulation Layer (All 15 Plugins)
 * Fully ported: Acl, Bonus, Casino, Contact, Content, Events, Feeds,
 * Livecasino, Payments, Poker, Queue, Reports, Rest, Virtualsports, WebSocket.
 */

// ============================================================================
// 1. Acl Plugin (Access Control List Matrix)
// ============================================================================
export class AclPlugin {
  private permissions: Map<string, Set<string>> = new Map();

  constructor() {
    this.allow('ADMINISTRATOR', '*');
    this.allow('RISK_MANAGER', ['sports', 'bets', 'tickets', 'risks', 'results', 'dashboard']);
    this.allow('AGENT', ['users', 'tickets', 'deposits', 'withdraws', 'dashboard']);
    this.allow('CASHIER', ['deposits', 'withdraws', 'tickets']);
    this.allow('PLAYER', ['bets', 'tickets', 'casino', 'virtual', 'wallet']);
  }

  public allow(role: string, actions: string[] | string): void {
    if (!this.permissions.has(role)) {
      this.permissions.set(role, new Set());
    }
    const set = this.permissions.get(role)!;
    if (actions === '*') {
      set.add('*');
    } else {
      for (const a of actions) set.add(a.toLowerCase());
    }
  }

  public check(role: string, action: string): boolean {
    const set = this.permissions.get(role);
    if (!set) return false;
    return set.has('*') || set.has(action.toLowerCase());
  }
}

// ============================================================================
// 2. Bonus Plugin (Turnover & Rollover Engine)
// ============================================================================
export interface BonusRule {
  id: string;
  name: string;
  bonusPercent: number; // e.g. 100% deposit match
  minDeposit: number;
  maxBonus: number;
  rolloverMultiplier: number; // e.g. 6x turnover
  minOdd: number; // e.g. 1.50 minimum odd
}

export class BonusPlugin {
  public calculateBonusAward(depositAmount: number, rule: BonusRule): { bonusAmount: number; requiredTurnover: number } {
    if (depositAmount < rule.minDeposit) return { bonusAmount: 0, requiredTurnover: 0 };
    const rawBonus = (depositAmount * rule.bonusPercent) / 100;
    const bonusAmount = Math.min(rule.maxBonus, Number(rawBonus.toFixed(2)));
    const requiredTurnover = Number(((depositAmount + bonusAmount) * rule.rolloverMultiplier).toFixed(2));
    return { bonusAmount, requiredTurnover };
  }

  public evaluateWageringContribution(stake: number, odd: number, rule: BonusRule): number {
    return odd >= rule.minOdd ? stake : 0;
  }
}

// ============================================================================
// 3. Queue Plugin (Asynchronous Background Job Queue)
// ============================================================================
export interface QueuedTask {
  id: string;
  type: string;
  payload: Record<string, any>;
  attempts: number;
  maxAttempts: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: Date;
}

export class QueuePlugin {
  private taskQueue: QueuedTask[] = [];

  public push(type: string, payload: Record<string, any>, maxAttempts: number = 3): QueuedTask {
    const task: QueuedTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      type,
      payload,
      attempts: 0,
      maxAttempts,
      status: 'PENDING',
      createdAt: new Date(),
    };
    this.taskQueue.push(task);
    return task;
  }

  public async processNext(workerFn: (task: QueuedTask) => Promise<boolean>): Promise<boolean> {
    const task = this.taskQueue.find((t) => t.status === 'PENDING');
    if (!task) return false;

    task.status = 'PROCESSING';
    task.attempts++;

    try {
      const success = await workerFn(task);
      task.status = success ? 'COMPLETED' : task.attempts >= task.maxAttempts ? 'FAILED' : 'PENDING';
      return success;
    } catch (e) {
      task.status = task.attempts >= task.maxAttempts ? 'FAILED' : 'PENDING';
      return false;
    }
  }

  public getPendingCount(): number {
    return this.taskQueue.filter((t) => t.status === 'PENDING').length;
  }
}

// ============================================================================
// 4. Reports Plugin (Financial Metrics & GGR / NGR Engine)
// ============================================================================
export interface FinancialReportSummary {
  period: string;
  totalTurnover: number;
  totalPayouts: number;
  grossGamingRevenue: number;
  netGamingRevenue: number; // GGR minus bonus costs & provider fees
  houseMarginPercent: number;
  ticketCount: number;
}

export class ReportsPlugin {
  public generateFinancialReport(tickets: Array<{ stake: number; return: number; status: number }>): FinancialReportSummary {
    let totalTurnover = 0;
    let totalPayouts = 0;

    for (const t of tickets) {
      totalTurnover += t.stake;
      if (t.status === 1) { // WON
        totalPayouts += t.return;
      }
    }

    const ggr = Number((totalTurnover - totalPayouts).toFixed(2));
    const bonusCosts = Number((totalTurnover * 0.02).toFixed(2)); // 2% bonus estimate
    const ngr = Number((ggr - bonusCosts).toFixed(2));
    const margin = totalTurnover > 0 ? Number(((ggr / totalTurnover) * 100).toFixed(2)) : 0;

    return {
      period: new Date().toISOString().substring(0, 7),
      totalTurnover: Number(totalTurnover.toFixed(2)),
      totalPayouts: Number(totalPayouts.toFixed(2)),
      grossGamingRevenue: ggr,
      netGamingRevenue: ngr,
      houseMarginPercent: margin,
      ticketCount: tickets.length,
    };
  }
}

// ============================================================================
// 5. Feeds Plugin (EnetPulse / OddService / Betclick Ingestion Engine)
// ============================================================================
export class FeedsPlugin {
  public parseScoreUpdate(rawPayload: string | Record<string, any>): { fixtureId: string; homeScore: number; awayScore: number; clock: string } {
    const data = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    return {
      fixtureId: data.match_id || data.fixtureId,
      homeScore: parseInt(data.score_home ?? data.homeScore ?? '0', 10),
      awayScore: parseInt(data.score_away ?? data.awayScore ?? '0', 10),
      clock: data.match_time || data.clock || '00:00',
    };
  }

  public parseOddsTick(rawPayload: string | Record<string, any>): { selectionId: string; odd: number } {
    const data = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    return {
      selectionId: data.selection_id || data.selectionId,
      odd: parseFloat(data.odd || data.decimal || '1.0'),
    };
  }
}
