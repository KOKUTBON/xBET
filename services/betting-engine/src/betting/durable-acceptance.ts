import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import pg from 'pg';
import type { PoolClient } from 'pg';
import { pilotEnabled, reserveWager } from '../pilot/pilot-store.ts';
import type { SelectionSnapshot, ServerQuote } from './quote-service.ts';

const { Pool } = pg;
const MAX_STAKE_MINOR = 500_000;
const MAX_PAYOUT_MINOR = 10_000_000;
const MAX_SELECTION_LIABILITY_MINOR = 5_000_000;

export class AcceptanceError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, statusCode: number) {
    super(code);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface DurableTicket {
  id: string;
  userId: string;
  quoteId: string;
  idempotencyKey: string;
  status: 'ACCEPTED' | 'WON' | 'LOST' | 'VOID' | 'CASHED_OUT';
  settledPayout?: number;
  currencyCode: 'PTS';
  stake: number;
  totalOdds: number;
  potentialPayout: number;
  createdAt: Date;
  selection: SelectionSnapshot;
}

type QuoteRow = {
  id: string; user_id: string; selection: SelectionSnapshot; odds: string;
  expires_at: Date; consumed_at: Date | null;
};

type BetRow = {
  id: string; user_id: string; quote_id: string; idempotency_key: string;
  selection: SelectionSnapshot; stake_minor: string; potential_payout_minor: string; balance_after_minor: string;
  odds: string; created_at: Date; status: DurableTicket['status']; settled_payout_minor?: string;
};

function minorUnits(amount: number, code: string): number {
  const scaled = amount * 100;
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(scaled))
    || Math.abs(scaled - Math.round(scaled)) > 1e-7) {
    throw new AcceptanceError(code, 400);
  }
  return Math.round(scaled);
}

function validateKey(idempotencyKey: string): void {
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw new AcceptanceError('IDEMPOTENCY_KEY_REQUIRED', 400);
  }
}

function mapBet(row: BetRow): DurableTicket {
  return {
    id: row.id, userId: row.user_id, quoteId: row.quote_id,
    idempotencyKey: row.idempotency_key, status: row.status, settledPayout: Number(row.settled_payout_minor || 0) / 100, currencyCode: 'PTS',
    stake: Number(row.stake_minor) / 100,
    totalOdds: Number(row.odds), potentialPayout: Number(row.potential_payout_minor) / 100,
    createdAt: row.created_at, selection: row.selection,
  };
}

/** Points-only transactional store. Migration 002 is required before use. */
export class DurableAcceptanceService {
  private readonly pool: pg.Pool;

