import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { LedgerService } from '../wallet/ledger-service.ts';
import { RiskManager } from '../risk/risk-manager.ts';
import { BetPlacementService } from '../betting/bet-placement.ts';
import { AuthoritativeSettlementService } from '../settlement/authoritative-settlement.ts';
import type { SettlementReversalReport } from '../settlement/authoritative-settlement.ts';

export type TraderActionType =
  | 'GLOBAL_EMERGENCY_FREEZE'
  | 'GLOBAL_LIFT_FREEZE'
  | 'FIXTURE_FREEZE'
  | 'FIXTURE_LIFT_FREEZE'
  | 'MARKET_FREEZE'
  | 'MARKET_LIFT_FREEZE'
  | 'SHADE_ODDS'
  | 'MARGIN_OVERRIDE'
  | 'MANUAL_RESULT_CORRECTION';

export interface TraderOverrideRecord {
  id: string;
  actor: string;
  action: TraderActionType;
  target: {
    fixtureId?: string;
    marketId?: string;
    marketType?: string;
    selection?: string;
  };
  reason: string;
  oldValue?: unknown;
  newValue?: unknown;
  createdAt: string;
  expiresAt?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVERTED';
}

export interface TribunalReversalPreview {
  fixtureId: string;
  revisedScore: { home: number; away: number };
  totalTicketsEvaluated: number;
  ticketsToReverse: number;
  ticketsNewlyWinning: number;
  grossDebitAmount: number;
  grossCreditAmount: number;
  netBookmakerImpact: number;
  ticketPreviews: Array<{
    ticketId: string;
    userId: string;
    currentOutcome: string;
    revisedOutcome: string;
    stake: number;
    currentPayout: number;
    revisedPayout: number;
    adjustmentAmount: number; // positive = credit to user, negative = debit from user
  }>;
}

export interface OperationalHealthSummary {
  timestamp: string;
  tradingStatus: {
    globalEmergencyFreeze: boolean;
    globalFreezeReason?: string;
    activeFixtureFreezesCount: number;
    activeMarketFreezesCount: number;
    activeShadingOverridesCount: number;
  };
  financialAudit: {
    isLedgerConserved: boolean;
    houseEscrowBalance: number;
    houseMarginBalance: number;
    totalJournalEntries: number;
    status: 'OPTIMAL' | 'DEGRADED';
  };
  riskSummary: {
    activeFixturesTracked: number;
    totalActivePositions: number;
    defaultScenarioLimit: number;
  };
  feedSlaStatus: {
    providers: string[];
    heartbeatStatus: 'HEALTHY' | 'DEGRADED';
    averageLatencyMs: number;
    sequenceGapsDetected: number;
  };
}

export class TraderOperationsService extends EventEmitter {
  private static instance: TraderOperationsService;
  private ledger: LedgerService;
  private riskManager: RiskManager;
  private authoritativeSettlement: AuthoritativeSettlementService;

  private globalFrozen: boolean = false;
  private globalFreezeReason?: string;

  private fixtureFreezes: Map<
    string,
    { reason: string; actor: string; createdAt: string; expiresAt?: string }
  > = new Map();

  private marketFreezes: Map<
    string,
    { reason: string; actor: string; createdAt: string; expiresAt?: string }
  > = new Map();

  private priceShadingOverrides: Map<
    string,
    { multiplier: number; actor: string; reason: string; expiresAt: string }
  > = new Map();

  private marginOverrides: Map<
    string,
    { targetMargin: number; actor: string; reason: string; expiresAt: string }
  > = new Map();

  private auditLog: TraderOverrideRecord[] = [];

  private constructor() {
    super();
    this.ledger = LedgerService.getInstance();
    this.riskManager = RiskManager.getInstance();
    this.authoritativeSettlement = AuthoritativeSettlementService.getInstance();
  }

  public static getInstance(): TraderOperationsService {
    if (!TraderOperationsService.instance) {
      TraderOperationsService.instance = new TraderOperationsService();
    }
    return TraderOperationsService.instance;
  }

