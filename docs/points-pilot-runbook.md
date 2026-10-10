# Restricted points pilot

This milestone implements a PostgreSQL-backed educational pilot: soccer singles (90-minute 1X2 and totals 1.5/2.5/3.5) and European roulette. Points have no cash or prize value. All fixture data is labeled SIMULATED. It does not establish production readiness for a gambling business.

## Implemented behavior

- Password-based player registration/login; public registration cannot choose identity or staff role. Passwords use salted scrypt. Signed two-hour sessions are persisted by token hash, checked on each private request and revoked on logout. Browser reload restores the session from session storage and reads balances/history from the server.
- Versioned model-priced soccer markets are persisted before publication. Frozen, resulted, stale or superseded markets fail closed at acceptance. Totals already determined by the current score are suspended; nonfinite prices or prices above the pilot maximum of 1,000 are unavailable. Quote locking and player confirmation are separate UI actions. Singles only; authoritative balance, ticket, ledger, liability and outbox changes commit together.
- The restricted operator console exposes server state/audit, freeze controls, results/corrections, administrator grants and reconciliation without simulated health metrics.
- Global freeze stops new soccer and roulette wagers. Fixture freeze stops that fixture. Staff actions require a stored authorized session and create an audit record.
- Staff results produce versioned win/loss/void settlements, integer minor-unit balanced journals, released exposure and durable notifications. Changed results reverse/re-settle where available funds allow. If a downward correction cannot recover the previous payout, the entire correction is rejected as `CORRECTION_REQUIRES_FUNDS`; no negative player balance or partial revision is committed. The operator must investigate and decide a documented resolution.
- Roulette returns a persisted hash commitment before play, stores the unrevealed seed encrypted with AES-256-GCM, requires a client seed and reveals the seed after the round commits. Supported bets: straight, dozen, red/black, even/odd, low/high. Request identity includes every bet shape, amount, commitment and client seed. Concurrent retries return one round and one wallet effect.
- Both products enforce the same UTC daily wager budget and self-exclusion inside their transaction. Default budget 1,000 PTS. Players may lower the budget or extend an exclusion (1–3,650 days); they cannot increase a saved budget or shorten exclusion. These actions are available in My account.
- The betting process relays the outbox to a durable account inbox every 500 ms. Delivery inserts and the published marker share a transaction, and the notification ID is unique. This is an internal inbox, not external email or push delivery.
- Browser WebSocket connects through the same-origin `/ws` proxy and reads persisted market snapshots. Unsupported games, cashout, payments, vouchers and legacy management are disabled in pilot mode. The casino catalog advertises roulette only.

## Start on a fresh database

Use Node 24 and PostgreSQL (CI uses PostgreSQL 16). Install with `npm ci`. Copy `.env.example` to a private `.env`, then set:

| Variable | Requirement |
| --- | --- |
| `XBET_PILOT_MODE` | `true` for every backend |
| `DATABASE_URL` | One shared PostgreSQL points database; use a direct/session connection for migrations |
| `JWT_SECRET` | Same random secret on all backends, at least 32 characters |
| `RNG_SEED_KEY` | One retained 32-byte key, encoded as 64 hex characters |
| `ENABLE_SIMULATOR` | `true` only for the clearly labeled simulated pilot; otherwise no implicit feed fallback |
| `ADMIN_BOOTSTRAP_USERNAME` | Reserved administrator username |
| `ADMIN_BOOTSTRAP_PASSWORD` | Private password of at least 16 characters for initial bootstrap |
| `XBET_TRUST_PROXY` | `true` only when backends are reachable solely through the gateway/web proxy (production Compose sets it); login throttling then uses the proxy's `X-Real-IP` |

Generate the JWT secret and seed key separately with `openssl rand -hex 32`. Keep both in your secret store. Keep the seed key with encrypted backups: losing it prevents use of unrevealed commitments. Do not silently replace it across restarts. No key-rotation workflow is implemented yet.

Run:

```sh
npm run db:migrate:points
npm run build:web
npm start
```

The migrator applies 001–005 in order, records checksums and serializes runners with a PostgreSQL advisory lock. Re-running it on a migrated database is a no-op. The bootstrap creates the first administrator only; it never changes the password or promotes an existing player. Remove the bootstrap password from runtime configuration after verifying staff login. Public player accounts start with zero points.

The standard local web server uses port 3000 and backends 4000–4003. Browser auth and requests use the web proxy; WebSocket uses `/ws`. Individual service runs can set `PORT`, `HOST` and web proxy URLs (`ODDS_ENGINE_URL`, `BETTING_ENGINE_URL`, `CASINO_ENGINE_URL`, `LEGACY_BRIDGE_URL`). All services must share the same secrets/database.

## Existing databases

Do not run migration 001 blindly on an existing untracked schema. Back up and restore a copy first, inventory which of 001–004 already exist, and establish a reviewed checksum baseline in `points_schema_migrations` before applying 005. Legacy identity/wallet migration is not automatic: this pilot uses `points_users`, not legacy user credentials. A fresh pilot database is the supported starting point. Never run test gates against user or production data.

