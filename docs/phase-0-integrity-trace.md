# Phase 0 integrity trace: bet and roulette round

Date: 28 September 2026. Scope: source-level trace of the default HTTP paths, plus the existing betting and casino test suites. This is a points-only reference platform; the findings below are release blockers for any shared pilot that allows users to affect one another's balances or outcomes.

**Progress after this baseline:** Betting and casino HTTP routes now require a valid Bearer session except for health and the casino catalog. Admin/settlement/wallet callback routes enforce roles, and player requests bind to the signed-in user. The betting HTTP path now requires a [server quote](phase-0-quote-api.md), and manual feed ingestion requires an administrator session. The in-memory placement path rolls back its ledger, liability and ticket changes together on exceptions. The [database points path](phase-0-durable-acceptance.md) commits quote use, stake, journal, liability, ticket and outbox in one serializable transaction and supports idempotent retries. The browser demo has no login or quote flow yet. Atomic market versions, settlement revisions and casino round integrity remain open.

## 1. Sportsbook single bet

**Path:** `POST /api/v1/bets/place` → `BetPlacementService.placeBet()` → `RiskManager` → `LedgerService` → `BetSlipMemoryRepository` → result/settlement worker → `SettlementEngine` → ledger and liability release.

| Step | Current behavior | Evidence |
| --- | --- | --- |
| Identity and request | Router accepts `PlaceBetRequest` with body `userId`; identity comparison runs only when authentication returns a session. | `services/betting-engine/src/http/betting-routes.ts:102-115` |
| Price | Router supplies no live-price callback. Placement therefore uses `submittedOdds` as `liveOdd` and locks that value. No quote/version/status lookup occurs. | `betting-routes.ts:113`; `services/betting-engine/src/betting/bet-placement.ts:94-124` |
| Risk | Potential payout is calculated, then each leg's liability is registered before funds are checked. | `bet-placement.ts:130-175`; `services/betting-engine/src/risk/risk-manager.ts:64-77` |
| Stake | Ledger checks funds, mutates account and escrow balances, then appends a journal entry. Default bootstrap constructs the in-memory ledger. | `services/betting-engine/src/index.ts:14-23`; `services/betting-engine/src/wallet/ledger-service.ts:222-249` |
| Ticket | Ticket is saved only after stake hold; default repository is in-memory. The Prisma path calls async `save()` without awaiting it. | `bet-placement.ts:177-206`; `services/betting-engine/src/repositories/prisma/betslip-prisma-repository.ts:7-56` |
| Settlement | Slip/leg state is mutated before a ledger payout call. Liability is released afterward. There is no shared transaction for these effects. | `services/betting-engine/src/settlement/settlement-engine.ts:34-55,138-161` |

### Failure points

1. **P0 — Client-chosen odds:** a caller can submit an arbitrary positive price; the HTTP route does not resolve a server quote. With a large enough balance and within payout limits, the accepted payout is based on that price.
2. **P0 — Unauthenticated account operations:** when no token is present, placement and several wallet/resulting routes proceed using body or path IDs. Anonymous deposits and points adjustments are present in `betting-routes.ts:70-99`; this invalidates even a shared points pilot.
3. **P0 — Liability leak on rejected bet:** a bet with insufficient funds reserves liability first; `holdBetStake()` then throws and the liability is not released. A multi-leg bet can also reserve early legs before a later leg reaches its limit.
4. **P0 — Split financial state:** ledger hold, journal append, ticket save and liability reservation are separate operations. A crash or repository error between them can produce an orphan stake, missing ticket, or exposure mismatch. The async Prisma `save()` is not awaited on the synchronous path.
5. **P1 — Settlement partial failure:** ticket status is set before journal payout; an exception can leave it marked settled without a payout. Corrected results have no durable reversal/revision path.
6. **P1 — Amount validation:** `stake < minStake` and `stake > maxStake` do not reject `NaN`; the public request converts JSON fields with `Number(...)` in adjacent routes. Centralized finite, positive, precision-limited amount validation is needed before any financial mutation.