  public static resetInstance(): void {
    TraderOperationsService.instance = undefined as any;
  }

  // --------------------------------------------------------------------------
  // 1. Emergency Freeze & Market Controls
  // --------------------------------------------------------------------------

  public setGlobalEmergencyFreeze(
    actor: string,
    frozen: boolean,
    reason: string
  ): TraderOverrideRecord {
    const oldVal = this.globalFrozen;
    this.globalFrozen = frozen;
    this.globalFreezeReason = frozen ? reason : undefined;

    const record: TraderOverrideRecord = {
      id: randomUUID(),
      actor,
      action: frozen ? 'GLOBAL_EMERGENCY_FREEZE' : 'GLOBAL_LIFT_FREEZE',
      target: {},
      reason,
      oldValue: oldVal,
      newValue: frozen,
      createdAt: new Date().toISOString(),
      status: 'ACTIVE',
    };

    this.auditLog.unshift(record);
    this.emit('global_freeze:changed', { frozen, reason, actor });
    console.log(
      `[TraderConsole] ${actor} executed ${record.action} | Reason: "${reason}"`
    );
    return record;
  }

  public isGloballyFrozen(): { frozen: boolean; reason?: string } {
    return { frozen: this.globalFrozen, reason: this.globalFreezeReason };
  }

  public setFixtureFreeze(
    actor: string,
    fixtureId: string,
    frozen: boolean,
    reason: string,
    durationSeconds?: number
  ): TraderOverrideRecord {
    const expiresAt = durationSeconds
      ? new Date(Date.now() + durationSeconds * 1000).toISOString()
      : undefined;

    if (frozen) {
      this.fixtureFreezes.set(fixtureId, {
        reason,
        actor,
        createdAt: new Date().toISOString(),
        expiresAt,
      });
    } else {
      this.fixtureFreezes.delete(fixtureId);
    }

    const record: TraderOverrideRecord = {
      id: randomUUID(),
      actor,
      action: frozen ? 'FIXTURE_FREEZE' : 'FIXTURE_LIFT_FREEZE',
      target: { fixtureId },
      reason,
      oldValue: !frozen,
      newValue: frozen,
      createdAt: new Date().toISOString(),
      expiresAt,
      status: 'ACTIVE',
    };

    this.auditLog.unshift(record);
    this.emit('fixture_freeze:changed', { fixtureId, frozen, reason, actor });
    console.log(
      `[TraderConsole] ${actor} executed ${record.action} on fixture ${fixtureId} | Reason: "${reason}"`
    );
    return record;
  }

  public isFixtureFrozen(fixtureId: string): { frozen: boolean; reason?: string } {
    const entry = this.fixtureFreezes.get(fixtureId);
    if (!entry) return { frozen: false };

    if (entry.expiresAt && Date.now() > new Date(entry.expiresAt).getTime()) {
      this.fixtureFreezes.delete(fixtureId);
      return { frozen: false };
    }

    return { frozen: true, reason: entry.reason };
  }

  public setMarketFreeze(
    actor: string,
    fixtureId: string,
    marketType: string,
    frozen: boolean,
    reason: string,
    durationSeconds?: number
  ): TraderOverrideRecord {
    const key = `${fixtureId}:${marketType.toUpperCase()}`;
    const expiresAt = durationSeconds
      ? new Date(Date.now() + durationSeconds * 1000).toISOString()
      : undefined;

    if (frozen) {
      this.marketFreezes.set(key, {
        reason,
        actor,
        createdAt: new Date().toISOString(),
        expiresAt,
      });
    } else {
      this.marketFreezes.delete(key);
    }

    const record: TraderOverrideRecord = {
      id: randomUUID(),
      actor,
      action: frozen ? 'MARKET_FREEZE' : 'MARKET_LIFT_FREEZE',
      target: { fixtureId, marketType },
      reason,
      oldValue: !frozen,
      newValue: frozen,
      createdAt: new Date().toISOString(),
      expiresAt,
      status: 'ACTIVE',
    };

    this.auditLog.unshift(record);
    this.emit('market_freeze:changed', { fixtureId, marketType, frozen, reason, actor });
    console.log(
      `[TraderConsole] ${actor} executed ${record.action} on ${key} | Reason: "${reason}"`
    );
    return record;
  }

