# Interim points-only sportsbook quote API

This is a Phase 0 control against client-supplied odds. It is not the durable, versioned pricing engine in the platform plan.

## Request flow

Both calls require the player's Bearer session. The betting service obtains market state from the odds service, not from the request body.

```http
POST /api/v1/bets/quote
Content-Type: application/json
Authorization: Bearer <session>

{"fixtureId":"...","marketId":"...","selectionId":"..."}
```

Response `201` contains `quote.quoteId`, `quote.expiresAt`, and the server selection snapshot, including decimal odds. The quote is bound to the signed-in account and expires after five seconds.

```http
POST /api/v1/bets/place
Content-Type: application/json
Authorization: Bearer <session>

{"quoteId":"...","stake":10,"idempotencyKey":"unique-player-action"}
```

Only `SINGLE` bets are accepted on this HTTP path. `legs`, `submittedOdds`, and client-selected currency are not accepted as prices or identity. The server re-reads the selection and rejects it if the price or score changed or the fixture/market/selection is not active. A missing, stale, expired or reused quote returns `409`; another player's quote returns `403`; odds-source failure returns `503`. A rejected quote requires a new quote request. In database mode, `idempotencyKey` is required; repeating it with the same quote and stake returns the original accepted ticket.

Fixture state now carries `lastUpdatedAt`, which is refreshed on ingestion, score changes, odds changes and market suspension. Live snapshots older than ten seconds and pre-match snapshots older than two minutes cannot be quoted. The odds service's manual HTTP feed-ingestion routes require an administrator session.

## Operating limits

- Without `DATABASE_URL`, quotes and bets are held in betting-service memory. Keep this demo path at one replica; a restart invalidates outstanding quotes.
- With `DATABASE_URL`, the quote is also persisted, and [points bet acceptance](phase-0-durable-acceptance.md) commits against PostgreSQL. Apply migration 002 first. The memory quote cache is still populated but is not the database path's acceptance authority. `XBET_ALLOW_VOLATILE_BETS=true` selects the isolated demo path outside production only.
- The source endpoint has no atomic market version shared with bet acceptance. A market change between the final odds read and the later ledger mutation can still race. The planned versioned quote and atomic acceptance workflow is required before a shared wagering pilot.
- `lastUpdatedAt` measures when xBET last changed its local fixture state. It does not prove that a provider's underlying event data is current. Provider event timestamps, gap detection and feed health remain Phase 1 work.
- This interim API can quote the simulator or an external odds feed. It does not produce xBET's independent fair probabilities. The data-mode and feed-rights gates in the platform plan remain open.
- The browser demo has no signed-in session or quote integration yet. Its wallet and game actions fail closed; its sportsbook button remains a demo client flow until it uses this API.
