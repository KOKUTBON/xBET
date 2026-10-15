# xBET quantitative gaming platform: delivery plan

Status: planning draft, 28 September 2026. This plan is grounded in the current points-only repository. It does not imply that the current platform, feeds, games, or controls are approved for wagering.

## 1. Goal and boundaries

Build three independently auditable products on shared account, ledger, identity, observability, and audit foundations:

1. **Sportsbook:** calculate xBET probabilities from licensed real-world data, then publish risk-aware quotes. Real events determine settlement.
2. **Casino:** generate outcomes from a controlled cryptographic RNG and immutable game rules. Sports results never affect a round.
3. **Virtual sports:** calibrate versioned simulation parameters from historical real data, then generate synthetic outcomes from a controlled RNG. Each event is reproducible.

First product target: **football, 1X2 and total goals, points-only**, with live ingestion, deterministic replay, coherent prices, quote validation, and settlement. Add markets and sports only after this vertical slice passes its gates. Keep the public repository an educational reference; put provider credentials, licensed datasets, private models, customer records, and operational risk parameters in private systems.

## 2. Current baseline and gaps

| Existing foundation | Evidence in repository | Gap to close |
| --- | --- | --- |
| Odds service, WebSocket, live state, feed adapters | `services/odds-engine` | Provider payloads primarily populate bookmaker prices and in-memory state. There is no canonical play-by-play event log, durable replay, or independent production pricing pipeline. |
| Football odds calculator | `domain/odds-calculator.ts` | Score/minute heuristics and a default 1.06 margin, without trained or calibrated pre-match/live models. |
| Real-data poller | `ingestion/the-odds-api-live-poller.ts` | Polls odds and scores; it does not provide the goal/VAR event ordering and recovery required by this plan. Its data rights and permitted uses need checking. |
| Bet, risk, and cashout code | `services/betting-engine` | The HTTP placement path passes no live-odds lookup and accepts submitted odds; no authoritative quote ID/version is enforced. Risk mainly totals liability per selection. |
| Ledger and settlement | betting engine and Prisma schema | Current synchronous memory path and financial mutations are not a single durable transaction. Settlement corrections and reversals need versioned workflows. |
| Casino games, HMAC RNG, and schema | `services/casino-engine`, `CasinoRound` | Audit storage, seed lifecycle, unbiased integer mapping, immutable game configurations, round idempotency, and mathematical verification need explicit implementation and review. |
| Virtual racing | `games/virtual-racing.ts`, `VirtualEvent` | Runner ratings use `Math.random()`, and parameters/outcomes are not versioned for deterministic replay. |
| Auth and deployment scaffolding | core types, gateway, Docker/Kubernetes | Several HTTP routes make auth optional when a token is absent; public points balances and outcomes need server-side authorization and abuse controls before wider testing. |

README claims should be audited against executable behavior as part of Phase 0, especially language suggesting production readiness or certified games.

## 3. Architecture and key contracts

Use the existing workspaces and extract modules before creating many deployable services. A service boundary is justified when ownership, scaling, fault isolation, or certification requires it.

```text
licensed provider → raw capture → validation/normalization → ordered canonical log
                                                       │
                                      football state + replay
                                                       │
                                 model → score distribution → markets
                                                       │
                                price policy → risk → immutable quote
                                                       │
                     WebSocket/REST → atomic bet acceptance → ledger
                                                       │
                              authoritative result → settlement

casino: controlled RNG → game rules → round record → ledger
virtual: versioned calibration → controlled RNG → event log → markets/ledger
```

Define and version these contracts before migrating code:

- `CanonicalSportsEvent`: provider and external IDs, internal fixture ID, sport/type, payload schema version, provider sequence, event ID/idempotency key, four timestamps (`occurred`, `published`, `received`, `processed`), correction/supersession reference, provenance and confidence. Store raw payload separately with access control and retention policy.
- `FootballState`: event sequence, score, period/clock, cards and other available features; reducer must be deterministic, idempotent, and support corrected events.
- `ModelRun`: model/data/feature/calibration/code versions, state sequence, input hash, output score distribution, uncertainty, processing time.
- `MarketProbability`: rule-set version, market/line/selection IDs, fair probability or settlement fractions; all markets derive from the same score or path distribution for a given snapshot.
- `Quote`: quote ID, monotonic market version, price, max stake, state sequence, model and margin/risk policy versions, created/expiry times, status and suspension reason. Persist it before publishing.
- `BetAcceptance`: authenticated account, requested quote IDs, client idempotency key, accepted quote snapshots, stake in integer minor units, risk reservation, journal reference, and acceptance decision.
- `ResultRevision` and `SettlementRevision`: authoritative source, rules version, revision number, prior revision, idempotency key and reversal journal reference.
- `GameRound`: game/rules/paytable/RNG versions, public commitment, protected seed reference, nonce, outcome, payout, and journal references.

**State storage:** PostgreSQL is the transactional authority for quotes, bets, balances, rounds and settlements. Use an append-only event log for captured sports events and snapshots for fast recovery. Redis may cache and fan out state, but must not be the only copy of anything needed for audit. Choose Kafka/Redpanda only after measured throughput and retention needs justify it; a transactional outbox plus PostgreSQL can support the first vertical slice.

**Important distinction:** replay reproduces state and quotes only if the exact feed events, rules, model artifact, configuration, ordering and random seeds are retained. A recomputation under a newer model is a new experiment, not the historical decision.

## 4. Delivery phases and exit gates

Durations below are rough elapsed engineering estimates for a small dedicated team with feed access. Provider contracting, data history and regulatory review can dominate the schedule.

| Phase | Scope and deliverables | Exit gate | Indicative duration |
| --- | --- | --- | --- |
| **0. Integrity and baseline** | Inventory runtime paths and tests; classify demo vs production claims; lock points-only mode; require authentication/authorization on state-changing and private routes; prohibit client-supplied final odds; select integer money representation; document threat model, data rights and rollback plan. | No anonymous balance grants, result submissions or bet acceptance; every accepted bet uses server-issued price; baseline tests and known gaps recorded. | 2–4 weeks |
| **1. Feed and event log** | Select licensed football event feed and historical data; negotiate usage/retention rights; build one real adapter plus simulator adapter; stable fixture/entity mapping, ordering, dedupe, gap detection, corrections, raw capture, timestamps, stale-feed suspension and recovery. | Recorded matches reconstruct the same final state; duplicates and out-of-order events do not alter outcome; feed loss closes affected markets within agreed latency. | 4–8 weeks after access |
| **2. Replay laboratory and model baseline** | Dataset with training/validation/test time split; pre-match team-strength + goal model; live score/time/red-card update; deterministic backtest runner; model registry and calibration reports. | Reproducible out-of-sample Brier/log loss and reliability report; baseline beats a documented naive comparator; no data leakage. | 6–10 weeks |
| **3. Market and quote pipeline** | Shared score/path distribution; 1X2 and totals first; market rule definitions, push/void treatment, margin policy, coherence checks, quote persistence/versioning, suspend/reprice/reopen flow, REST/WebSocket sequencing. | Probability invariants and cross-market relations hold within numerical tolerance; stale or suspended quote always rejects; replay reproduces published quote history. | 5–8 weeks |
| **4. Bet/risk/settlement integrity** | Atomic quote validation, stake debit, liability reservation and bet record; exposure by score scenario; limits; cashout quote flow; resulting revisions, idempotent settlement and journal reversals; reconciliation. | Concurrency and crash tests preserve balances and limits; duplicate request/settlement has one effect; correction produces traceable reversal and re-settlement. | 6–10 weeks |
| **5. Shadow and points pilot** | Live football event recording, internal prices, reference-market anomaly alerts, trader console, feed/model/platform metrics, incident runbooks, then restricted points-only pilot. | Sustained shadow period with monitored calibration, latency, stale-feed handling and zero unreconciled journal entries; pilot issues triaged before expanding markets. | 6–12 weeks |
| **6. Casino hardening** | Separate round state machine; immutable game math and paytables; protected seed lifecycle; unbiased random mapping; exact RTP analysis where feasible plus statistical simulation; round replay and reconciliation. Start with one simple game such as roulette. | Independent game math review, deterministic round verification, distribution tests, duplicate/failed-round recovery, and no missing or duplicate wallet entry. | 8–16 weeks per initial game platform; later games vary |
| **7. Virtual sports** | Versioned calibration from permitted historical data; seeded event generator, immutable event log, settlement rules and shared market derivation; start with one virtual football format. | Same seed/config gives same synthetic match; empirical frequencies match designed probabilities within confidence intervals; all bets/rounds reconcile. | 8–16 weeks |
| **8. Regulated deployment track** | Choose target jurisdiction and operating model with counsel; map license, vendor, feed, player protection, audit, RNG/game certification, security, AML/KYC and reporting obligations; commission independent testing. | Written legal authorization and all jurisdiction-specific approvals, contracts, certifications and operational controls completed. No calendar estimate before jurisdiction and model are chosen. | Separate track |

