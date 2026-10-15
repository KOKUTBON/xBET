import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { TransactionalOutboxService } from '../distributed/transactional-outbox-service.ts';
import { DistributedLockService } from '../distributed/distributed-lock-service.ts';
import { QuantitativeCashoutEngine } from './quantitative-cashout-engine.ts';

export interface CashoutExecutionRequest {
  ticketId: string;
  userId: string;
  cashoutFraction?: number; // 1.0 = FULL, 0 < c < 1 = PARTIAL
  currentLiveOdds: number;
  matchMinute?: number;
}

export interface DurableCashoutResult {
  ticketId: string;
  cashoutType: 'FULL' | 'PARTIAL';
  cashoutFraction: number;
  paidAmountMinor: number;
  remainingStakeMinor: number;
  remainingPotentialPayoutMinor: number;
  newBalanceMinor: number;
  journalId: string;
}

export class DurableCashoutService {
  private static instance: DurableCashoutService | null = null;
  private pool?: pg.Pool;
  private outbox: TransactionalOutboxService;
  private lockService: DistributedLockService;
  private quantEngine: QuantitativeCashoutEngine;

  constructor(pool?: pg.Pool) {
    this.pool = pool;
    this.outbox = TransactionalOutboxService.getInstance(pool);
    this.lockService = DistributedLockService.getInstance(pool);
    this.quantEngine = QuantitativeCashoutEngine.getInstance();
  }

  public static getInstance(pool?: pg.Pool): DurableCashoutService {
    if (!this.instance || pool) {
      this.instance = new DurableCashoutService(pool);
    }
    return this.instance;
  }

