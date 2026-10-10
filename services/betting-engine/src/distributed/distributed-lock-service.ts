import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export interface LockHandle {
  key: string;
  token: string;
  expiresAt: number;
  release: () => Promise<void>;
}

export interface IDistributedLockService {
  acquire(key: string, ttlMs?: number, maxWaitMs?: number): Promise<LockHandle>;
  tryAcquire(key: string, ttlMs?: number): Promise<LockHandle | null>;
  withLock<T>(key: string, fn: () => Promise<T>, ttlMs?: number, maxWaitMs?: number): Promise<T>;
}

export class LockAcquisitionTimeoutError extends Error {
  constructor(key: string, timeoutMs: number) {
    super(`Failed to acquire distributed lock for key "${key}" within ${timeoutMs}ms`);
    this.name = 'LockAcquisitionTimeoutError';
  }
}

/**
 * High-performance In-Memory lock implementation with TTL and FIFO waiting queue.
 * Used for development, testing, and memory-mode fallbacks.
 */
export class MemoryLockStrategy implements IDistributedLockService {
  private locks = new Map<string, { token: string; expiresAt: number; timer: NodeJS.Timeout }>();
  private waitQueues = new Map<string, Array<{ resolve: (handle: LockHandle) => void; reject: (err: Error) => void; timeout: NodeJS.Timeout }>>();

  public async tryAcquire(key: string, ttlMs: number = 10000): Promise<LockHandle | null> {
    const existing = this.locks.get(key);
    const now = Date.now();
    if (existing && existing.expiresAt > now) {
      return null;
    }
    if (existing) {
      clearTimeout(existing.timer);
      this.locks.delete(key);
    }

    const token = randomUUID();
    const expiresAt = now + ttlMs;
    const timer = setTimeout(() => {
      this.releaseInternal(key, token);
    }, ttlMs);
    timer.unref?.();

    this.locks.set(key, { token, expiresAt, timer });

    return {
      key,
      token,
      expiresAt,
      release: async () => this.releaseInternal(key, token),
    };
  }

  public async acquire(key: string, ttlMs: number = 10000, maxWaitMs: number = 5000): Promise<LockHandle> {
    const direct = await this.tryAcquire(key, ttlMs);
    if (direct) return direct;

    return new Promise<LockHandle>((resolve, reject) => {
      let item: {
        resolve: (handle: LockHandle) => void;
        reject: (err: Error) => void;
        timeout: NodeJS.Timeout;
      };

      const timeout = setTimeout(() => {
        const queue = this.waitQueues.get(key) || [];
        const idx = queue.indexOf(item);
        if (idx !== -1) queue.splice(idx, 1);
        if (queue.length === 0) this.waitQueues.delete(key);
        reject(new LockAcquisitionTimeoutError(key, maxWaitMs));
      }, maxWaitMs);

      item = {
        resolve: (handle: LockHandle) => {
          clearTimeout(timeout);
          resolve(handle);
        },
        reject: (err: Error) => {
          clearTimeout(timeout);
          reject(err);
        },
        timeout,
      };

      const queue = this.waitQueues.get(key) || [];
      queue.push(item);
      this.waitQueues.set(key, queue);
    });
  }

  public async withLock<T>(key: string, fn: () => Promise<T>, ttlMs: number = 10000, maxWaitMs: number = 5000): Promise<T> {
    const lock = await this.acquire(key, ttlMs, maxWaitMs);
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }

  private async releaseInternal(key: string, token: string): Promise<void> {
    const current = this.locks.get(key);
    if (!current || current.token !== token) return;

    clearTimeout(current.timer);
    this.locks.delete(key);

    const queue = this.waitQueues.get(key);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (queue.length === 0) this.waitQueues.delete(key);

      const nextToken = randomUUID();
      const nextExpiresAt = Date.now() + 10000;
      const timer = setTimeout(() => {
        this.releaseInternal(key, nextToken);
      }, 10000);
      timer.unref?.();

      this.locks.set(key, { token: nextToken, expiresAt: nextExpiresAt, timer });

      next.resolve({
        key,
        token: nextToken,
        expiresAt: nextExpiresAt,
        release: async () => this.releaseInternal(key, nextToken),
      });
    }
  }
}

