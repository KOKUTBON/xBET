# ADR-0002: Canonical Fixture Identity & MDM Resolution Architecture

* **Status:** Accepted
* **Date:** 2026-10-04
* **Deciders:** Architecture Steering Group, Odds & Data Operations
* **Phase:** Prerequisite for Phase 1 (Licensed Feed Ingestion & Conformance)

---

## 1. Context and Problem Statement

A modern multi-feed sportsbook ingests fixtures from multiple commercial data suppliers (e.g. Sportradar, Enetpulse, Oddservice) as well as simulation engines. Each external feed models fixtures, leagues, and competitors with disparate identifiers, spelling variations, and localization strings:

* Provider A: `Manchester United` vs `Arsenal FC` (ID: `ep_88291`, Kickoff: `2026-10-15T15:00:00Z`)
* Provider B: `Man Utd` vs `Arsenal` (ID: `sr_match_99410`, Kickoff: `2026-10-15T15:00:00Z`)

If external IDs are used directly, the platform creates duplicate fixtures, partitions liquidity, causes fragmented liabilities, and risks conflicting settlements.

---

## 2. Decision Drivers

1. **Unique Canonical Ownership:** Every sports fixture, participant, and competition must possess an authoritative, permanent internal identifier owned by xBET.
2. **Provider Agnosticism:** Core betting engines, risk matrices, and betslips must be completely decoupled from third-party feed provider IDs.
3. **Multi-Feed Redundancy & Failover:** The platform must support hot-standby failover between providers without changing the customer-facing fixture ID or invalidating existing betslips.
4. **Deterministic Match Resolution:** Automated entity resolution must link incoming external payloads to canonical entities with measurable confidence scores.

---

## 3. Considered Options

* **Option 1: Primary Provider Pass-Through** (Use Provider A's ID as the internal ID; re-map Provider B).
* **Option 2: Authoritative Canonical MDM with Bidirectional Cross-Reference Mapping Tables**.
* **Option 3: Pure String Key Composite** (`{sport}:{home_name}:{away_name}:{date}`).

---

## 4. Decision Outcome

**Chosen Option: Option 2 — Authoritative Canonical Master Data Management (MDM)**

### Implementation Details:

1. **Canonical Schema:**
   - `canonical_fixtures`: Core table containing canonical `id` (UUID), `sport_id`, `competition_id`, `home_team_id`, `away_team_id`, `scheduled_start`, `status`, and `metadata`.
   - `fixture_provider_crossrefs`: Mapping table storing `(provider_name, provider_fixture_id) -> canonical_fixture_id` with a strict `UNIQUE(provider_name, provider_fixture_id)` constraint.
   - `participant_provider_crossrefs`: Mapping table storing competitor provider aliases.

2. **Ingestion & Resolution Pipeline:**
   - **Step 1: Direct Cross-Reference Lookup.** If incoming `(provider, provider_id)` exists in mapping table, immediately route payload to the canonical fixture.
   - **Step 2: Deterministic Fuzzy Heuristic Resolution.** If unmapped:
     - Compute phonetic and normalized Levenshtein distance across team names (token sorting, common abbreviation stripping e.g. "FC", "CF", "Utd").
     - Validate start time tolerance: $|\Delta t| \le 120\text{ minutes}$.
     - If resolution confidence $\ge 0.95$, automatically persist new cross-reference record and route event.
   - **Step 3: Trader Quarantine Queue.** If confidence is between $0.70$ and $0.94$, place event in the Trader Operations Console quarantine view for 1-click human verification.

3. **Lifecycle States:**
   - Canonical status strictly transitions according to the state machine:
     `SCHEDULED` $\rightarrow$ `PRE_MATCH` $\rightarrow$ `IN_PLAY` $\rightarrow$ `HALFTIME` $\rightarrow$ `IN_PLAY` $\rightarrow$ `REGULATION_ENDED` $\rightarrow$ `FINISHED` $\rightarrow$ `RESULTED` $\rightarrow$ `SETTLED`.

---

## 5. Consequences

### Positive:
* Enables hot failover between data suppliers during live matches with zero disruption to punters or open bets.
* Consolidates market liquidity and global risk exposure into single books.
* Eliminates phantom duplicate events on the web and mobile frontends.

### Negative / Trade-offs:
* Requires maintaining cross-reference tables and periodic data cleansing jobs.
* Initial onboarding of new providers requires pre-flight entity mapping passes.

---

## 6. Verification and Proving Tests

* MDM Ingestion Test: `services/odds-engine/test/feed_ingestion.test.ts`
* Canonical Entity Validation: `services/odds-engine/test/canonical_feed_log.test.ts`
* Multi-Feed E2E Flow: `tests/realtime/realtime-engines-validation.test.ts`
