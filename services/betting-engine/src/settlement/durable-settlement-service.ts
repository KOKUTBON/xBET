import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { TransactionalOutboxService } from '../distributed/transactional-outbox-service.ts';
import { DistributedLockService } from '../distributed/distributed-lock-service.ts';

export interface FinalMatchResult {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  status: 'FINISHED' | 'ABANDONED';
  actorId?: string;
  notes?: string;
}

export interface DurableSettledTicket {
  ticketId: string;
  userId: string;
  outcome: 'WON' | 'LOST' | 'VOID';
  stakeMinor: number;
  payoutMinor: number;
  journalId: string;
  revision: number;
}

export interface DurableSettlementReport {
  fixtureId: string;
  revision: number;
  totalSettled: number;
  winningCount: number;
  losingCount: number;
  totalPayoutMinor: number;
  settledTickets: DurableSettledTicket[];
}

export interface DurableReversalReport {
  fixtureId: string;
  priorRevision: number;
  newRevision: number;
  reversedTickets: Array<{
    ticketId: string;
    userId: string;
    reversedPayoutMinor: number;
    reversalJournalId: string;
  }>;
  newlySettledTickets: DurableSettledTicket[];
}

export class DurableSettlementService {
  private static instance: DurableSettlementService | null = null;
  private pool?: pg.Pool;
  private outbox: TransactionalOutboxService;
  private lockService: DistributedLockService;

  constructor(pool?: pg.Pool) {
    this.pool = pool;
    this.outbox = TransactionalOutboxService.getInstance(pool);
    this.lockService = DistributedLockService.getInstance(pool);
  }

  public static getInstance(pool?: pg.Pool): DurableSettlementService {
    if (!this.instance || pool) {
      this.instance = new DurableSettlementService(pool);
    }
    return this.instance;
  }