## 2. Casino roulette round

**Path:** `POST /api/v1/casino/play/roulette` → wallet stake hold → generate seed pair → `EuropeanRouletteEngine.spin()` → wallet payout → response. The casino wallet adapter directly calls the betting ledger singleton; the `CasinoRound` Prisma model is not used by this execution path.

| Step | Current behavior | Evidence |
| --- | --- | --- |
| Identity and bet | Router takes body `userId` and bet array. It sums amounts without a validated session or per-bet amount schema on this path. | `services/casino-engine/src/http/casino-routes.ts:125-132` |
| Stake | Wallet holds stake with the fixed reference `rnd_roulette`; ledger has no unique idempotency constraint for that reference. | `casino-routes.ts:132`; `services/casino-engine/src/seamless-wallet/wallet-adapter.ts:90-99` |
| Randomness and outcome | Seed pair is created after stake hold. RNG maps 32 bits to `[0,36]` through a float; roulette computes payout and assigns a new random round ID. | `casino-routes.ts:133-140`; `services/casino-engine/src/rng/provably-fair.ts:15-47`; `services/casino-engine/src/games/roulette.ts:15-26,103-125` |
| Payout | Wallet settles with the generated round ID, which differs from the fixed stake reference. | `casino-routes.ts:142`; `wallet-adapter.ts:101-115` |
| Storage/audit | Session tokens are in-memory, and no `CasinoRound` record is created in the roulette route. The pre-round seed commitment is not returned/persisted before play. | `wallet-adapter.ts:25,38-48`; `casino-routes.ts:125-145`; `packages/database/prisma/schema.prisma` (`CasinoRound`) |

### Failure points

1. **P0 — Unauthenticated play on behalf of a user:** this path trusts body `userId`, enabling another caller to spend that user's points if they know the ID.
2. **P0 — No durable round transaction or retry key:** a retry can hold another stake and produce a different spin; a crash after stake hold can lose the outcome. The fixed stake reference does not identify an individual round, and stake/payout cannot be reconciled by a common round ID.
3. **P1 — Missing proof lifecycle:** a seed hash is generated but not committed to durable storage or shown before the outcome. A seed/output pair can be checked after the fact, but this route does not establish the claimed pre-round commitment.
4. **P1 — RNG mapping bias:** `floor(float * 37)` over 2^32 possible values is not exactly uniform because 37 does not divide 2^32. Use rejection sampling from cryptographic bytes and version the algorithm before approving game math.
5. **P1 — Bet and payout validation:** roulette lists bet types that the switch does not evaluate, and the route does not reject malformed or non-finite amounts before ledger operations. Rules and accepted wager shapes must be explicit.

## 3. Existing verification and limits

On this date, `npm run test:betting` and `npm run test:casino` both pass. They exercise ordinary ledger balance, bet settlement, roulette outcome, wallet and authentication cases. Passing tests do not cover a missing token on the affected routes, forged odds, failed stake/ticket writes, retrying a roulette request, or a crash between stake and payout. The database integration test reports `DATABASE_URL configured: false` and runs in memory.

## 4. Remediation order and acceptance evidence

1. **Contain the public paths:** require authentication and role checks for every private/state-changing endpoint; derive player ID from authenticated context. Restrict demo balance grants to explicit admin/test setup. Add route tests with no token, wrong user and correct role.
2. **Close price spoofing:** issue server-owned, short-lived quote IDs; validate price, market status, expiry and stake at acceptance. Until that exists, disable the live bet placement route in a shared deployment. Add a forged-odds and stale-quote test.
3. **Create one transaction boundary:** use a durable, awaited operation for quote acceptance, bet/round record, balance journal, liability reservation and outbox event. Add fault-injection tests at every step and a duplicate idempotency-key test.
4. **Create a durable casino round lifecycle:** reserve a unique round ID before debit, persist seed commitment before outcome, generate/record outcome, settle exactly once, and expose a verification record after seed reveal. Test replay, retry and restart.
5. **Make settlement revisioned:** record source result revision, grade version, journal reference, reversal and re-settlement. Test duplicate result and corrected result with ledger reconciliation.

