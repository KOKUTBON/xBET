import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { PoolClient } from 'pg';
import { LedgerService } from '../wallet/ledger-service.ts';

export interface FinalMatchResult {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  status: 'FINISHED' | 'ABANDONED';
  source: string;
}

export interface SettledTicketResult {
  ticketId: string;
  userId: string;
  outcome: 'WON' | 'LOST' | 'VOID';
  stake: number;
  payout: number;
  journalId?: string;
}

export interface SettlementReport {
  fixtureId: string;
  revision: number;
  totalSettled: number;
  winningTickets: number;
  losingTickets: number;
  totalPayout: number;
  settledTickets: SettledTicketResult[];
}

export interface SettlementReversalReport {
  fixtureId: string;
  priorRevision: number;
  newRevision: number;
  reversedTickets: {
    ticketId: string;
    userId: string;
    reversedPayout: number;
    reversalJournalId: string;
  }[];
  newlySettledTickets: SettledTicketResult[];
}

export interface StoredTicket {
  id: string;
  userId: string;
  fixtureId: string;
  marketName: string;
  marketLine?: string | null;
  selectionName: string;
  stake: number;
  odds: number;
  potentialPayout: number;
  status: 'ACCEPTED' | 'SETTLED_WON' | 'SETTLED_LOST' | 'VOID';
  currencyCode: 'PTS' | 'USD';
}

export class AuthoritativeSettlementService {
  private static instance: AuthoritativeSettlementService;
  private ledger: LedgerService;
  private pool: pg.Pool | null = null;
  private tickets: Map<string, StoredTicket> = new Map();
  private fixtureRevisions: Map<string, number> = new Map();
  private fixtureResults: Map<string, FinalMatchResult> = new Map();

  constructor(pool?: pg.Pool) {
    this.ledger = LedgerService.getInstance();
    this.pool = pool || null;
  }

  public static getInstance(pool?: pg.Pool): AuthoritativeSettlementService {
    if (!AuthoritativeSettlementService.instance) {
      AuthoritativeSettlementService.instance = new AuthoritativeSettlementService(pool);
    }
    return AuthoritativeSettlementService.instance;
  }

  public static resetInstance(): void {
    AuthoritativeSettlementService.instance = undefined as any;
  }

  public registerTicket(ticket: StoredTicket): void {
    this.tickets.set(ticket.id, ticket);
  }

  public getTicket(ticketId: string): StoredTicket | undefined {
    return this.tickets.get(ticketId);
  }

  public getTickets(fixtureId?: string): StoredTicket[] {
    const list = Array.from(this.tickets.values());
    return fixtureId ? list.filter((t) => t.fixtureId === fixtureId) : list;
  }

  /**
   * Settles all open tickets for a fixture against an authoritative final match result.
   */
  public async settleFixture(result: FinalMatchResult): Promise<SettlementReport> {
    const revision = 1;
    this.fixtureRevisions.set(result.fixtureId, revision);
    this.fixtureResults.set(result.fixtureId, result);

    const fixtureTickets = Array.from(this.tickets.values()).filter(
      (t) => t.fixtureId === result.fixtureId && t.status === 'ACCEPTED'
    );

    const settledTickets: SettledTicketResult[] = [];
    let totalPayout = 0;
    let winningCount = 0;
    let losingCount = 0;

    for (const ticket of fixtureTickets) {
      const isWinner = this.evaluateSelection(ticket, result.homeScore, result.awayScore);
      const journalId = randomUUID();

      if (isWinner) {
        winningCount++;
        const payout = ticket.potentialPayout;
        totalPayout += payout;
        ticket.status = 'SETTLED_WON';

        // Credit winning payout to player, debit escrow
        this.ledger.settleWinningBet(ticket.userId, ticket.id, ticket.stake, payout, ticket.currencyCode);

        settledTickets.push({
          ticketId: ticket.id,
          userId: ticket.userId,
          outcome: 'WON',
          stake: ticket.stake,
          payout,
          journalId,
        });
      } else {
        losingCount++;
        ticket.status = 'SETTLED_LOST';

        // Settle losing bet
        this.ledger.settleLosingBet(ticket.userId, ticket.id, ticket.stake, ticket.currencyCode);

        settledTickets.push({
          ticketId: ticket.id,
          userId: ticket.userId,
          outcome: 'LOST',
          stake: ticket.stake,
          payout: 0,
          journalId,
        });
      }
    }

    return {
      fixtureId: result.fixtureId,
      revision,
      totalSettled: fixtureTickets.length,
      winningTickets: winningCount,
      losingTickets: losingCount,
      totalPayout,
      settledTickets,
    };
  }

