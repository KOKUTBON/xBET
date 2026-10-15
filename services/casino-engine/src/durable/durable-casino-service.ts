import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { PoolClient } from 'pg';
import { EuropeanRouletteEngine, type RouletteBet } from '../games/roulette.ts';
import {
  VirtualRacingEngine,
  type VirtualRaceEvent,
  type VirtualBetResult,
  type VirtualRaceReplay,
} from '../games/virtual-racing.ts';
import { ProvablyFairRNG } from '../rng/provably-fair.ts';
import { LedgerService } from '../../../betting-engine/src/wallet/ledger-service.ts';

const { Pool } = pg;
const MAX_CASINO_WAGER_MINOR = 500_000; // 5,000 PTS
const MIN_CASINO_WAGER_MINOR = 10;      // 0.10 PTS

export class CasinoError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(code: string, statusCode: number) {
    super(code);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export interface DurableCasinoRoundResult {
  roundId: string;
  gameCode: string;
  userId: string;
  wager: number;
  payout: number;
  profit: number;
  isCompleted: boolean;
  gameState: Record<string, unknown>;
  serverSeedHash: string;
  serverSeed: string; // revealed post-round for player verification
  clientSeed: string;
  nonce: number;
  balanceAfter: number;
}

export interface DurableVirtualRaceBetResult extends DurableCasinoRoundResult {
  betResult: VirtualBetResult;
  race: VirtualRaceEvent;
  replay?: VirtualRaceReplay;
}

export interface CasinoVerificationResult {
  verified: boolean;
  serverSeedHash: string;
  winningNumber: number;
  payout: number;
  wager: number;
  betResults: unknown[];
}

export interface VirtualRaceVerificationResult {
  verified: boolean;
  serverSeedHash: string;
  finishOrder: number[];
  finishTimes: Record<number, number>;
  replay: VirtualRaceReplay;
}

type RoundRow = {
  id: string;
  user_id: string;
  idempotency_key: string;
  game_code: string;
  server_seed_hash: string;
  server_seed: string;
  client_seed: string;
  nonce: string;
  wager_minor: string;
  payout_minor: string;
  balance_after_minor: string;
  game_state: Record<string, unknown>;
  status: string;
  created_at: Date;
  settled_at: Date;
};

function minorUnits(amount: number, code: string): number {
  const scaled = amount * 100;
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(scaled))
    || Math.abs(scaled - Math.round(scaled)) > 1e-7) {
    throw new CasinoError(code, 400);
  }
  return Math.round(scaled);
}

function validateKey(idempotencyKey: string): void {
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    throw new CasinoError('IDEMPOTENCY_KEY_REQUIRED', 400);
  }
}

export class DurableCasinoService {
  private static instance: DurableCasinoService;
  private connectionString?: string;
  private pool: pg.Pool | null = null;
  private currentPoolUrl: string | null = null;
  private ledger: LedgerService;
  private virtualRacing: VirtualRacingEngine;
  private memoryRounds: Map<string, DurableCasinoRoundResult> = new Map();
  private userKeyIndex: Map<string, DurableCasinoRoundResult> = new Map();

  constructor(connectionString?: string) {
    this.ledger = LedgerService.getInstance();
    this.virtualRacing = VirtualRacingEngine.getInstance();
    this.connectionString = connectionString;
  }

  public static getInstance(): DurableCasinoService {
    if (!DurableCasinoService.instance) {
      DurableCasinoService.instance = new DurableCasinoService();
    }
    return DurableCasinoService.instance;
  }