  /**
   * Settles all open tickets for a fixture in PostgreSQL or durable memory with full double-entry accounting.
   */
  public async settleFixture(result: FinalMatchResult): Promise<DurableSettlementReport> {
    return this.lockService.lockFixture(result.fixtureId, async () => {
      if (!this.pool) {
        throw new Error('DurableSettlementService requires a configured database pool.');
      }

      const client = await this.pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 1. Record Fixture Result
        const revision = 1;
        await client.query(
          `INSERT INTO points_fixture_results (fixture_id, revision, home_score, away_score, status, actor_id, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (fixture_id, revision) DO UPDATE
             SET home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score, status = EXCLUDED.status`,
          [
            result.fixtureId,
            revision,
            result.homeScore,
            result.awayScore,
            result.status,
            result.actorId || 'SYSTEM',
            result.notes || null,
          ]
        );

        // 2. Fetch all open tickets on this fixture
        const openBetsRes = await client.query<{
          id: string;
          user_id: string;
          selection: any;
          stake_minor: string;
          potential_payout_minor: string;
          status: string;
        }>(
          `SELECT id, user_id, selection, stake_minor, potential_payout_minor, status
           FROM points_bets
           WHERE (selection->>'fixtureId') = $1 AND status = 'ACCEPTED'
           FOR UPDATE`,
          [result.fixtureId]
        );

        const settledTickets: DurableSettledTicket[] = [];
        let winningCount = 0;
        let losingCount = 0;
        let totalPayoutMinor = 0;

        for (const bet of openBetsRes.rows) {
          const stakeMinor = Number(bet.stake_minor);
          const potentialPayoutMinor = Number(bet.potential_payout_minor);
          const isWinner = this.evaluateSelection(bet.selection, result.homeScore, result.awayScore);

          const playerKey = `PLAYER:${bet.user_id}:PTS`;
          const escrowKey = 'HOUSE_ESCROW:PTS';
          const marginKey = 'HOUSE_MARGIN:PTS';
          await this.ensureAccounts(client, playerKey, bet.user_id, escrowKey, marginKey);

          const journalId = randomUUID();

          if (isWinner) {
            winningCount++;
            const payoutMinor = potentialPayoutMinor;
            totalPayoutMinor += payoutMinor;
            const profitMinor = payoutMinor - stakeMinor;

            // Escrow -> Player (for stake) & Margin -> Player (for profit)
            await client.query('UPDATE points_accounts SET balance_minor = balance_minor - $2 WHERE account_key = $1', [escrowKey, stakeMinor]);
            if (profitMinor > 0) {
              await client.query('UPDATE points_accounts SET balance_minor = balance_minor - $2 WHERE account_key = $1', [marginKey, profitMinor]);
            }
            await client.query('UPDATE points_accounts SET balance_minor = balance_minor + $2 WHERE account_key = $1', [playerKey, payoutMinor]);

            // Balanced Double-Entry Journal
            await client.query('INSERT INTO points_journals (id, kind, reference_id) VALUES ($1, $2, $3)', [journalId, 'BET_PAYOUT', bet.id]);
            const lines: Array<[string, string, number]> = [
              [randomUUID(), escrowKey, -stakeMinor],
              [randomUUID(), playerKey, payoutMinor],
            ];
            if (profitMinor > 0) {
              lines.push([randomUUID(), marginKey, -profitMinor]);
            }

            for (const [lineId, accKey, delta] of lines) {
              await client.query(
                `INSERT INTO points_journal_lines (id, journal_id, account_key, delta_minor) VALUES ($1, $2, $3, $4)`,
                [lineId, journalId, accKey, delta]
              );
            }

            // Update Ticket Status
            await client.query(
              `UPDATE points_bets SET status = 'WON', settled_payout_minor = $2, settled_at = now() WHERE id = $1`,
              [bet.id, payoutMinor]
            );

            // Record Settlement Revision
            await client.query(
              `INSERT INTO points_settlement_revisions (id, ticket_id, revision, status, payout_minor, journal_id, reason)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [randomUUID(), bet.id, revision, 'WON', payoutMinor, journalId, 'Official Result']
            );

            // Enqueue Outbox Event
            await this.outbox.enqueue('BET_SETTLED', bet.id, {
              ticketId: bet.id,
              userId: bet.user_id,
              outcome: 'WON',
              payoutMinor,
              revision,
            }, client);

            settledTickets.push({
              ticketId: bet.id,
              userId: bet.user_id,
              outcome: 'WON',
              stakeMinor,
              payoutMinor,
              journalId,
              revision,
            });
          } else {
            losingCount++;

            // Escrow -> Margin (House wins stake)
            await client.query('UPDATE points_accounts SET balance_minor = balance_minor - $2 WHERE account_key = $1', [escrowKey, stakeMinor]);
            await client.query('UPDATE points_accounts SET balance_minor = balance_minor + $2 WHERE account_key = $1', [marginKey, stakeMinor]);

            // Balanced Double-Entry Journal
            await client.query('INSERT INTO points_journals (id, kind, reference_id) VALUES ($1, $2, $3)', [journalId, 'BET_LOSS', bet.id]);
            await client.query(
              `INSERT INTO points_journal_lines (id, journal_id, account_key, delta_minor)
               VALUES ($1, $2, $3, $4), ($5, $2, $6, $7)`,
              [randomUUID(), journalId, escrowKey, -stakeMinor, randomUUID(), marginKey, stakeMinor]
            );

            // Update Ticket Status
            await client.query(
              `UPDATE points_bets SET status = 'LOST', settled_payout_minor = 0, settled_at = now() WHERE id = $1`,
              [bet.id]
            );

            // Record Settlement Revision
            await client.query(
              `INSERT INTO points_settlement_revisions (id, ticket_id, revision, status, payout_minor, journal_id, reason)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [randomUUID(), bet.id, revision, 'LOST', 0, journalId, 'Official Result']
            );

            // Enqueue Outbox Event
            await this.outbox.enqueue('BET_SETTLED', bet.id, {
              ticketId: bet.id,
              userId: bet.user_id,
              outcome: 'LOST',
              payoutMinor: 0,
              revision,
            }, client);

            settledTickets.push({
              ticketId: bet.id,
              userId: bet.user_id,
              outcome: 'LOST',
              stakeMinor,
              payoutMinor: 0,
              journalId,
              revision,
            });
          }
        }

        await client.query('COMMIT');

        return {
          fixtureId: result.fixtureId,
          revision,
          totalSettled: settledTickets.length,
          winningCount,
          losingCount,
          totalPayoutMinor,
          settledTickets,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });
  }

  /**
   * Applies an authoritative result revision (e.g., post-match VAR tribunal or referee correction),
   * executing double-entry reversal journal lines and re-settling newly winning tickets.
   */
  public async reviseFixtureResult(
    revisedResult: FinalMatchResult,
    reason: string
  ): Promise<DurableReversalReport> {
    return this.lockService.lockFixture(revisedResult.fixtureId, async () => {
      if (!this.pool) throw new Error('Database pool required');

      const client = await this.pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 1. Get Highest Existing Revision
        const revRes = await client.query<{ max_rev: number }>(
          'SELECT COALESCE(MAX(revision), 1) as max_rev FROM points_fixture_results WHERE fixture_id = $1',
          [revisedResult.fixtureId]
        );
        const priorRevision = Number(revRes.rows[0].max_rev);
        const newRevision = priorRevision + 1;

        // 2. Record New Fixture Result Revision
        await client.query(
          `INSERT INTO points_fixture_results (fixture_id, revision, home_score, away_score, status, actor_id, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            revisedResult.fixtureId,
            newRevision,
            revisedResult.homeScore,
            revisedResult.awayScore,
            revisedResult.status,
            revisedResult.actorId || 'VAR_TRIBUNAL',
            reason,
          ]
        );

        // 3. Find tickets settled under prior revision
        const priorSettledBets = await client.query<{
          id: string;
          user_id: string;
          selection: any;
          stake_minor: string;
          potential_payout_minor: string;
          status: string;
          settled_payout_minor: string;
        }>(
          `SELECT b.id, b.user_id, b.selection, b.stake_minor, b.potential_payout_minor, b.status, b.settled_payout_minor
           FROM points_bets b
           JOIN points_settlement_revisions r ON r.ticket_id = b.id AND r.revision = $2
           WHERE (b.selection->>'fixtureId') = $1
           FOR UPDATE`,
          [revisedResult.fixtureId, priorRevision]
        );

        const reversedTickets: Array<{ ticketId: string; userId: string; reversedPayoutMinor: number; reversalJournalId: string }> = [];
        const newlySettledTickets: DurableSettledTicket[] = [];

        const escrowKey = 'HOUSE_ESCROW:PTS';
        const marginKey = 'HOUSE_MARGIN:PTS';

        for (const bet of priorSettledBets.rows) {
          const stakeMinor = Number(bet.stake_minor);
          const potentialPayoutMinor = Number(bet.potential_payout_minor);
          const previousPayoutMinor = Number(bet.settled_payout_minor);
          const previousStatus = bet.status;
          const playerKey = `PLAYER:${bet.user_id}:PTS`;

          const newlyWinning = this.evaluateSelection(bet.selection, revisedResult.homeScore, revisedResult.awayScore);

          // Reverse previous settlement journal
          const reversalJournalId = randomUUID();
          if (previousStatus === 'WON' && !newlyWinning) {
            // Player won previously, now loses: reverse payout
            const profitMinor = previousPayoutMinor - stakeMinor;
            await client.query('UPDATE points_accounts SET balance_minor = balance_minor - $2 WHERE account_key = $1', [playerKey, previousPayoutMinor]);
            await client.query('UPDATE points_accounts SET balance_minor = balance_minor + $2 WHERE account_key = $1', [escrowKey, stakeMinor]);
            if (profitMinor > 0) {
              await client.query('UPDATE points_accounts SET balance_minor = balance_minor + $2 WHERE account_key = $1', [marginKey, profitMinor]);
            }

            // Move escrow to margin as bet is now lost
            await client.query('UPDATE points_accounts SET balance_minor = balance_minor - $2 WHERE account_key = $1', [escrowKey, stakeMinor]);
            await client.query('UPDATE points_accounts SET balance_minor = balance_minor + $2 WHERE account_key = $1', [marginKey, stakeMinor]);

            await client.query('INSERT INTO points_journals (id, kind, reference_id) VALUES ($1, $2, $3)', [reversalJournalId, 'VAR_REVERSAL', `rev:${bet.id}:${newRevision}`]);
            await client.query(
              `INSERT INTO points_journal_lines (id, journal_id, account_key, delta_minor)
               VALUES ($1, $2, $3, $4), ($5, $2, $6, $7)`,
              [randomUUID(), reversalJournalId, playerKey, -previousPayoutMinor, randomUUID(), marginKey, previousPayoutMinor]
            );

            await client.query(
              `UPDATE points_bets SET status = 'LOST', settled_payout_minor = 0, settled_at = now() WHERE id = $1`,
              [bet.id]
            );

            await client.query(
              `INSERT INTO points_settlement_revisions (id, ticket_id, revision, status, payout_minor, journal_id, reason)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [randomUUID(), bet.id, newRevision, 'LOST', 0, reversalJournalId, `VAR Reversal: ${reason}`]
            );

            reversedTickets.push({
              ticketId: bet.id,
              userId: bet.user_id,
              reversedPayoutMinor: previousPayoutMinor,
              reversalJournalId,
            });

            await this.outbox.enqueue('SETTLEMENT_REVERSED', bet.id, {
              ticketId: bet.id,
              userId: bet.user_id,
              priorRevision,
              newRevision,
              outcome: 'LOST',
              reversedAmountMinor: previousPayoutMinor,
            }, client);
          } else if (previousStatus === 'LOST' && newlyWinning) {
            // Player lost previously, now wins!
            // First reverse the previous loss (Margin -> Escrow)
            await client.query('UPDATE points_accounts SET balance_minor = balance_minor - $2 WHERE account_key = $1', [marginKey, stakeMinor]);
            await client.query('UPDATE points_accounts SET balance_minor = balance_minor + $2 WHERE account_key = $1', [escrowKey, stakeMinor]);

            // Now payout the win:
            const payoutMinor = potentialPayoutMinor;
            const profitMinor = payoutMinor - stakeMinor;

            await client.query('UPDATE points_accounts SET balance_minor = balance_minor - $2 WHERE account_key = $1', [escrowKey, stakeMinor]);
            if (profitMinor > 0) {
              await client.query('UPDATE points_accounts SET balance_minor = balance_minor - $2 WHERE account_key = $1', [marginKey, profitMinor]);
            }
            await client.query('UPDATE points_accounts SET balance_minor = balance_minor + $2 WHERE account_key = $1', [playerKey, payoutMinor]);

            const winJournalId = randomUUID();
            await client.query('INSERT INTO points_journals (id, kind, reference_id) VALUES ($1, $2, $3)', [winJournalId, 'VAR_PAYOUT', `rev:${bet.id}:${newRevision}`]);
            await client.query(
              `INSERT INTO points_journal_lines (id, journal_id, account_key, delta_minor)
               VALUES ($1, $2, $3, $4), ($5, $2, $6, $7)`,
              [randomUUID(), winJournalId, playerKey, payoutMinor, randomUUID(), marginKey, -payoutMinor]
            );

            await client.query(
              `UPDATE points_bets SET status = 'WON', settled_payout_minor = $2, settled_at = now() WHERE id = $1`,
              [bet.id, payoutMinor]
            );

            await client.query(
              `INSERT INTO points_settlement_revisions (id, ticket_id, revision, status, payout_minor, journal_id, reason)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [randomUUID(), bet.id, newRevision, 'WON', payoutMinor, winJournalId, `VAR Reversal: ${reason}`]
            );

            newlySettledTickets.push({
              ticketId: bet.id,
              userId: bet.user_id,
              outcome: 'WON',
              stakeMinor,
              payoutMinor,
              journalId: winJournalId,
              revision: newRevision,
            });

            await this.outbox.enqueue('BET_SETTLED', bet.id, {
              ticketId: bet.id,
              userId: bet.user_id,
              priorRevision,
              newRevision,
              outcome: 'WON',
              payoutMinor,
            }, client);
          }
        }

        await client.query('COMMIT');

        return {
          fixtureId: revisedResult.fixtureId,
          priorRevision,
          newRevision,
          reversedTickets,
          newlySettledTickets,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });
  }

  private evaluateSelection(selection: any, homeScore: number, awayScore: number): boolean {
    const market = String(selection.marketName || '').toLowerCase();
    const sel = String(selection.selectionName || '').toLowerCase();

    // 1. 1X2 Match Winner
    if (market.includes('1x2') || market.includes('match winner')) {
      if (homeScore > awayScore) return sel.includes('home') || sel === '1';
      if (homeScore === awayScore) return sel.includes('draw') || sel === 'x';
      return sel.includes('away') || sel === '2';
    }

    // 2. Over / Under Totals
    if (market.includes('total') || market.includes('over/under') || market.includes('over / under')) {
      const line = parseFloat(selection.marketLine || '2.5');
      const totalGoals = homeScore + awayScore;
      if (sel.includes('over')) return totalGoals > line;
      if (sel.includes('under')) return totalGoals < line;
    }

    // 3. Both Teams to Score (BTTS)
    if (market.includes('both teams to score') || market.includes('btts')) {
      const btts = homeScore > 0 && awayScore > 0;
      if (sel === 'yes') return btts;
      if (sel === 'no') return !btts;
    }

    return false;
  }

  private async ensureAccounts(
    client: pg.PoolClient,
    playerKey: string,
    userId: string,
    escrowKey: string,
    marginKey: string
  ): Promise<void> {
    await client.query(`INSERT INTO points_accounts (account_key, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [playerKey, userId]);
    await client.query(`INSERT INTO points_accounts (account_key) VALUES ($1) ON CONFLICT DO NOTHING`, [escrowKey]);
    await client.query(`INSERT INTO points_accounts (account_key) VALUES ($1) ON CONFLICT DO NOTHING`, [marginKey]);
  }
}
