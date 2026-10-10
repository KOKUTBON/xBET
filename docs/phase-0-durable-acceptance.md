# Phase 0 points acceptance transaction

The betting HTTP service uses PostgreSQL whenever `DATABASE_URL` is configured. It uses the isolated memory path only without a database, or with `XBET_ALLOW_VOLATILE_BETS=true` outside production. Production startup requires `DATABASE_URL`. The casino engine does not yet have a durable round lifecycle; with a database configured, its authenticated routes return `503` unless volatile casino mode is explicitly enabled outside production.

## Migration and operation

Apply [`002_points_acceptance.sql`](../db/migrations/002_points_acceptance.sql) after the existing initial schema and before starting the betting service. Fresh `docker-compose.yml` PostgreSQL volumes run both migrations at initialization. Existing volumes and external production databases need this migration applied explicitly, for example:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/002_points_acceptance.sql
```

Database-mode sessions must use currency `PTS`. An administrator funds an account with `POST /api/v1/admin/points/adjust` and `{ "userId": "...", "delta": 100, "currencyCode": "PTS", "idempotencyKey": "unique-admin-action" }`. The grant and its two journal lines commit together. Repeating the same key returns the original outcome; reusing it with another amount returns `409`.

The player calls `/api/v1/bets/quote` as in the [quote API](phase-0-quote-api.md), then calls `/api/v1/bets/place` with `{ "quoteId": "...", "stake": 10, "idempotencyKey": "unique-player-action" }`. The key is required and unique for that player. The service checks the live selection again, then runs a serializable PostgreSQL transaction that locks the quote and account, checks funds and selection liability, debits the player, credits house escrow, writes a balanced journal, saves the bet, consumes the quote and inserts a `BET_ACCEPTED` outbox row. A retry with the same key, quote and stake returns the same ticket and original post-bet balance. A storage failure returns `503`, and PostgreSQL rolls back all writes.

Stake and balance are stored as integer hundredths of a point. The initial single-bet limits are 0.10–5,000 PTS stake, 100,000 PTS potential payout and 50,000 PTS liability per selection. Multi-leg placement is not exposed on the database route.

Run the PostgreSQL integration test against a disposable database whose name includes `test`:

```sh
XBET_PG_TEST_URL=postgresql://localhost:5432/xbet_acceptance_test npm run test:db --workspace @xbet/betting-engine
```

The test exercises the HTTP route, duplicate keys, concurrent bets, a forced outbox failure and rollback. The ordinary test suite still runs without PostgreSQL.

## Remaining gates

- The current odds service does not commit a monotonic market version in the same database. A market change after the final recheck can race acceptance. Feed provenance, sequence gaps and licensed data modes remain open.
- The outbox row is durable but has no publisher yet. Cashout and settlement routes return `503` in database mode; accepted tickets must not be used in a shared pilot until resulting, journal reversals and liability release use this ledger.
- Casino authenticated routes return `503` in database mode. Their round, RNG and wallet workflow remains a separate integrity task.
- The signed-in browser flow and identity service are not yet integrated. A valid session token is required, but this slice does not establish a production account lifecycle.