For Italy, the relevant starting points are [ADM's remote-gambling concessionaire list](https://adm.gov.it/portale/it/web/guest/monopoli/giochi/gioco_distanza/gioco_dist_concessionari) and [ADM's remote-gambling rules index](https://www.adm.gov.it/portale/-/gioco_dist_normativa-normativa). [GLI-19 v3.0](https://gaminglabs.com/gli-standards/) is a useful technical reference for interactive gaming systems; the applicable approval route still depends on the chosen jurisdiction and product.

Phases 1–4 form the football critical path. Phase 0 starts immediately. Casino and virtual design can be explored in parallel after shared ledger and audit contracts stabilize, but their deployment gates remain independent.

## 5. Work packages by phase

### Phase 0: first backlog

The end-to-end path inventory is recorded in [Phase 0 integrity trace](phase-0-integrity-trace.md). Betting and casino route authorization and the [interim points-only server quote](phase-0-quote-api.md) are implemented. The memory placement path rolls back balance, journal, liability and ticket on failure. The [database points acceptance path](phase-0-durable-acceptance.md) commits quote use, account debit, journal, liability, ticket and outbox together with idempotency. Settlement, cashout, casino rounds, market-version atomicity, data modes and signed-in browser integration remain open.

1. Trace one full bet and one full casino round across HTTP, storage, risk and ledger; record failure points.
2. Close optional-auth paths in betting/casino and admin/resulting endpoints; use authenticated user identity rather than request-body `userId`.
3. Remove submitted odds as a valid final price. Until quote service exists, issue a server-side short-lived price token or disable public placement against live fixtures.
4. Separate `SIMULATED`, `REFERENCE_ONLY`, `LICENSED_LIVE` data modes in UI and API. Never silently fall back from a live event to a simulator while accepting bets on that fixture.
5. Set the durable transaction boundary for account debit, bet/round creation, liability reservation and outbox event. Replace in-memory defaults for any shared pilot environment.
6. Audit documentation and deployment defaults, including claims about certification, feed affiliation, and production readiness.

### Phases 1–2: data and research

- Build a provider conformance suite from raw, corrected, duplicate and missing messages. Support one provider fully before promising failover; a secondary provider requires fixture identity and sequencing reconciliation.
- Capture exact raw payloads, canonical events and state snapshots. Create replay commands for a fixture and a time cutoff.
- Specify market settlement rules before modeling: 90-minute vs extra-time scope, abandoned fixtures, own goals, VAR reversals, totals pushes and rule versions.
- Establish pre-match and in-play baselines with documented feature availability. Keep training data strictly earlier than evaluated matches; evaluate by competition, season, time band, scoreline and red-card state.
- Record uncertainty and calibration, but do not let an LLM choose betting probabilities.

### Phases 3–5: trading and operations

- Use one outcome distribution for dependent markets; add independent specialty models only when their joint consistency can be checked.
- Separate fair probability, margin, risk shading and displayed price in storage and trader UI. Bound shading and cap quote size when uncertainty rises. Stale/unknown data suspends; increasing margin is not a substitute for missing state.
- Bet acceptance must use one database transaction or equivalent serializable reservation protocol. Check quote, market status, expiry, account funds and limits at commit time; journal exactly once.
- Implement scenario exposure across related selections and parlays. Add cashout only after the same quote/version and result-correction semantics work for standard bets.
- Trader overrides require actor, reason, expiry, affected markets, old/new values and audit event. Alerts need an owner and incident runbook.

### Phases 6–7: game engines

- Define a game configuration hash and immutable version. Analyze theoretical RTP from rules where possible; large Monte Carlo samples validate implementations but cannot alone prove rare-event RTP.
- Review all uses of RNG. Map bytes to bounded integers without modulo or float discretization bias, define nonce uniqueness and seed rotation/reveal, and protect unrevealed server seeds. Verification commitments must exist before round execution.
- Treat virtual outcomes as generated from fixed event parameters plus controlled randomness. Freeze parameter versions before taking bets. Reuse market and ledger infrastructure, but isolate virtual resulting from real-sports feeds.

## 6. Quality gates and measurements

Set numeric service targets after measuring the provider and infrastructure baseline. Provisional pilot targets to ratify in Phase 1:

- **Feed safety:** 100% of detected sequence gaps, stale states, and provider disconnects suspend affected markets; no quote remains executable after its market suspension commits.
- **Replay:** 100% deterministic state/quote reproduction for retained fixture recordings under pinned versions; every correction produces a new state revision.
- **Pricing:** probabilities stay within [0,1], exhaustive outcomes sum to 1 within a defined tolerance, market identities hold, and calibration reports include confidence intervals and sample size.
- **Bet/ledger:** zero duplicate accepted bets for one idempotency key, zero negative available balances from races, zero unmatched journal entries in reconciliation, and every settlement revision links to an authoritative result.
- **Games:** version-specific theoretical RTP and statistical confidence interval, deterministic verification vectors, secure key lifecycle, no round with stake but no terminal outcome or recoverable pending state.
- **Operations:** end-to-end latency p50/p95/p99 by stage, quote rejection rate/reason, market uptime, model drift, feed freshness, settlement lag, and incident recovery time.

Tests should cover provider corrections and gaps, replay from snapshot, model backtests, market property checks, quote race conditions, concurrent placement, process crash around transaction commit, settlement reversal, RNG vectors and mapping distribution, game math, load, and restore from backup. Run these on meaningful recorded scenarios rather than tests that simply mirror implementation.

## 7. Team, dependencies, and decision log

Minimum sustained delivery team: one technical lead, two backend/data engineers, one quantitative modeler/data scientist, one QA/SRE engineer shared across phases, and access to a trader/domain expert. Security, legal/regulatory counsel and independent game-math reviewers join at their gates. A smaller team can do it, but calendar estimates expand.

External dependencies: provider event rights and historical data, exact supported football markets and settlement rules, target competitions, permitted use of reference prices, hosting/data-retention constraints, and the eventual jurisdiction/operating model. Do not design around a named provider until its actual contract and event schema are available.

Decisions to record as ADRs before Phase 1: event-log technology; fixture identity scheme; quote consistency/transaction boundary; market rule set; model artifact format and replay retention; public/private repository split; and approved data modes.

## 8. First milestone: football V2 vertical slice

Deliver one recorded and one live football fixture through:

```text
provider → canonical event → durable log → deterministic state
         → pinned football model → score distribution
         → 1X2 + total-goals probabilities → margin/risk policy
         → versioned quote → WebSocket → authenticated points bet
         → authoritative result → journaled settlement
```

The demonstration must include a goal, a VAR cancellation, a duplicated/out-of-order event, a feed outage, an expired quote, a concurrent bet attempt, and a corrected final result. A reviewer must be able to replay the fixture and explain every accepted or rejected bet from retained evidence.
