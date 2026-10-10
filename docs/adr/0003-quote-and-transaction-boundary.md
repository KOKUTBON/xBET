# ADR-0003: Server Quote Lifecycle & Single Database Transaction Boundary

* **Status:** Accepted
* **Date:** 2026-10-04
* **Deciders:** Architecture Steering Group, Core Betting & Ledger Engineering
* **Phase:** Core Phase 0 Integrity Gate

---

## 1. Context and Problem Statement

In sports betting architectures, two critical financial vulnerabilities exist if not guarded by strict boundaries:

1. **Price Spoofing / Latency Arbitrage:** If the client submits user-selected odds or if bet placement does not verify that the price is actively valid, attackers exploit latency gaps or tampered HTTP payloads to lock advantageous prices after a pitch event has already occurred.
2. **Split Financial State / Inconsistent Mutations:** If stake deduction, liability allocation, ticket generation, and audit logging happen as decoupled operations, a mid-flight server crash or network timeout can deduct punter funds without issuing a ticket (orphan stake) or create a ticket without deducting funds (phantom balance).

---

## 2. Decision Drivers

1. **Zero Price Tampering:** The platform, not the client, must be the sole authority for odds calculation, market status, and acceptance validity.
2. **Strict Financial Atomicity:** Stake deduction, ticket creation, liability reservation, and event dispatch must succeed or fail as a single atomic unit.
3. **Idempotent Retry Safety:** Network retries from mobile devices or frontend browsers with identical idempotency keys must return identical responses without double-charging the user.
4. **Immediate Market Suspension Enforcement:** If a market is suspended (e.g. VAR review, penalty awarded), pending quotes must be instantaneously invalidated at the transaction gate.

---

## 3. Considered Options

* **Option 1: Two-Phase Placement (Client Odds Submission with Backend Price Check)**
* **Option 2: Server-Issued Quote Protocol with a Single Serializable PostgreSQL Transaction Boundary**
* **Option 3: Event Sourcing / Saga Pattern with Compensating Transactions**

---

## 4. Decision Outcome

**Chosen Option: Option 2 — Server-Issued Quote Protocol & Single Transaction Boundary**

### Implementation Architecture:

1. **Quote Lifecycle (Two-Step Contract):**
   - **Step 1: Quote Issuance (`POST /api/v1/bets/quote`):**
     - Client requests a quote for a selection or Bet Builder combination.
     - Server verifies current live price, market status (`ACTIVE`), and increments/reads `market_version`.
     - Server issues a `ServerQuote` with a 60-second TTL, recorded in PostgreSQL table `server_quotes` (or durable cache).
   - **Step 2: Quote Consumption & Bet Placement (`POST /api/v1/bets/place` or `/accept`):**
     - Client submits `{ quoteId, stake, idempotencyKey }` with authenticated Bearer token.
     - Engine verifies that the quote has not expired, has not been used, belongs to the authenticated player, and that the underlying market has not been superseded or suspended.

2. **Single PostgreSQL Transaction Boundary (`db/migrations/002_points_acceptance.sql`):**
   Within a single `BEGIN ... COMMIT` block executing at `READ COMMITTED` or `REPEATABLE READ`:
   ```sql
   -- 1. Idempotency Check
   SELECT id, status, payload FROM points_idempotency_keys WHERE key = $1 FOR UPDATE;

   -- 2. Consume Quote Atomically
   UPDATE server_quotes
   SET used_at = NOW(), used_by = $userId
   WHERE id = $quoteId AND used_at IS NULL AND expires_at > NOW();

   -- 3. Hold Funds in Double-Entry Ledger
   UPDATE points_accounts SET balance = balance - $stake WHERE user_id = $userId AND balance >= $stake;
   INSERT INTO points_journals (journal_type, debit_account, credit_account, amount, reference_id) ...;

   -- 4. Create Bet Ticket & Legs
   INSERT INTO betslip_tickets (id, user_id, quote_id, stake, odds, potential_payout, status) ...;
   INSERT INTO betslip_legs (ticket_id, fixture_id, market_id, selection_id, locked_odds) ...;

   -- 5. Allocate Market Liability
   UPDATE market_liabilities SET total_exposure = total_exposure + ($potential_payout - $stake) ...;

   -- 6. Insert Transactional Outbox Event
   INSERT INTO points_outbox (aggregate_type, aggregate_id, event_type, payload) ...;
   ```
   - If any step fails (or if a fault-injection trigger fires), PostgreSQL completely aborts the transaction (`ROLLBACK`). The user's balance is untouched, and zero orphan tickets or liability leaks exist.

---

## 5. Consequences

### Positive:
* Eliminates client price tampering and latency snipers.
* Prevents split financial states under power loss, node failure, or database lock contention.
* Guarantees double-entry conservation ($\sum \text{Debit} == \sum \text{Credit}$).
* Fully decoupled async messaging via the Transactional Outbox with `SKIP LOCKED`.

### Negative / Trade-offs:
* Requires an initial round-trip to acquire a quote before submitting placement.
* Highly contested markets must manage lock duration to avoid transaction timeouts (mitigated by sub-10ms transactional execution).

---

## 6. Verification and Proving Tests

* Server Quote Enforcement: `services/betting-engine/test/quote_source.test.ts`
* Placement Atomicity & Rollback: `services/betting-engine/test/placement_atomicity.test.ts`
* Real PostgreSQL Durable Acceptance & Crash Injection: `services/betting-engine/test/durable_acceptance.test.ts`
* CI Service Container Verification: `.github/workflows/ci-cd.yml` (`test-postgres-durable-acceptance`)