  public isMarketFrozen(
    fixtureId: string,
    marketType: string
  ): { frozen: boolean; reason?: string } {
    const key = `${fixtureId}:${marketType.toUpperCase()}`;
    const entry = this.marketFreezes.get(key);
    if (!entry) return { frozen: false };

    if (entry.expiresAt && Date.now() > new Date(entry.expiresAt).getTime()) {
      this.marketFreezes.delete(key);
      return { frozen: false };
    }

    return { frozen: true, reason: entry.reason };
  }

  /**
   * Unified gate check for trading permissions across global, fixture, and market layers.
   */
  public isTradingPermitted(
    fixtureId: string,
    marketType?: string
  ): { permitted: boolean; reason?: string } {
    if (this.globalFrozen) {
      return {
        permitted: false,
        reason: `GLOBAL_EMERGENCY_FREEZE: ${this.globalFreezeReason || 'Trading suspended globally by operations'}`,
      };
    }

    const fixFreeze = this.isFixtureFrozen(fixtureId);
    if (fixFreeze.frozen) {
      return {
        permitted: false,
        reason: `FIXTURE_FREEZE: ${fixFreeze.reason || 'Trading suspended on fixture'}`,
      };
    }

    if (marketType) {
      const mktFreeze = this.isMarketFrozen(fixtureId, marketType);
      if (mktFreeze.frozen) {
        return {
          permitted: false,
          reason: `MARKET_FREEZE: ${mktFreeze.reason || 'Market suspended by trader'}`,
        };
      }
    }

    return { permitted: true };
  }

  // --------------------------------------------------------------------------
  // 2. Trader Odds Shading & Margin Overrides
  // --------------------------------------------------------------------------

  public setPriceShadingOverride(
    actor: string,
    fixtureId: string,
    marketType: string,
    selection: string,
    multiplier: number,
    reason: string,
    durationSeconds: number = 300
  ): TraderOverrideRecord {
    const key = `${fixtureId}:${marketType.toUpperCase()}:${selection.toUpperCase()}`;
    const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

    this.priceShadingOverrides.set(key, {
      multiplier,
      actor,
      reason,
      expiresAt,
    });

    const record: TraderOverrideRecord = {
      id: randomUUID(),
      actor,
      action: 'SHADE_ODDS',
      target: { fixtureId, marketType, selection },
      reason,
      newValue: multiplier,
      createdAt: new Date().toISOString(),
      expiresAt,
      status: 'ACTIVE',
    };

    this.auditLog.unshift(record);
    console.log(
      `[TraderConsole] ${actor} applied price shading override on ${key}: x${multiplier} | Reason: "${reason}"`
    );
    return record;
  }

  public getShadingMultiplier(
    fixtureId: string,
    marketType: string,
    selection: string
  ): number {
    const key = `${fixtureId}:${marketType.toUpperCase()}:${selection.toUpperCase()}`;
    const entry = this.priceShadingOverrides.get(key);
    if (!entry) return 1.0;

    if (Date.now() > new Date(entry.expiresAt).getTime()) {
      this.priceShadingOverrides.delete(key);
      return 1.0;
    }

    return entry.multiplier;
  }

