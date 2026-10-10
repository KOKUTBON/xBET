import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RedisManager } from '../src/cache/redis-manager.ts';

describe('RedisManager Caching, Pub/Sub & Distributed Locks', () => {
  it('should store and retrieve cached keys with serialization', async () => {
    const redis = RedisManager.getInstance();
    await redis.set('test:fixture:9001', { id: '9001', home: 'Arsenal', away: 'Chelsea' }, 60);

    const data = await redis.get<{ id: string; home: string; away: string }>('test:fixture:9001');
    assert.ok(data);
    assert.strictEqual(data.home, 'Arsenal');
    assert.strictEqual(data.away, 'Chelsea');
  });

  it('should increment numeric counters atomically', async () => {
    const redis = RedisManager.getInstance();
    await redis.del('counter:bets');
    const c1 = await redis.incr('counter:bets', 1);
    const c2 = await redis.incr('counter:bets', 5);
    assert.strictEqual(c1, 1);
    assert.strictEqual(c2, 6);
  });

  it('should handle hash sets and gets', async () => {
    const redis = RedisManager.getInstance();
    await redis.hset('player:session:usr-99', 'balance', 500);
    await redis.hset('player:session:usr-99', 'tableId', 'poker-01');

    const balance = await redis.hget<number>('player:session:usr-99', 'balance');
    const all = await redis.hgetall('player:session:usr-99');

    assert.strictEqual(balance, 500);
    assert.strictEqual(all.tableId, 'poker-01');
  });

  it('should broadcast and receive messages via Pub/Sub', async () => {
    const redis = RedisManager.getInstance();
    const messages: any[] = [];

    const unsubscribe = redis.subscribe('odds:live:sr-9001', (msg) => {
      messages.push(msg);
    });

    await redis.publish('odds:live:sr-9001', { eventId: 'sr-9001', odds: 1.95 });
    await redis.publish('odds:live:sr-9001', { eventId: 'sr-9001', odds: 1.98 });

    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[1].odds, 1.98);

    unsubscribe();
  });

  it('should acquire and release distributed locks', async () => {
    const redis = RedisManager.getInstance();
    const lockId1 = await redis.acquireLock('wallet:usr-01', 2000);
    assert.ok(lockId1, 'First lock acquisition should succeed');

    const lockId2 = await redis.acquireLock('wallet:usr-01', 2000);
    assert.strictEqual(lockId2, null, 'Second concurrent lock should be blocked');

    const released = await redis.releaseLock('wallet:usr-01', lockId1!);
    assert.strictEqual(released, true, 'Lock should be successfully released');

    const lockId3 = await redis.acquireLock('wallet:usr-01', 2000);
    assert.ok(lockId3, 'Lock acquisition after release should succeed');
  });
});