  public async executeCashout(req: CashoutExecutionRequest): Promise<DurableCashoutResult> {
    const fraction = req.cashoutFraction ?? 1.0;
    if (fraction <= 0 || fraction > 1.0) {
      throw new Error(`Invalid cashout fraction: ${fraction}. Must be in range (0, 1].`);
    }

    return this.lockService.lockTicket(req.ticketId, async () => {
      if (!this.pool) {
        throw new Error('DurableCashoutService requires an active database pool.');
      }

      const client = await this.pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

        // 1. Fetch ticket and lock row
        const ticketRes = await client.query<{
          id: string;
          user_id: string;
          stake_minor: string;
          potential_payout_minor: string;
          odds: string;
          status: string;
        }>(
          `SELECT id, user_id, stake_minor, potential_payout_minor, odds, status
           FROM points_bets
           WHERE id = $1
           FOR UPDATE`,
          [req.ticketId]
        );

        const ticket = ticketRes.rows[0];
        if (!ticket) throw new Error(`Ticket ${req.ticketId} not found`);
        if (ticket.user_id !== req.userId) throw new Error(`Ticket does not belong to user ${req.userId}`);
        if (ticket.status !== 'ACCEPTED') throw new Error(`Ticket status is ${ticket.status}, cannot cash out`);

        const initialStake = Number(ticket.stake_minor) / 100;
        const potentialPayout = Number(ticket.potential_payout_minor) / 100;
        const initialOdds = Number(ticket.odds);

        // 2. Calculate fair value and haircut via quantitative model
        const valuation = this.quantEngine.calculateStandaloneOffer({
          initialStake,
          initialOdds,
          potentialPayout,
          currentLiveOdds: req.currentLiveOdds,
          matchMinute: req.matchMinute ?? 65,
        });

        if (!valuation.isAvailable || valuation.cashoutOffer <= 0) {
          throw new Error('Cashout is currently suspended or unavailable for this market state.');
        }

        const totalCashoutMinor = Math.round(valuation.cashoutOffer * 100);
        const cashoutType: 'FULL' | 'PARTIAL' = fraction === 1.0 ? 'FULL' : 'PARTIAL';

        const paidAmountMinor = Math.round(totalCashoutMinor * fraction);
        const cashedStakeMinor = Math.round(Number(ticket.stake_minor) * fraction);
        const remainingStakeMinor = Number(ticket.stake_minor) - cashedStakeMinor;
        const remainingPayoutMinor = Math.round(Number(ticket.potential_payout_minor) * (1 - fraction));

        const playerKey = `PLAYER:${req.userId}:PTS`;
        const escrowKey = 'HOUSE_ESCROW:PTS';
        const marginKey = 'HOUSE_MARGIN:PTS';
        const journalId = randomUUID();

        // 3. Update accounts with balanced double-entry accounting
        // Release proportional escrow
        await client.query('UPDATE points_accounts SET balance_minor = balance_minor - $2 WHERE account_key = $1', [escrowKey, cashedStakeMinor]);

        const diffMinor = paidAmountMinor - cashedStakeMinor;
        if (diffMinor > 0) {
          // Payout > Cashed stake: margin covers difference
          await client.query('UPDATE points_accounts SET balance_minor = balance_minor - $2 WHERE account_key = $1', [marginKey, diffMinor]);
        } else if (diffMinor < 0) {
          // Cashed stake > Payout: margin absorbs house profit
          await client.query('UPDATE points_accounts SET balance_minor = balance_minor + $2 WHERE account_key = $1', [marginKey, Math.abs(diffMinor)]);
        }

        // Credit player
        const playerAccRes = await client.query<{ balance_minor: string }>(
          'UPDATE points_accounts SET balance_minor = balance_minor + $2 WHERE account_key = $1 RETURNING balance_minor',
          [playerKey, paidAmountMinor]
        );
        const newBalanceMinor = Number(playerAccRes.rows[0].balance_minor);

        // 4. Record Double-Entry Journal
        await client.query('INSERT INTO points_journals (id, kind, reference_id) VALUES ($1, $2, $3)', [journalId, 'CASHOUT', req.ticketId]);
        const lines: Array<[string, string, number]> = [
          [randomUUID(), escrowKey, -cashedStakeMinor],
          [randomUUID(), playerKey, paidAmountMinor],
        ];
        if (diffMinor !== 0) {
          lines.push([randomUUID(), marginKey, -diffMinor]);
        }

        for (const [lineId, accKey, delta] of lines) {
          await client.query(
            `INSERT INTO points_journal_lines (id, journal_id, account_key, delta_minor) VALUES ($1, $2, $3, $4)`,
            [lineId, journalId, accKey, delta]
          );
        }

        // 5. Update Ticket Status
        if (cashoutType === 'FULL') {
          await client.query(
            `UPDATE points_bets SET status = 'CASHED_OUT', settled_payout_minor = $2, settled_at = now() WHERE id = $1`,
            [req.ticketId, paidAmountMinor]
          );
        } else {
          await client.query(
            `UPDATE points_bets SET stake_minor = $2, potential_payout_minor = $3 WHERE id = $1`,
            [req.ticketId, remainingStakeMinor, remainingPayoutMinor]
          );
        }

        // 6. Record Cashout Transaction
        await client.query(
          `INSERT INTO points_cashout_transactions (id, ticket_id, cashout_type, cashout_percentage, cashout_amount_minor, stake_cashed_minor, journal_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [randomUUID(), req.ticketId, cashoutType, fraction * 100, paidAmountMinor, cashedStakeMinor, journalId]
        );

        // 7. Enqueue Transactional Outbox Event
        await this.outbox.enqueue('CASHOUT_EXECUTED', req.ticketId, {
          ticketId: req.ticketId,
          userId: req.userId,
          cashoutType,
          paidAmountMinor,
          fraction,
          remainingStakeMinor,
        }, client);

        await client.query('COMMIT');

        return {
          ticketId: req.ticketId,
          cashoutType,
          cashoutFraction: fraction,
          paidAmountMinor,
          remainingStakeMinor,
          remainingPotentialPayoutMinor: remainingPayoutMinor,
          newBalanceMinor,
          journalId,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });
  }
}
