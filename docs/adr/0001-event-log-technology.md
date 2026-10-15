# ADR-0001: Canonical Event-Log Technology & Provenance Architecture

* **Status:** Accepted
* **Date:** 2026-10-04
* **Deciders:** Architecture Steering Group, Trading Systems Engineering
* **Phase:** Prerequisite for Phase 1 (Licensed Feed Ingestion & Conformance)

---

## 1. Context and Problem Statement

The xBET platform operates real-time pricing models (Bivariate Poisson, Copula-based Bet Builder, and Cashout valuation) that rely on live pitch feeds. In the legacy implementation, feed messages mutated state directly in memory without recording provenance, latency, or provider-specific sequences. 

When match events are corrected (e.g. VAR overturns, disallowed goals, mistaken red cards), the platform must replay and rehydrate exact game states deterministically, adjust affected market prices, and maintain a forensically auditable historical record for gaming regulators.

We must decide on the storage and streaming technology for the canonical sports event log.

---

## 2. Decision Drivers

1. **Strict Ordering & Immutability:** Fixture events must never be mutated in place; corrections must be recorded as append-only superseding events.
2. **Deterministic Replay:** Trading models and backtesting simulations must be able to replay recorded matches tick-for-tick at arbitrary playback speeds.
3. **Data-Mode Separation:** Events must explicitly tag provenance as `SIMULATED`, `REFERENCE_ONLY`, or `LICENSED_LIVE`.
4. **Sub-Millisecond Distribution:** Live in-play pricing components must consume events with sub-5ms latency across internal network fabrics.
5. **Operational Simplicity:** Avoid premature distributed infrastructure complexity during Phase 0–1 while providing an evolutionary path to large-scale stream clusters.

---

## 3. Considered Options

* **Option 1: PostgreSQL Append-Only Partitioned Tables (`canonical_events`) + Redis Streams**
* **Option 2: Standalone Apache Kafka / Apache Pulsar cluster**
* **Option 3: Pure In-Memory Circular Buffers (Legacy Approach)**

---

## 4. Decision Outcome

**Chosen Option: Option 1 — Dual-Tier Architecture (PostgreSQL Partitioned Log + Redis Streams)**

### Implementation Specification:

1. **Authoritative Persistence (Tier 1 - PostgreSQL):**
   - Events are stored in `canonical_fixture_events` partitioned by `sport` and `month(occurred_at)`.
   - Schema mandates:
     - `event_id` UUID primary key.
     - `fixture_id` UUID foreign key.
     - `provider_sequence` monotonic integer per provider per fixture.
     - `event_type` enum (GOAL, VAR_DECISION, CARD, CORNER, FOUL, CLOCK_TICK, MARKET_SUSPEND, etc.).
     - `timestamps` JSONB `{ occurred, published, received, processed }`.
     - `payload` JSONB with strict schema validation per event type.
     - `correction_ref` nullable JSONB `{ supersedes_event_id, reason }`.
     - `raw_payload_ref` SHA-256 hash pointer to S3/MinIO cold blob storage.
     - `data_mode` enum (`SIMULATED`, `REFERENCE_ONLY`, `LICENSED_LIVE`).

2. **Real-Time Distribution (Tier 2 - Redis Streams):**
   - Active matches publish events to Redis Stream key `stream:events:{fixture_id}` with `XADD`.
   - Real-time odds engines and risk monitors join consumer groups with `XREADGROUP`.
   - Max stream length capped with `MAXLEN ~ 10000` to preserve in-memory footprint.

3. **Evolutionary Path to Phase 6+:**
   - When fixture concurrency exceeds 10,000 simultaneous global events/sec, outbox workers relay events to Kafka/Redpanda for cross-region replication and multi-terabyte analytics cold storage.

---

## 5. Consequences

### Positive:
* Guarantees zero data loss across database restarts with standard ACID write guarantees.
* Single source of truth for both live trading and historical regulatory audits.
* Enables deterministic regression testing against recorded match fixtures (`tests/conformance/`).
* Directly supports tribunal dispute resolution and settlement reversals.

### Negative / Trade-offs:
* Dual write to PostgreSQL and Redis requiresTransactional Outbox pattern to prevent split-brain state.
* Partition pruning and table vacuuming routines must be scheduled in database maintenance jobs.

---

## 6. Verification and Proving Tests

* Unit & Model Replay Suite: `services/odds-engine/test/canonical_feed_log.test.ts`
* Replay Conformance: `tests/e2e/football_v2_vertical_slice.test.ts`
* Data Mode Validation: `packages/core-types/test/auth_middleware.test.ts`