## Operator API

Use a bearer token obtained from `POST /api/v1/auth/login` with username/password. Avoid putting tokens in URLs or shell history. Public `POST /api/v1/auth/register` takes username/password only; staff roles are provisioned out of band.

| Operation | Request |
| --- | --- |
| Grant/revoke test points (administrator) | `POST /api/v1/admin/points/adjust`: `userId`, signed `delta`, unique `idempotencyKey` |
| Freeze all wagers (trader/risk/admin) | `POST /api/v1/trader/freeze/global`: `frozen`, nonempty `reason` |
| Freeze fixture | `POST /api/v1/trader/freeze/fixture`: `fixtureId`, `frozen`, `reason` |
| Submit/correct result (risk/admin) | `POST /api/v1/settlement/fixture-result`: `fixtureId`, `homeScore`, `awayScore`, `status`, `source`, unique `idempotencyKey` |
| Reconcile ledger/exposure | `GET /api/v1/settlement/reconciliation` (risk/admin) |
| Read protection / update protection | `GET` / `POST /api/v1/account/protection`; update `dailyWagerLimit` or `selfExcludeDays` |
| Read notifications | `GET /api/v1/account/notifications` |

Result status is FINISHED, ABANDONED or CANCELLED. Abandoned/cancelled fixtures void all supported bets. Results freeze the fixture and do not reopen it through simulator publication. The simulator settles finished soccer fixtures automatically with source SIMULATED_ENGINE, but only when no result exists; it never overrides a staff result or correction. Staff-entered source is an audit label, not evidence of an independently verified feed. Preserve the original result evidence outside the request.

Reuse the exact same idempotency key and body after a timeout. Changed bodies with the same key are rejected. Resolve ambiguous requests through ticket/round history before starting a new request. The browser retains the pending key during in-page transport retries; after a browser close/reload, inspect history before retrying (pending requests are not persisted across page reloads).

## Validation and release gate

On a disposable database migrated with 001–005:

```sh
XBET_PG_TEST_URL=postgresql://user:password@localhost:5432/xbet_test npm run test:pilot
npm run typecheck:pilot
npm test
npm run build
npm run build:web
```

`test:pilot` fails if PostgreSQL is unavailable rather than skipping. It exercises credentials/role rejection, concurrent request replay/conflicts, market freezes, result corrections, encryption/commitment proof, transactional rollback on an injected final outbox-write failure, wager limits/exclusion, durable inbox delivery and balanced-account/exposure reconciliation. A separate subprocess gate kills/restarts actual betting and casino processes and checks session, ticket, commitment, round and void-result persistence. Requests race across two independent betting/casino processes to verify one wallet effect across replicas. CI runs this gate against PostgreSQL 16.

Historical development evidence (rerun these gates on each candidate): PostgreSQL 14 gates passed; fresh migration and repeat migration passed; full existing test suite passed; scoped new pilot code strict typecheck and workspace build passed. Browser login, reload restoration, same-origin live data, restricted catalog, account-limit update and operator state/reconciliation were checked. Lost placement responses followed by quote expiry replay the original request without a second debit. `typecheck:pilot` covers the new store/roulette core; workspace builds remain syntax checks, not a complete strict typecheck. Existing database tests in `npm test` may skip; this is why the explicit pilot gate is mandatory.

Compose uses a one-shot migration service before application startup and Node 24 images. Validate configuration with `docker compose config --quiet`; use the production file only with explicit database/secret values. Production Compose also requires GRAFANA_ADMIN_PASSWORD and DB_PASSWORD_FILE pointing to a private database-password file. Local Docker daemon was unavailable, so image builds and a containerized deployment have not been verified. Kubernetes manifests have not been updated for this pilot. Do not infer deployment readiness from static manifest tests.

## Recovery and observed pilot

1. Before enabling participants, test a database backup restore with the retained seed key; verify sessions, ticket/round history, pending commitments and reconciliation on the restored copy.
2. On integrity, stale-feed or balance incidents, freeze globally using the API. Investigate durable fixture versions, journals, result revisions, trader audit records and outbox. Keep account reads available. Resume only after reconciliation and the cause are resolved.
3. Check reconciliation `ok=true`, empty imbalance/drift/exposure arrays and bounded `pendingOutbox`. Alert on any nonzero drift, steadily increasing backlog, database failures and stale active fixtures. Automated operational alerts and a staffed response schedule remain deployment work.
4. Run an observed restricted pilot with named operators and participants, recording acceptance/settlement latency, rejection reasons, restart/failure incidents and reconciliation results. No public deployment was made in this task.

Still required before broader completion: container smoke/deployment and restore rehearsal, complete workspace typechecking, pending-browser-request recovery across reloads, operational alerts and an observed pilot. Licensed live feeds, cashout, additional games, payments/identity/compliance workflows, mobile push/biometric/video and regulated production certification remain separate milestones from the original completion audit.