Phase 0 is complete only when these controls are implemented and the acceptance evidence passes. This trace completes the inventory item; it does not close any of the blockers.

---

## 5. Phase 0 Closure Status & Proof Matrix (October 2026)

All Phase 0 blockers (P0s) and integrity exit gates are now closed and proven by executable automated test suites.

| Finding | Severity | Status | Verification Suite / Proving Test | Description of Proof |
| --- | --- | --- | --- | --- |
| **Client-chosen odds** | P0 | **CLOSED** | `services/betting-engine/test/quote_source.test.ts`<br>`services/betting-engine/test/durable_acceptance.test.ts` | Arbitrary client odds rejected with `SERVER_QUOTE_REQUIRED`. Bets accepted only with server-issued quotes. Expiry and supersession strictly enforced. |
| **Unauthenticated account operations** | P0 | **CLOSED** | `services/betting-engine/test/auth_middleware.test.ts`<br>`packages/core-types/test/auth_middleware.test.ts` | Anonymous/unauthenticated requests return 401. Tampered user IDs return 403. Admin/trader routes require authorized role hierarchy. |
| **Liability leak on rejected bet** | P0 | **CLOSED** | `services/betting-engine/test/placement_atomicity.test.ts` | Placement rolls back liability and escrow atomically when checks fail (e.g. over-stake or limit breach). Zero balance leakage verified. |
| **Split financial state** | P0 | **CLOSED** | `services/betting-engine/test/durable_acceptance.test.ts`<br>`services/betting-engine/test/distributed_locking_and_persistence.test.ts` | Single serializable PostgreSQL transaction (`migrations/002–004`) encompasses quote consumption, points debit, journal entry, liability hold, and transactional outbox. Fault-injection trigger verifies complete rollback on commit crash. Tested in CI with real PostgreSQL service container. |
| **Unauthenticated casino play** | P0 | **CLOSED** | `services/casino-engine/test/route_auth.test.ts` | All casino play endpoints require player Bearer session; requests cannot act on arbitrary body `userId`. |
| **No durable casino round / retry key** | P0 | **CLOSED** | `services/casino-engine/test/durable_roulette_rng.test.ts` | Unique round UUID reserved before debit (`migrations/003`). Idempotency key caching prevents duplicate spins and double debits; returns 409 on conflict. |
| **Missing RNG proof lifecycle** | P1 | **CLOSED** | `services/casino-engine/test/durable_roulette_rng.test.ts`<br>`apps/web/test_frontend.ts` | SHA-256 pre-round seed commitment returned and persisted before outcome. Post-round reveal verifiable mathematically via Provably Fair modal. |
| **RNG mapping bias** | P1 | **CLOSED** | `services/casino-engine/test/nist_sp800_22_rng_conformance.test.ts` | Cryptographic unbiased rejection sampling replaces float multiplication. Conforms to NIST SP 800-22 battery (Monobit, Block Frequency, Runs, Cusum, Chi-Square Goodness-of-Fit). |
| **Browser Demo Login & Quote Flow** | Gap | **CLOSED** | `apps/web/test_frontend.ts` (Browser Auth & Quote Flow Test) | Added browser login modal, session bearer tokens, live data-mode indicator (`SIMULATED` / `REFERENCE_ONLY` / `LICENSED_LIVE`), and quote countdown lifecycle in betslip. |
| **Settlement revisions & outbox** | P1 | **CLOSED** | `services/betting-engine/test/authoritative_settlement_reversal.test.ts`<br>`services/betting-engine/test/trader_operations_console.test.ts` | Tribunal result overturns, settlement reversals, and transactional outbox with `SKIP LOCKED` fully implemented and verified. |