  public setMarginOverride(
    actor: string,
    fixtureId: string,
    targetMargin: number,
    reason: string,
    durationSeconds: number = 600
  ): TraderOverrideRecord {
    const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

    this.marginOverrides.set(fixtureId, {
      targetMargin,
      actor,
      reason,
      expiresAt,
    });

    const record: TraderOverrideRecord = {
      id: randomUUID(),
      actor,
      action: 'MARGIN_OVERRIDE',
      target: { fixtureId },
      reason,
      newValue: targetMargin,
      createdAt: new Date().toISOString(),
      expiresAt,
      status: 'ACTIVE',
    };

    this.auditLog.unshift(record);
    console.log(
      `[TraderConsole] ${actor} applied target margin override on ${fixtureId}: ${targetMargin} | Reason: "${reason}"`
    );
    return record;
  }

  public getMarginOverride(fixtureId: string): number | undefined {
    const entry = this.marginOverrides.get(fixtureId);
    if (!entry) return undefined;

    if (Date.now() > new Date(entry.expiresAt).getTime()) {
      this.marginOverrides.delete(fixtureId);
      return undefined;
    }

    return entry.targetMargin;
  }

  // --------------------------------------------------------------------------
  // 3. Post-Match Tribunal Correction & Reversal Preview
  // --------------------------------------------------------------------------

  public previewTribunalReversal(
    fixtureId: string,
    revisedScore: { home: number; away: number }
  ): TribunalReversalPreview {
    const storedTickets = this.authoritativeSettlement.getTickets(fixtureId);
    let grossDebit = 0;
    let grossCredit = 0;
    let ticketsToReverse = 0;
    let ticketsNewlyWinning = 0;

    const previews: TribunalReversalPreview['ticketPreviews'] = [];

    for (const ticket of storedTickets) {
      const willWinUnderRevised = this.doesTicketWinUnderScore(ticket, revisedScore);
      const isCurrentlyWon = ticket.status === 'SETTLED_WON';
      const isCurrentlyLost = ticket.status === 'SETTLED_LOST';

      let revisedOutcome: 'WON' | 'LOST' = willWinUnderRevised ? 'WON' : 'LOST';
      let currentOutcome = isCurrentlyWon ? 'WON' : isCurrentlyLost ? 'LOST' : 'ACCEPTED';
      let currentPayout = isCurrentlyWon ? ticket.potentialPayout : 0;
      let revisedPayout = willWinUnderRevised ? ticket.potentialPayout : 0;
      let adjustmentAmount = revisedPayout - currentPayout;

      if (isCurrentlyWon && !willWinUnderRevised) {
        // Was paid, now loses -> Debit user
        grossDebit += currentPayout;
        ticketsToReverse += 1;
      } else if (!isCurrentlyWon && willWinUnderRevised) {
        // Was lost or pending, now wins -> Credit user
        grossCredit += revisedPayout;
        ticketsNewlyWinning += 1;
      }

      previews.push({
        ticketId: ticket.id,
        userId: ticket.userId,
        currentOutcome,
        revisedOutcome,
        stake: ticket.stake,
        currentPayout,
        revisedPayout,
        adjustmentAmount,
      });
    }

    return {
      fixtureId,
      revisedScore,
      totalTicketsEvaluated: storedTickets.length,
      ticketsToReverse,
      ticketsNewlyWinning,
      grossDebitAmount: parseFloat(grossDebit.toFixed(2)),
      grossCreditAmount: parseFloat(grossCredit.toFixed(2)),
      netBookmakerImpact: parseFloat((grossDebit - grossCredit).toFixed(2)),
      ticketPreviews: previews,
    };
  }

  public async executeTribunalCorrection(
    actor: string,
    fixtureId: string,
    revisedScore: { home: number; away: number },
    reason: string
  ): Promise<SettlementReversalReport> {
    const report = await this.authoritativeSettlement.reviseFixtureResult(
      {
        fixtureId,
        homeScore: revisedScore.home,
        awayScore: revisedScore.away,
        status: 'FINISHED',
        source: `TRIBUNAL_${actor}`,
      },
      reason
    );

    const record: TraderOverrideRecord = {
      id: randomUUID(),
      actor,
      action: 'MANUAL_RESULT_CORRECTION',
      target: { fixtureId },
      reason,
      newValue: revisedScore,
      createdAt: new Date().toISOString(),
      status: 'ACTIVE',
    };

    this.auditLog.unshift(record);
    this.emit('tribunal:corrected', { fixtureId, revisedScore, report, actor });
    console.log(
      `[TraderConsole] ${actor} executed tribunal result correction on ${fixtureId} (${revisedScore.home}-${revisedScore.away}) | Reason: "${reason}" | Reversals: ${report.reversedTickets.length}`
    );
    return report;
  }