  constructor(pool?: pg.Pool) {
    this.pool = pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10, connectionTimeoutMillis: 1500 });
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  public async issueQuote(quote: ServerQuote): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO points_quotes (id, user_id, selection, odds, expires_at)
         VALUES ($1, $2, $3::jsonb, $4, $5)`,
        [quote.quoteId, quote.userId, JSON.stringify(quote.selection), quote.selection.odds, new Date(quote.expiresAt)],
      );
    } catch (error) { this.storageFailure(error); }
  }

  public async getQuote(quoteId: string): Promise<QuoteRow | undefined> {
    try {
      const result = await this.pool.query<QuoteRow>('SELECT * FROM points_quotes WHERE id = $1', [quoteId]);
      return result.rows[0];
    } catch (error) { this.storageFailure(error); }
  }

  public async getBalance(userId: string): Promise<number> {
    try {
      const result = await this.pool.query<{ balance_minor: string }>(
        'SELECT balance_minor FROM points_accounts WHERE account_key = $1', [`PLAYER:${userId}:PTS`],
      );
      return Number(result.rows[0]?.balance_minor ?? 0) / 100;
    } catch (error) { this.storageFailure(error); }
  }

  public async getTicket(id: string): Promise<DurableTicket | undefined> {
    try {
      const result = await this.pool.query<BetRow>('SELECT * FROM points_bets WHERE id = $1', [id]);
      return result.rows[0] ? mapBet(result.rows[0]) : undefined;
    } catch (error) { this.storageFailure(error); }
  }

  public async getUserTickets(userId: string): Promise<DurableTicket[]> {
    try {
      const result = await this.pool.query<BetRow>(
        'SELECT * FROM points_bets WHERE user_id = $1 ORDER BY created_at DESC', [userId],
      );
      return result.rows.map(mapBet);
    } catch (error) { this.storageFailure(error); }
  }

  public async adjustPoints(userId: string, delta: number, idempotencyKey: string): Promise<{ journalEntryId: string; newBalance: number }> {
    validateKey(idempotencyKey);
    const minor = minorUnits(Math.abs(delta), 'INVALID_ADJUSTMENT') * Math.sign(delta);
    if (!userId || userId.length > 200) throw new AcceptanceError('INVALID_USER', 400);
    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`admin:${userId}:${idempotencyKey}`]);
      const previous = await client.query<{ delta_minor: string; balance_after_minor: string; journal_id: string }>(
        'SELECT * FROM points_admin_adjustments WHERE user_id = $1 AND idempotency_key = $2',
        [userId, idempotencyKey],
      );
      if (previous.rows[0]) {
        if (Number(previous.rows[0].delta_minor) !== minor) throw new AcceptanceError('IDEMPOTENCY_KEY_CONFLICT', 409);
        return { journalEntryId: previous.rows[0].journal_id, newBalance: Number(previous.rows[0].balance_after_minor) / 100 };
      }
      const playerKey = `PLAYER:${userId}:PTS`;
      const issuerKey = 'HOUSE_ISSUER:PTS';
      await this.ensureAccounts(client, playerKey, userId, issuerKey);
      const balance = await this.lockBalance(client, playerKey);
      if (balance + minor < 0) throw new AcceptanceError('INSUFFICIENT_FUNDS', 409);
      const journalEntryId = randomUUID();
      await client.query('UPDATE points_accounts SET balance_minor = balance_minor + $2 WHERE account_key = $1', [playerKey, minor]);
      await client.query('UPDATE points_accounts SET balance_minor = balance_minor - $2 WHERE account_key = $1', [issuerKey, minor]);
      await this.journal(client, journalEntryId, 'ADMIN_ADJUSTMENT', journalEntryId, playerKey, minor, issuerKey, -minor);
      await client.query(
        `INSERT INTO points_admin_adjustments (user_id, idempotency_key, delta_minor, balance_after_minor, journal_id)
         VALUES ($1,$2,$3,$4,$5)`, [userId, idempotencyKey, minor, balance + minor, journalEntryId],
      );
      return { journalEntryId, newBalance: (balance + minor) / 100 };
    });
  }

  public async accept(
    userId: string, quoteId: string, idempotencyKey: string, stake: number,
    revalidate: (selection: SelectionSnapshot) => Promise<SelectionSnapshot>,
  ): Promise<{ ticket: DurableTicket; remainingBalance: number }> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId)) {
      throw new AcceptanceError('QUOTE_NOT_FOUND', 409);
    }
    validateKey(idempotencyKey);
    const stakeMinor = minorUnits(stake, 'INVALID_STAKE');
    if (stakeMinor < 10 || stakeMinor > MAX_STAKE_MINOR) throw new AcceptanceError('STAKE_LIMIT', 400);
    const prior = await this.findByKey(userId, idempotencyKey);
    if (prior) return this.priorResult(prior, quoteId, stakeMinor);

    const quote = await this.getQuote(quoteId);
    if (!quote) throw new AcceptanceError('QUOTE_NOT_FOUND', 409);
    if (quote.user_id !== userId) throw new AcceptanceError('QUOTE_NOT_OWNED', 403);
    if (quote.consumed_at || quote.expires_at.getTime() <= Date.now()) {
      const completed = await this.findByKey(userId, idempotencyKey);
      if (completed) return this.priorResult(completed, quoteId, stakeMinor);
      throw new AcceptanceError('QUOTE_EXPIRED_OR_USED', 409);
    }
    await revalidate(quote.selection);

    return this.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`${userId}:${idempotencyKey}`]);
      const existing = await client.query<BetRow>(
        'SELECT * FROM points_bets WHERE user_id = $1 AND idempotency_key = $2', [userId, idempotencyKey],
      );
      if (existing.rows[0]) {
        return this.priorResult(existing.rows[0], quoteId, stakeMinor);
      }
      const lockedQuote = await client.query<QuoteRow>('SELECT * FROM points_quotes WHERE id = $1 FOR UPDATE', [quoteId]);
      const current = lockedQuote.rows[0];
      if (!current || current.user_id !== userId || current.consumed_at || current.expires_at.getTime() <= Date.now()) {
        throw new AcceptanceError('QUOTE_EXPIRED_OR_USED', 409);
      }
      if (!isDeepStrictEqual(current.selection, quote.selection)
        || Number(current.odds) !== Number(quote.odds)
        || Number(current.odds) !== current.selection.odds) {
        throw new AcceptanceError('QUOTE_CHANGED', 409);
      }
      if (pilotEnabled()) {
        const control = (await client.query('SELECT frozen FROM points_pilot_control WHERE id=1 FOR SHARE')).rows[0];
        const market = (await client.query('SELECT * FROM points_fixture_states WHERE fixture_id=$1 FOR SHARE', [current.selection.fixtureId])).rows[0];
        if (!market || control.frozen || market.frozen) throw new AcceptanceError('MARKET_SUSPENDED', 409);
        if (!/^(football|soccer)$/i.test(market.snapshot.sportName || '')) throw new AcceptanceError('SPORT_DISABLED',409);
        if (Number(market.version) !== current.selection.fixtureVersion) throw new AcceptanceError('MARKET_VERSION_SUPERSEDED', 409);
        const maxAge = market.snapshot.status === 'LIVE' ? 10000 : 120000;
        if (!['LIVE','NOT_STARTED'].includes(market.snapshot.status) || Date.now()-market.updated_at.getTime()>maxAge) throw new AcceptanceError('MARKET_STALE',409);
        await reserveWager(client,userId,stakeMinor);
      }
      const odds4 = Math.round(Number(current.odds) * 10000);
      if (!Number.isSafeInteger(odds4) || odds4 <= 10000) throw new AcceptanceError('INVALID_QUOTE', 409);
      const payoutMinor = Math.floor((stakeMinor * odds4 + 5000) / 10000);
      const liabilityMinor = payoutMinor - stakeMinor;
      if (payoutMinor > MAX_PAYOUT_MINOR || liabilityMinor < 0) throw new AcceptanceError('PAYOUT_LIMIT', 409);

      const playerKey = `PLAYER:${userId}:PTS`;
      const escrowKey = 'HOUSE_ESCROW:PTS';
      await this.ensureAccounts(client, playerKey, userId, escrowKey);
      const balance = await this.lockBalance(client, playerKey);
      if (balance < stakeMinor) throw new AcceptanceError('INSUFFICIENT_FUNDS', 409);
      await client.query('INSERT INTO points_liabilities (selection_id) VALUES ($1) ON CONFLICT DO NOTHING', [current.selection.selectionId]);
      const liability = await client.query(
        `UPDATE points_liabilities SET liability_minor = liability_minor + $2
         WHERE selection_id = $1 AND liability_minor + $2 <= $3 RETURNING liability_minor`,
        [current.selection.selectionId, liabilityMinor, MAX_SELECTION_LIABILITY_MINOR],
      );
      if (liability.rowCount !== 1) throw new AcceptanceError('MARKET_LIABILITY_LIMIT', 409);

      const betId = randomUUID();
      const journalId = randomUUID();
      await client.query('UPDATE points_accounts SET balance_minor = balance_minor - $2 WHERE account_key = $1', [playerKey, stakeMinor]);
      await client.query('UPDATE points_accounts SET balance_minor = balance_minor + $2 WHERE account_key = $1', [escrowKey, stakeMinor]);
      await this.journal(client, journalId, 'BET_STAKE', betId, playerKey, -stakeMinor, escrowKey, stakeMinor);
      const inserted = await client.query<BetRow>(
        `INSERT INTO points_bets (id, user_id, idempotency_key, quote_id, selection, stake_minor, potential_payout_minor, balance_after_minor, odds)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9) RETURNING *`,
        [betId, userId, idempotencyKey, quoteId, JSON.stringify(current.selection), stakeMinor, payoutMinor, balance - stakeMinor, current.odds],
      );
      await client.query('UPDATE points_quotes SET consumed_at = now() WHERE id = $1', [quoteId]);
      await client.query(
        `INSERT INTO points_outbox (id, event_type, aggregate_id, payload)
         VALUES ($1, 'BET_ACCEPTED', $2, $3::jsonb)`,
        [randomUUID(), betId, JSON.stringify({ betId, userId, quoteId, stakeMinor, payoutMinor })],
      );
      return { ticket: mapBet(inserted.rows[0]), remainingBalance: (balance - stakeMinor) / 100 };
    });
  }

  private async findByKey(userId: string, key: string): Promise<BetRow | undefined> {
    try {
      const result = await this.pool.query<BetRow>(
        'SELECT * FROM points_bets WHERE user_id = $1 AND idempotency_key = $2', [userId, key],
      );
      return result.rows[0];
    } catch (error) { this.storageFailure(error); }
  }

  private priorResult(row: BetRow, quoteId: string, stakeMinor: number): { ticket: DurableTicket; remainingBalance: number } {
    if (row.quote_id !== quoteId || Number(row.stake_minor) !== stakeMinor) {
      throw new AcceptanceError('IDEMPOTENCY_KEY_CONFLICT', 409);
    }
    return { ticket: mapBet(row), remainingBalance: Number(row.balance_after_minor) / 100 };
  }

  private async ensureAccounts(client: PoolClient, playerKey: string, userId: string, houseKey: string): Promise<void> {
    await client.query(
      `INSERT INTO points_accounts (account_key, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [playerKey, userId],
    );
    await client.query(
      `INSERT INTO points_accounts (account_key) VALUES ($1) ON CONFLICT DO NOTHING`, [houseKey],
    );
  }

  private async lockBalance(client: PoolClient, accountKey: string): Promise<number> {
    const row = await client.query<{ balance_minor: string }>(
      'SELECT balance_minor FROM points_accounts WHERE account_key = $1 FOR UPDATE', [accountKey],
    );
    return Number(row.rows[0].balance_minor);
  }

  private async journal(
    client: PoolClient, id: string, kind: string, referenceId: string,
    firstAccount: string, firstDelta: number, secondAccount: string, secondDelta: number,
  ): Promise<void> {
    if (firstDelta + secondDelta !== 0) throw new Error('UNBALANCED_JOURNAL');
    await client.query(
      'INSERT INTO points_journals (id, kind, reference_id) VALUES ($1,$2,$3)', [id, kind, referenceId],
    );
    await client.query(
      `INSERT INTO points_journal_lines (id, journal_id, account_key, delta_minor)
       VALUES ($1,$2,$3,$4),($5,$2,$6,$7)`,
      [randomUUID(), id, firstAccount, firstDelta, randomUUID(), secondAccount, secondDelta],
    );
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      let client: PoolClient;
      try { client = await this.pool.connect(); }
      catch (error) { this.storageFailure(error); }
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const result = await operation(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* connection already failed */ }
        if (['40001', '40P01', '23505'].includes((error as { code?: string }).code || '') && attempt < 2) continue;
        if (error instanceof AcceptanceError) throw error;
        this.storageFailure(error);
      } finally { client.release(); }
    }
    throw new AcceptanceError('DURABLE_STORE_UNAVAILABLE', 503);
  }

  private storageFailure(error: unknown): never {
    console.error('[DurableAcceptance] Storage operation failed:', (error as { code?: string }).code || 'UNKNOWN');
    throw new AcceptanceError('DURABLE_STORE_UNAVAILABLE', 503);
  }
}
