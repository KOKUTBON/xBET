import { randomUUID } from 'node:crypto';
import type pg from 'pg';

export interface OutboxEvent<T = any> {
  id: string;
  eventType: string;
  aggregateId: string;
  payload: T;
  createdAt: Date;
  publishedAt?: Date | null;
}

export type OutboxEventHandler = (event: OutboxEvent) => Promise<void> | void;

export class TransactionalOutboxService {
  private static instance: TransactionalOutboxService | null = null;
  private pool?: pg.Pool;
  private memoryEvents: OutboxEvent[] = [];
  private handlers = new Map<string, Set<OutboxEventHandler>>();
  private allHandlers = new Set<OutboxEventHandler>();
  private relayTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private stats = {
    enqueuedCount: 0,
    publishedCount: 0,
    failedCount: 0,
  };

  constructor(pool?: pg.Pool) {
    this.pool = pool;
  }

  public static getInstance(pool?: pg.Pool): TransactionalOutboxService {
    if (!this.instance || pool) {
      this.instance = new TransactionalOutboxService(pool);
    }
    return this.instance;
  }

  /**
   * Enqueues an event atomically within an existing PostgreSQL transaction or into memory.
   */
  public async enqueue<T = any>(
    eventType: string,
    aggregateId: string,
    payload: T,
    client?: pg.PoolClient
  ): Promise<OutboxEvent<T>> {
    const id = randomUUID();
    const event: OutboxEvent<T> = {
      id,
      eventType,
      aggregateId,
      payload,
      createdAt: new Date(),
      publishedAt: null,
    };

    if (client) {
      await client.query(
        `INSERT INTO points_outbox (id, event_type, aggregate_id, payload, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [id, eventType, aggregateId, JSON.stringify(payload), event.createdAt]
      );
    } else if (this.pool) {
      await this.pool.query(
        `INSERT INTO points_outbox (id, event_type, aggregate_id, payload, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [id, eventType, aggregateId, JSON.stringify(payload), event.createdAt]
      );
    } else {
      this.memoryEvents.push(event);
    }

    this.stats.enqueuedCount++;
    return event;
  }

  /**
   * Subscribes a listener to a specific event type (or '*' for all events).
   */
  public subscribe(eventType: string, handler: OutboxEventHandler): () => void {
    if (eventType === '*') {
      this.allHandlers.add(handler);
      return () => this.allHandlers.delete(handler);
    }

    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);

    return () => {
      this.handlers.get(eventType)?.delete(handler);
    };
  }

  /**
   * Starts the background outbox dispatcher relay.
   */
  public startRelay(intervalMs: number = 500): void {
    if (this.relayTimer) return;
    this.relayTimer = setInterval(() => {
      void this.processPendingEvents();
    }, intervalMs);
    this.relayTimer.unref?.();
  }

  /**
   * Stops the background outbox dispatcher.
   */
  public stopRelay(): void {
    if (this.relayTimer) {
      clearInterval(this.relayTimer);
      this.relayTimer = null;
    }
  }

  /**
   * Processes a batch of pending events.
   */
  public async processPendingEvents(batchSize: number = 50): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    try {
      if (this.pool) {
        return await this.processDatabaseBatch(batchSize);
      } else {
        return await this.processMemoryBatch(batchSize);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processMemoryBatch(batchSize: number): Promise<number> {
    const pending = this.memoryEvents.filter((e) => !e.publishedAt).slice(0, batchSize);
    let count = 0;

    for (const event of pending) {
      try {
        await this.dispatch(event);
        event.publishedAt = new Date();
        this.stats.publishedCount++;
        count++;
      } catch (err) {
        this.stats.failedCount++;
        console.error(`[OutboxRelay] Failed to dispatch event ${event.id}:`, err);
      }
    }

    return count;
  }

  private async processDatabaseBatch(batchSize: number): Promise<number> {
    let client: pg.PoolClient | null = null;
    let count = 0;

    try {
      client = await this.pool!.connect();
      await client.query('BEGIN');

      const res = await client.query<{
        id: string;
        event_type: string;
        aggregate_id: string;
        payload: any;
        created_at: Date;
      }>(
        `SELECT id, event_type, aggregate_id, payload, created_at
         FROM points_outbox
         WHERE published_at IS NULL
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [batchSize]
      );

      const events: OutboxEvent[] = res.rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        aggregateId: row.aggregate_id,
        payload: row.payload,
        createdAt: row.created_at,
        publishedAt: null,
      }));

      const successfulIds: string[] = [];

      for (const event of events) {
        try {
          await this.dispatch(event);
          successfulIds.push(event.id);
          this.stats.publishedCount++;
          count++;
        } catch (err) {
          this.stats.failedCount++;
          console.error(`[OutboxRelay] Failed to dispatch event ${event.id}:`, err);
        }
      }

      if (successfulIds.length > 0) {
        await client.query(
          `UPDATE points_outbox SET published_at = now() WHERE id = ANY($1::uuid[])`,
          [successfulIds]
        );
      }

      await client.query('COMMIT');
      return count;
    } catch (err) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // ignore rollback error
        }
      }
      throw err;
    } finally {
      if (client) client.release();
    }
  }

  private async dispatch(event: OutboxEvent): Promise<void> {
    // Dispatch to specific event handlers
    const typeHandlers = this.handlers.get(event.eventType);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        await handler(event);
      }
    }

    // Dispatch to wildcard subscribers
    for (const handler of this.allHandlers) {
      await handler(event);
    }
  }

  public getStats() {
    return {
      ...this.stats,
      inMemoryPending: this.memoryEvents.filter((e) => !e.publishedAt).length,
    };
  }
}