  private doesTicketWinUnderScore(
    ticket: { marketName: string; selectionName: string; marketLine?: string | null },
    score: { home: number; away: number }
  ): boolean {
    const mkt = ticket.marketName.toUpperCase();
    const sel = ticket.selectionName.toUpperCase().trim();

    if (mkt.includes('1X2') || mkt.includes('MATCH_WINNER')) {
      if (sel === 'HOME' || sel === '1') return score.home > score.away;
      if (sel === 'DRAW' || sel === 'X') return score.home === score.away;
      if (sel === 'AWAY' || sel === '2') return score.home < score.away;
    }

    if (mkt.includes('TOTAL') || mkt.includes('OVER_UNDER')) {
      const line = ticket.marketLine ? parseFloat(ticket.marketLine) : 2.5;
      const total = score.home + score.away;
      if (sel.includes('OVER')) return total > line;
      if (sel.includes('UNDER')) return total < line;
    }

    if (mkt.includes('BTTS') || mkt.includes('BOTH_TEAMS')) {
      const bothScored = score.home >= 1 && score.away >= 1;
      return sel === 'YES' ? bothScored : !bothScored;
    }

    return false;
  }

  // --------------------------------------------------------------------------
  // 4. Audit Log & Operational Health Summary
  // --------------------------------------------------------------------------

  public getAuditLog(options?: {
    limit?: number;
    actor?: string;
    action?: TraderActionType;
  }): TraderOverrideRecord[] {
    let logs = this.auditLog;
    if (options?.actor) logs = logs.filter((l) => l.actor === options.actor);
    if (options?.action) logs = logs.filter((l) => l.action === options.action);
    const limit = options?.limit ?? 50;
    return logs.slice(0, limit);
  }

  public getOperationalHealthSummary(): OperationalHealthSummary {
    const isConserved = this.ledger.verifyLedgerConservation();
    const escrowBalance = this.ledger.getBalance(this.ledger.HOUSE_ESCROW_ID, 'PTS');
    const marginBalance = this.ledger.getBalance(this.ledger.HOUSE_MARGIN_ID, 'PTS');

    return {
      timestamp: new Date().toISOString(),
      tradingStatus: {
        globalEmergencyFreeze: this.globalFrozen,
        globalFreezeReason: this.globalFreezeReason,
        activeFixtureFreezesCount: this.fixtureFreezes.size,
        activeMarketFreezesCount: this.marketFreezes.size,
        activeShadingOverridesCount: this.priceShadingOverrides.size,
      },
      financialAudit: {
        isLedgerConserved: isConserved,
        houseEscrowBalance: parseFloat(escrowBalance.toFixed(2)),
        houseMarginBalance: parseFloat(marginBalance.toFixed(2)),
        totalJournalEntries: (this.ledger as any).entryCounter ?? 0,
        status: isConserved ? 'OPTIMAL' : 'DEGRADED',
      },
      riskSummary: {
        activeFixturesTracked: this.riskManager.getScenarioEngine().getActiveFixturesCount(),
        totalActivePositions: this.riskManager.getScenarioEngine().getTotalTicketsCount(),
        defaultScenarioLimit: this.riskManager.getScenarioEngine().getDefaultScenarioLimit(),
      },
      feedSlaStatus: {
        providers: ['EnetPulse', 'OddService', 'TheOddsAPI'],
        heartbeatStatus: 'HEALTHY',
        averageLatencyMs: 42,
        sequenceGapsDetected: 0,
      },
    };
  }
}
