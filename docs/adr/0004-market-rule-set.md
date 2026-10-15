# ADR-0004: Sports Market Rule Set & Authoritative Resolution Hierarchy

* **Status:** Accepted
* **Date:** 2026-10-04
* **Deciders:** Architecture Steering Group, Head of Sportsbook Operations, Regulatory Compliance
* **Phase:** Prerequisite for Phase 1 (Licensed Feed Ingestion & Resulting)

---

## 1. Context and Problem Statement

Automated settlement engines require unambiguous rules governing market resolution, abandonments, dead-heats, and post-match tribunal corrections. In legacy systems, settlement was often performed via ad-hoc script runs or manual database edits, leading to:

1. Conflicting settlements across different sports feeds.
2. Unhandled edge cases (e.g., matches abandoned after 75 minutes, dead-heats in top goalscorer markets).
3. Inability to safely reverse settlements when official governing bodies overturn results post-game (e.g. VAR review corrections, disqualified athletes, disciplinary tribunal rulings).

---

## 2. Decision Drivers

1. **Deterministic Automated Resulting:** Automated feeds must grade bets identically without human intervention for 99%+ of standard match outcomes.
2. **Regulatory Standards Alignment:** Rules must comply with UK Gambling Commission (UKGC) RTS 3 & 7 and Malta Gaming Authority (MGA) Player Protection Directives.
3. **Double-Entry Financial Conservation:** Reversals, void refunds, and dead-heat payouts must strictly balance the ledger ($\Delta \text{Assets} = \Delta \text{Liabilities} + \Delta \text{Equity}$).
4. **Immutable Auditability:** Every resulting and re-settlement action must cite its authoritative source, timestamp, and operator identity.

---

## 3. Considered Options

* **Option 1: Informal Operator Discretion** (Traders manually grade and adjust balances on disputes).
* **Option 2: Formal Hierarchical Market Rule Engine with Versioned Reversal Protocols**.
* **Option 3: External Black-Box B2B Feed Delegated Resulting**.

---

## 4. Decision Outcome

**Chosen Option: Option 2 — Formal Hierarchical Market Rule Engine**

### Rule Set Specification:

### 4.1 Resolution Authority Hierarchy
When conflicting outcomes exist, resolution is determined in strict precedence:
1. **Tier 1 (Authoritative Governing Body):** Official competition sheets (FIFA, UEFA, Premier League, NBA, ATP/WTA).
2. **Tier 2 (Official Commercial Feed):** Contracted low-latency licensed B2B resulting feeds (Sportradar, Enetpulse).
3. **Tier 3 (Trader Tribunal Correction):** Authorized Trader / Risk Manager manual entry with mandatory regulatory audit log (`settlement_revisions`).

### 4.2 Standard Sport Rules
1. **Regular Time Standard (Football):**
   - All markets are settled on the basis of 90 minutes play plus referee injury time, unless explicitly titled "Includes Extra Time" or "To Qualify".
2. **Postponements & Abandonments (36-Hour Window):**
   - If a fixture is postponed or abandoned and not resumed within 36 hours of the original kickoff, all unresulted markets are graded `VOID` (odds reset to 1.00, stakes refunded).
   - Any market unconditionally determined prior to abandonment (e.g., First Goalscorer, First Half Result for a match abandoned in the 65th minute) remains settled as resulted.
3. **Dead-Heat Reduction Formula:**
   - In the event of a tie for a single winning position:
     $$\text{Effective Stake} = \frac{\text{Initial Stake}}{N}$$
     $$\text{Total Payout} = \text{Effective Stake} \times \text{Locked Odds}$$
     where $N$ is the number of tied competitors.
4. **Tribunal Reversals & Re-Settlement Window (`migrations/004`):**
   - If an official result is revised or overturned within 24 hours of settlement:
     - The engine executes a compensating reversal:
       - Erroneously credited payouts are reclaimed via ledger adjustment (`SETTLEMENT_REVERSAL`).
       - Correctly winning tickets are credited (`SETTLEMENT_PAYOUT_CORRECTED`).
     - Both operations are recorded in `settlement_revisions` and audited in `settlement_audit_logs`.

---

## 5. Consequences

### Positive:
* Provides transparent, legally enforceable rules published in player terms of service.
* Enables automated settlement workers to safely grade millions of tickets per month.
* Supports tribunal result overturns without manual database surgery or balance drift.

### Negative / Trade-offs:
* Players whose winnings are reversed due to late tribunal corrections may contest debit adjustments (addressed by player agreement clause 14.3 and clear tribunal reason notifications).

---

## 6. Verification and Proving Tests

* Automated Settlement Engine: `services/betting-engine/test/automated_settlement.test.ts`
* Authoritative Reversals & Tribunal Overturns: `services/betting-engine/test/authoritative_settlement_reversal.test.ts`
* Trader Operations Console Controls: `services/betting-engine/test/trader_operations_console.test.ts`