/**
 * PostgreSQL Advisory Lock Strategy.
 * Employs session-level pg_try_advisory_lock to coordinate mutually exclusive operations
 * across distributed Kubernetes pods sharing a PostgreSQL database.
 */
export class PostgresAdvisoryLockStrategy implements IDistributedLockService {
  private pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.pool = pool;
  }

  public async tryAcquire(key: string, ttlMs: number = 10000): Promise<LockHandle | null> {
    let client: pg.PoolClient | null = null;
    try {
      client = await this.pool.connect();
      const res = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS locked',
        [key]
      );

      if (!res.rows[0]?.locked) {
        client.release();
        return null;
      }

      const token = randomUUID();
      const expiresAt = Date.now() + ttlMs;
      let released = false;

      const release = async () => {
        if (released || !client) return;
        released = true;
        try {
          await client.query('SELECT pg_advisory_unlock(hashtext($1)::bigint)', [key]);
        } finally {
          client.release();
        }
      };

      return { key, token, expiresAt, release };
    } catch (err) {
      if (client) client.release();
      throw err;
    }
  }

  public async acquire(key: string, ttlMs: number = 10000, maxWaitMs: number = 5000): Promise<LockHandle> {
    const startTime = Date.now();
    let backoff = 25;

    while (Date.now() - startTime < maxWaitMs) {
      const lock = await this.tryAcquire(key, ttlMs);
      if (lock) return lock;

      const jitter = Math.floor(Math.random() * 20);
      await new Promise((r) => setTimeout(r, backoff + jitter));
      backoff = Math.min(backoff * 1.5, 250);
    }

    throw new LockAcquisitionTimeoutError(key, maxWaitMs);
  }

  public async withLock<T>(key: string, fn: () => Promise<T>, ttlMs: number = 10000, maxWaitMs: number = 5000): Promise<T> {
    const lock = await this.acquire(key, ttlMs, maxWaitMs);
    try {
      return await fn();
    } finally {
      await lock.release();
    }
  }
}

/**
 * Universal Distributed Lock Service.
 * Automatically activates PostgreSQL Advisory locks if a connection pool is present,
 * or defaults to high-concurrency MemoryLockStrategy.
 */
export class DistributedLockService implements IDistributedLockService {
  private static instance: DistributedLockService | null = null;
  private strategy: IDistributedLockService;

  constructor(pool?: pg.Pool) {
    if (pool) {
      this.strategy = new PostgresAdvisoryLockStrategy(pool);
    } else {
      this.strategy = new MemoryLockStrategy();
    }
  }

  public static getInstance(pool?: pg.Pool): DistributedLockService {
    if (!this.instance || pool) {
      this.instance = new DistributedLockService(pool);
    }
    return this.instance;
  }

  public setStrategy(strategy: IDistributedLockService): void {
    this.strategy = strategy;
  }

  public async acquire(key: string, ttlMs: number = 10000, maxWaitMs: number = 5000): Promise<LockHandle> {
    return this.strategy.acquire(key, ttlMs, maxWaitMs);
  }

  public async tryAcquire(key: string, ttlMs: number = 10000): Promise<LockHandle | null> {
    return this.strategy.tryAcquire(key, ttlMs);
  }

  public async withLock<T>(key: string, fn: () => Promise<T>, ttlMs: number = 10000, maxWaitMs: number = 5000): Promise<T> {
    return this.strategy.withLock(key, fn, ttlMs, maxWaitMs);
  }

  // Domain-Specific Mutex Helpers
  public async lockUser<T>(userId: string, fn: () => Promise<T>, ttlMs?: number): Promise<T> {
    return this.withLock(`user_account:${userId}`, fn, ttlMs);
  }

  public async lockSelection<T>(selectionId: string, fn: () => Promise<T>, ttlMs?: number): Promise<T> {
    return this.withLock(`selection_liability:${selectionId}`, fn, ttlMs);
  }

  public async lockFixture<T>(fixtureId: string, fn: () => Promise<T>, ttlMs?: number): Promise<T> {
    return this.withLock(`fixture_settlement:${fixtureId}`, fn, ttlMs);
  }

  public async lockTicket<T>(ticketId: string, fn: () => Promise<T>, ttlMs?: number): Promise<T> {
    return this.withLock(`ticket_cashout:${ticketId}`, fn, ttlMs);
  }
}