  private getPool(): pg.Pool | null {
    const url = this.connectionString || process.env.DATABASE_URL;
    if (!url) {
      if (this.pool) {
        this.pool.end().catch(() => {});
        this.pool = null;
        this.currentPoolUrl = null;
      }
      return null;
    }
    if (this.currentPoolUrl !== url || !this.pool) {
      if (this.pool) this.pool.end().catch(() => {});
      this.pool = new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 5000 });
      this.currentPoolUrl = url;
    }
    return this.pool;
  }

  public isDatabaseMode(): boolean {
    return Boolean(this.getPool());
  }

  public async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end().catch(() => {});
      this.pool = null;
      this.currentPoolUrl = null;
    }
  }

  public async playRoulette(params: {
    userId: string;
    idempotencyKey: string;
    bets: RouletteBet[];
    clientSeed?: string;
    currencyCode?: string;
  }): Promise<DurableCasinoRoundResult> {
    const { userId, idempotencyKey, bets } = params;
    const userPts = this.ledger.getBalance(userId, 'PTS');
    const userUsd = this.ledger.getBalance(userId, 'USD');
    let currencyCode = params.currencyCode;
    if (!currencyCode || (currencyCode === 'USD' && userPts > 0 && userUsd === 0)) {
      currencyCode = userPts > 0 ? 'PTS' : 'USD';
    }
    if (!userId || userId.length > 200) throw new CasinoError('INVALID_USER', 400);
    validateKey(idempotencyKey);

    if (!Array.isArray(bets) || bets.length === 0) {
      throw new CasinoError('NO_BETS_PLACED', 400);
    }

    let totalWager = 0;
    for (const b of bets) {
      if (!Number.isFinite(b.amount) || b.amount <= 0) {
        throw new CasinoError('INVALID_BET_AMOUNT', 400);
      }
      totalWager += b.amount;
    }

    const wagerMinor = minorUnits(totalWager, 'INVALID_WAGER');
    if (wagerMinor < MIN_CASINO_WAGER_MINOR || wagerMinor > MAX_CASINO_WAGER_MINOR) {
      throw new CasinoError('WAGER_LIMIT_EXCEEDED', 400);
    }

    // Pre-round Provably Fair Seed Commitment
    const serverSeed = ProvablyFairRNG.generateServerSeed();
    const serverSeedHash = ProvablyFairRNG.hashServerSeed(serverSeed);
    const clientSeed = params.clientSeed || ProvablyFairRNG.generateServerSeed().substring(0, 16);
    const nonce = 1;
    const roundId = randomUUID();

    // Execute game logic deterministically via unbiased rejection sampling
    const spinOutcome = EuropeanRouletteEngine.spin({
      userId,
      bets,
      serverSeed,
      clientSeed,
      nonce,
      roundId,
    });

    const payoutMinor = minorUnits(spinOutcome.payout, 'INVALID_PAYOUT');
    const profitMinor = payoutMinor - wagerMinor;

    const pool = this.getPool();
    if (pool) {
      return this.executeDatabaseRound(pool, {
        roundId,
        userId,
        idempotencyKey,
        gameCode: 'roulette_european',
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce,
        wagerMinor,
        payoutMinor,
        profitMinor,
        gameState: spinOutcome.gameState,
        currencyCode,
      });
    }

    return this.executeMemoryRound({
      roundId,
      userId,
      idempotencyKey,
      gameCode: 'roulette_european',
      serverSeed,
      serverSeedHash,
      clientSeed,
      nonce,
      wagerMinor,
      payoutMinor,
      profitMinor,
      gameState: spinOutcome.gameState,
      currencyCode,
    });
  }

  public async playVirtualRaceBet(params: {
    userId: string;
    idempotencyKey: string;
    raceId: string;
    runnerNumber: number;
    betType: 'WIN' | 'PLACE' | 'SHOW' | 'FORECAST';
    forecastSecondRunner?: number;
    wager: number;
    clientSeed?: string;
    currencyCode?: string;
  }): Promise<DurableVirtualRaceBetResult> {
    const { userId, idempotencyKey, raceId, runnerNumber, betType, forecastSecondRunner, wager } = params;
    const userPts = this.ledger.getBalance(userId, 'PTS');
    const userUsd = this.ledger.getBalance(userId, 'USD');
    let currencyCode = params.currencyCode;
    if (!currencyCode || (currencyCode === 'USD' && userPts > 0 && userUsd === 0)) {
      currencyCode = userPts > 0 ? 'PTS' : 'USD';
    }
    if (!userId || userId.length > 200) throw new CasinoError('INVALID_USER', 400);
    validateKey(idempotencyKey);

    const race = this.virtualRacing.getRace(raceId);
    if (!race) {
      throw new CasinoError('RACE_NOT_FOUND', 404);
    }

    const priorPool=this.getPool();
    const priorRow=priorPool?(await priorPool.query('SELECT id FROM points_casino_rounds WHERE user_id=$1 AND idempotency_key=$2',[userId,idempotencyKey])).rows[0]:undefined;
    const prior=priorRow?await this.getRound(priorRow.id):this.userKeyIndex.get(`${userId}:${idempotencyKey}`);
    if(prior){
      const state=prior.gameState;
      if(!prior.gameCode.startsWith('virtual_')||state.raceId!==raceId||state.runnerNumber!==runnerNumber||state.betType!==betType||state.forecastSecondRunner!==forecastSecondRunner||prior.wager!==wager||(params.clientSeed&&params.clientSeed!==prior.clientSeed))throw new CasinoError('IDEMPOTENCY_KEY_CONFLICT',409);
      return {...prior,betResult:this.virtualRacing.settleBet({userId,raceId,runnerNumber,betType,forecastSecondRunner,wager},race),race,replay:race.replay};
    }
    if (race.status !== 'SCHEDULED' || race.result || race.scheduledTime.getTime() <= Date.now()) throw new CasinoError('RACE_WAGERING_CLOSED', 409);
    if (!['WIN','PLACE','SHOW','FORECAST'].includes(betType)) throw new CasinoError('INVALID_BET_TYPE',400);

    const runner = race.runners.find((r) => r.number === runnerNumber);
    if (!runner) {
      throw new CasinoError('RUNNER_NOT_FOUND', 400);
    }

    if (betType === 'FORECAST') {
      if (!forecastSecondRunner || forecastSecondRunner === runnerNumber) {
        throw new CasinoError('INVALID_FORECAST_RUNNER', 400);
      }
      if (!race.runners.some((r) => r.number === forecastSecondRunner)) {
        throw new CasinoError('RUNNER_NOT_FOUND', 400);
      }
    }

    const wagerMinor = minorUnits(wager, 'INVALID_WAGER');
    if (wagerMinor < MIN_CASINO_WAGER_MINOR || wagerMinor > MAX_CASINO_WAGER_MINOR) {
      throw new CasinoError('WAGER_LIMIT_EXCEEDED', 400);
    }

    // Pre-round Provably Fair Seed Commitment
    const serverSeed = race.serverSeed || ProvablyFairRNG.generateServerSeed();
    const serverSeedHash = race.serverSeedHash || ProvablyFairRNG.hashServerSeed(serverSeed);
    const clientSeed = race.clientSeed || params.clientSeed || ProvablyFairRNG.generateServerSeed().substring(0, 16);
    const nonce = race.nonce !== undefined ? race.nonce : 1;
    const roundId = randomUUID();

    // Simulate deterministically if race not finished yet
    if (!race.result) {
      this.virtualRacing.simulateRace(race.id, serverSeed, clientSeed, nonce);
    }

    const betResult = this.virtualRacing.settleBet(
      { userId, raceId, runnerNumber, betType, forecastSecondRunner, wager },
      race
    );

    const payoutMinor = minorUnits(betResult.payout, 'INVALID_PAYOUT');
    const profitMinor = payoutMinor - wagerMinor;

    const gameState: Record<string, unknown> = {
      raceId: race.id,
      raceName: race.name,
      trackName: race.trackName,
      type: race.type,
      runnerNumber,
      runnerName: runner.name,
      betType,
      forecastSecondRunner,
      wager,
      won: betResult.won,
      payout: betResult.payout,
      message: betResult.message,
      finishOrder: race.result!.finishOrder,
      winner: { number: race.result!.winner.number, name: race.result!.winner.name },
      second: { number: race.result!.second.number, name: race.result!.second.name },
      third: { number: race.result!.third.number, name: race.result!.third.name },
    };

    const pool = this.getPool();
    const roundResult = pool
      ? await this.executeDatabaseRound(pool, {
          roundId,
          userId,
          idempotencyKey,
          gameCode: `virtual_${race.type.toLowerCase()}`,
          serverSeed,
          serverSeedHash,
          clientSeed,
          nonce,
          wagerMinor,
          payoutMinor,
          profitMinor,
          gameState,
          currencyCode,
        })
      : await this.executeMemoryRound({
          roundId,
          userId,
          idempotencyKey,
          gameCode: `virtual_${race.type.toLowerCase()}`,
          serverSeed,
          serverSeedHash,
          clientSeed,
          nonce,
          wagerMinor,
          payoutMinor,
          profitMinor,
          gameState,
          currencyCode,
        });

    return {
      ...roundResult,
      betResult,
      race,
      replay: race.replay,
    };
  }

  private async executeDatabaseRound(
    pool: pg.Pool,
    p: {
      roundId: string;
      userId: string;
      idempotencyKey: string;
      gameCode: string;
      serverSeed: string;
      serverSeedHash: string;
      clientSeed: string;
      nonce: number;
      wagerMinor: number;
      payoutMinor: number;
      profitMinor: number;
      gameState: Record<string, unknown>;
      currencyCode: string;
    }
  ): Promise<DurableCasinoRoundResult> {
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (_err) {
      throw new CasinoError('STORAGE_ERROR', 503);
    }

    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`casino:${p.userId}:${p.idempotencyKey}`]);

      // Check existing round for idempotency replay
      const existing = await client.query<RoundRow>(
        'SELECT * FROM points_casino_rounds WHERE user_id = $1 AND idempotency_key = $2',
        [p.userId, p.idempotencyKey]
      );
      if (existing.rows[0]) {
        await client.query('ROLLBACK');
        const row = existing.rows[0];
        if (Number(row.wager_minor) !== p.wagerMinor) {
          throw new CasinoError('IDEMPOTENCY_KEY_CONFLICT', 409);
        }
        return {
          roundId: row.id,
          gameCode: row.game_code,
          userId: row.user_id,
          wager: Number(row.wager_minor) / 100,
          payout: Number(row.payout_minor) / 100,
          profit: (Number(row.payout_minor) - Number(row.wager_minor)) / 100,
          isCompleted: true,
          gameState: row.game_state,
          serverSeedHash: row.server_seed_hash,
          serverSeed: row.server_seed,
          clientSeed: row.client_seed,
          nonce: Number(row.nonce),
          balanceAfter: Number(row.balance_after_minor) / 100,
        };
      }

      // Check player funds
      const curr = p.currencyCode || 'PTS';
      const playerKey = `PLAYER:${p.userId}:${curr}`;
      const marginKey = `HOUSE_MARGIN:${curr}`;
      await this.ensureAccounts(client, playerKey, p.userId, marginKey, curr);

      const balanceRes = await client.query<{ balance_minor: string }>(
        'SELECT balance_minor FROM points_accounts WHERE account_key = $1 FOR UPDATE',
        [playerKey]
      );
      const balance = Number(balanceRes.rows[0]?.balance_minor ?? 0);
      if (balance < p.wagerMinor) {
        throw new CasinoError('INSUFFICIENT_FUNDS', 409);
      }

      const balanceAfter = balance + p.profitMinor;
      if (balanceAfter < 0) {
        throw new CasinoError('INSUFFICIENT_FUNDS', 409);
      }

      // 1. Mutate balances atomically
      await client.query('UPDATE points_accounts SET balance_minor = balance_minor + $2 WHERE account_key = $1', [playerKey, p.profitMinor]);
      await client.query('UPDATE points_accounts SET balance_minor = balance_minor - $2 WHERE account_key = $1', [marginKey, p.profitMinor]);

      // 2. Double-entry ledger journal
      const journalId = randomUUID();
      await client.query(
        'INSERT INTO points_journals (id, kind, reference_id) VALUES ($1, $2, $3)',
        [journalId, 'CASINO_ROUND', p.roundId]
      );
      await client.query(
        'INSERT INTO points_journal_lines (id, journal_id, account_key, delta_minor) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)',
        [
          randomUUID(), journalId, playerKey, p.profitMinor,
          randomUUID(), journalId, marginKey, -p.profitMinor,
        ]
      );

      // 3. Persist immutable casino round record
      await client.query(
        `INSERT INTO points_casino_rounds (
           id, user_id, idempotency_key, game_code, server_seed_hash, server_seed,
           client_seed, nonce, wager_minor, payout_minor, balance_after_minor,
           game_state, status, settled_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, 'SETTLED', now())`,
        [
          p.roundId, p.userId, p.idempotencyKey, p.gameCode, p.serverSeedHash, p.serverSeed,
          p.clientSeed, p.nonce, p.wagerMinor, p.payoutMinor, balanceAfter,
          JSON.stringify(p.gameState),
        ]
      );

      // 4. Transactional Outbox
      await client.query(
        `INSERT INTO points_outbox (id, event_type, aggregate_id, payload)
         VALUES ($1, 'CASINO_ROUND_SETTLED', $2, $3::jsonb)`,
        [
          randomUUID(), p.roundId,
          JSON.stringify({
            roundId: p.roundId,
            userId: p.userId,
            gameCode: p.gameCode,
            wagerMinor: p.wagerMinor,
            payoutMinor: p.payoutMinor,
            serverSeedHash: p.serverSeedHash,
          }),
        ]
      );

      await client.query('COMMIT');

      return {
        roundId: p.roundId,
        gameCode: p.gameCode,
        userId: p.userId,
        wager: p.wagerMinor / 100,
        payout: p.payoutMinor / 100,
        profit: p.profitMinor / 100,
        isCompleted: true,
        gameState: p.gameState,
        serverSeedHash: p.serverSeedHash,
        serverSeed: p.serverSeed,
        clientSeed: p.clientSeed,
        nonce: p.nonce,
        balanceAfter: balanceAfter / 100,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err instanceof CasinoError) throw err;
      throw new CasinoError('STORAGE_ERROR', 503);
    } finally {
      client.release();
    }
  }

  private async executeMemoryRound(p: {
    roundId: string;
    userId: string;
    idempotencyKey: string;
    gameCode: string;
    serverSeed: string;
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
    wagerMinor: number;
    payoutMinor: number;
    profitMinor: number;
    gameState: Record<string, unknown>;
    currencyCode: string;
  }): Promise<DurableCasinoRoundResult> {
    const userKey = `${p.userId}:${p.idempotencyKey}`;
    const existing = this.userKeyIndex.get(userKey);
    if (existing) {
      if (Math.round(existing.wager * 100) !== p.wagerMinor) {
        throw new CasinoError('IDEMPOTENCY_KEY_CONFLICT', 409);
      }
      return existing;
    }

    const curr = p.currencyCode || 'USD';
    const balance = this.ledger.getBalance(p.userId, curr);
    const wager = p.wagerMinor / 100;
    if (balance < wager) {
      throw new CasinoError('INSUFFICIENT_FUNDS', 409);
    }

    const snapshot = this.ledger.snapshotPlacementState();
    try {
      this.ledger.holdBetStake(p.userId, p.roundId, wager, curr);
      const payout = p.payoutMinor / 100;
      if (payout > 0) {
        this.ledger.settleWinningBet(p.userId, p.roundId, wager, payout, curr);
      } else {
        this.ledger.settleLosingBet(p.userId, p.roundId, wager, curr);
      }
      const balanceAfter = this.ledger.getBalance(p.userId, curr);

      const result: DurableCasinoRoundResult = {
        roundId: p.roundId,
        gameCode: p.gameCode,
        userId: p.userId,
        wager,
        payout,
        profit: p.profitMinor / 100,
        isCompleted: true,
        gameState: p.gameState,
        serverSeedHash: p.serverSeedHash,
        serverSeed: p.serverSeed,
        clientSeed: p.clientSeed,
        nonce: p.nonce,
        balanceAfter,
      };

      this.memoryRounds.set(p.roundId, result);
      this.userKeyIndex.set(userKey, result);
      return result;
    } catch (err) {
      this.ledger.restorePlacementState(snapshot);
      throw err;
    }
  }

  public verifyRound(params: {
    serverSeed: string;
    clientSeed: string;
    nonce: number;
    bets: RouletteBet[];
  }): CasinoVerificationResult {
    const { serverSeed, clientSeed, nonce, bets } = params;
    const serverSeedHash = ProvablyFairRNG.hashServerSeed(serverSeed);
    const spinOutcome = EuropeanRouletteEngine.spin({
      userId: '__verifier__',
      bets,
      serverSeed,
      clientSeed,
      nonce,
    });

    return {
      verified: true,
      serverSeedHash,
      winningNumber: (spinOutcome.gameState as any).winningNumber,
      payout: spinOutcome.payout,
      wager: spinOutcome.wager,
      betResults: (spinOutcome.gameState as any).betResults,
    };
  }

  public verifyVirtualRace(params: {
    raceId: string;
    serverSeed: string;
    clientSeed: string;
    nonce: number;
  }): VirtualRaceVerificationResult {
    const { raceId, serverSeed, clientSeed, nonce } = params;
    const serverSeedHash = ProvablyFairRNG.hashServerSeed(serverSeed);
    const replay = this.virtualRacing.replayRace(raceId, serverSeed, clientSeed, nonce);

    return {
      verified: true,
      serverSeedHash,
      finishOrder: replay.finishOrder,
      finishTimes: replay.finishTimes,
      replay,
    };
  }

  public async getRound(roundId: string): Promise<DurableCasinoRoundResult | undefined> {
    const pool = this.getPool();
    if (pool) {
      try {
        const res = await pool.query<RoundRow>('SELECT * FROM points_casino_rounds WHERE id = $1', [roundId]);
        if (!res.rows[0]) return undefined;
        const row = res.rows[0];
        return {
          roundId: row.id,
          gameCode: row.game_code,
          userId: row.user_id,
          wager: Number(row.wager_minor) / 100,
          payout: Number(row.payout_minor) / 100,
          profit: (Number(row.payout_minor) - Number(row.wager_minor)) / 100,
          isCompleted: true,
          gameState: row.game_state,
          serverSeedHash: row.server_seed_hash,
          serverSeed: row.server_seed,
          clientSeed: row.client_seed,
          nonce: Number(row.nonce),
          balanceAfter: Number(row.balance_after_minor) / 100,
        };
      } catch (_err) {
        throw new CasinoError('STORAGE_ERROR', 503);
      }
    }
    return this.memoryRounds.get(roundId);
  }

  private async ensureAccounts(client: PoolClient, playerKey: string, userId: string, otherKey: string, currencyCode: string): Promise<void> {
    await client.query(
      `INSERT INTO points_accounts (account_key, user_id, currency_code, balance_minor)
       VALUES ($1, $2, $3, 0) ON CONFLICT (account_key) DO NOTHING`,
      [playerKey, userId, currencyCode],
    );
    await client.query(
      `INSERT INTO points_accounts (account_key, user_id, currency_code, balance_minor)
       VALUES ($1, NULL, $2, 0) ON CONFLICT (account_key) DO NOTHING`,
      [otherKey, currencyCode],
    );
  }
}