  /**
   * Applies an authoritative result revision (e.g. post-match VAR overturn or referee correction),
   * executing double-entry reversal journal lines and re-settling newly winning tickets.
   */
  public async reviseFixtureResult(
    revisedResult: FinalMatchResult,
    reason: string
  ): Promise<SettlementReversalReport> {
    const priorRevision = this.fixtureRevisions.get(revisedResult.fixtureId) ?? 1;
    const newRevision = priorRevision + 1;
    this.fixtureRevisions.set(revisedResult.fixtureId, newRevision);
    this.fixtureResults.set(revisedResult.fixtureId, revisedResult);

    const fixtureTickets = Array.from(this.tickets.values()).filter(
      (t) => t.fixtureId === revisedResult.fixtureId
    );

    const reversedTickets: SettlementReversalReport['reversedTickets'] = [];
    const newlySettledTickets: SettledTicketResult[] = [];

    for (const ticket of fixtureTickets) {
      const shouldWinNow = this.evaluateSelection(ticket, revisedResult.homeScore, revisedResult.awayScore);

      if (ticket.status === 'SETTLED_WON' && !shouldWinNow) {
        // Prior winner is now a loser: REVERSAL REQUIRED
        const reversalJournalId = randomUUID();
        const payoutToReverse = ticket.potentialPayout;

        // Debit player for mistaken payout, credit house margin
        this.ledger.adminAdjustPoints(
          ticket.userId,
          -payoutToReverse,
          `reversal:${ticket.id}:rev${newRevision}`,
          ticket.currencyCode
        );

        ticket.status = 'SETTLED_LOST';
        reversedTickets.push({
          ticketId: ticket.id,
          userId: ticket.userId,
          reversedPayout: payoutToReverse,
          reversalJournalId,
        });
      } else if (ticket.status === 'SETTLED_LOST' && shouldWinNow) {
        // Prior loser is now a winner: REVISION PAYOUT REQUIRED
        const revisionJournalId = randomUUID();
        const payout = ticket.potentialPayout;

        this.ledger.adminAdjustPoints(
          ticket.userId,
          payout,
          `revision:${ticket.id}:rev${newRevision}`,
          ticket.currencyCode
        );

        ticket.status = 'SETTLED_WON';
        newlySettledTickets.push({
          ticketId: ticket.id,
          userId: ticket.userId,
          outcome: 'WON',
          stake: ticket.stake,
          payout,
          journalId: revisionJournalId,
        });
      }
    }

    return {
      fixtureId: revisedResult.fixtureId,
      priorRevision,
      newRevision,
      reversedTickets,
      newlySettledTickets,
    };
  }

  private evaluateSelection(ticket: StoredTicket, homeScore: number, awayScore: number): boolean {
    const market = ticket.marketName.toLowerCase();
    const selection = ticket.selectionName.toLowerCase();

    // 1. Match Winner (1X2)
    if (market.includes('1x2') || market.includes('match winner')) {
      if (homeScore > awayScore) return selection.includes('home') || selection === '1';
      if (homeScore === awayScore) return selection.includes('draw') || selection === 'x';
      return selection.includes('away') || selection === '2';
    }

    // 2. Total Goals (Over/Under)
    if (market.includes('total') || market.includes('over/under') || market.includes('over / under')) {
      const line = parseFloat(ticket.marketLine || '2.5');
      const totalGoals = homeScore + awayScore;
      if (selection.includes('over')) return totalGoals > line;
      if (selection.includes('under')) return totalGoals < line;
    }

    // 3. Both Teams to Score (BTTS)
    if (market.includes('both teams to score') || market.includes('btts')) {
      const btts = homeScore > 0 && awayScore > 0;
      if (selection === 'yes') return btts;
      if (selection === 'no') return !btts;
    }

    return false;
  }
}
