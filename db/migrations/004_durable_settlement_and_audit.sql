-- Migration 004: Durable Settlement, Resulting, Cashout, and Trader Operations Audit
-- Expands points platform schema with durable resulting, settlement revisions, cashout records, and immutable trader audit logs.

-- 1. Authoritative Fixture Results Table
CREATE TABLE IF NOT EXISTS points_fixture_results (
    fixture_id text NOT NULL,
    revision integer NOT NULL DEFAULT 1,
    home_score integer NOT NULL,
    away_score integer NOT NULL,
    status text NOT NULL DEFAULT 'FINISHED',
    actor_id text NOT NULL DEFAULT 'SYSTEM',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (fixture_id, revision)
);

-- 2. Settlement Revisions & Post-Match VAR Reversals
CREATE TABLE IF NOT EXISTS points_settlement_revisions (
    id uuid PRIMARY KEY,
    ticket_id uuid NOT NULL REFERENCES points_bets(id),
    revision integer NOT NULL DEFAULT 1,
    status text NOT NULL CHECK (status IN ('WON', 'LOST', 'VOID', 'HALF_WON', 'HALF_LOST', 'CANCELLED')),
    payout_minor bigint NOT NULL DEFAULT 0 CHECK (payout_minor >= 0),
    journal_id uuid REFERENCES points_journals(id),
    reason text,
    settled_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (ticket_id, revision)
);

-- 3. Durable Quantitative Cashout Transactions
CREATE TABLE IF NOT EXISTS points_cashout_transactions (
    id uuid PRIMARY KEY,
    ticket_id uuid NOT NULL REFERENCES points_bets(id),
    cashout_type text NOT NULL CHECK (cashout_type IN ('FULL', 'PARTIAL')),
    cashout_percentage numeric(5,2) NOT NULL CHECK (cashout_percentage > 0 AND cashout_percentage <= 100),
    cashout_amount_minor bigint NOT NULL CHECK (cashout_amount_minor > 0),
    stake_cashed_minor bigint NOT NULL CHECK (stake_cashed_minor > 0),
    journal_id uuid NOT NULL REFERENCES points_journals(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Immutable Trader Audit Log & Operational Actions
CREATE TABLE IF NOT EXISTS points_trader_audit_log (
    id uuid PRIMARY KEY,
    action_type text NOT NULL,
    actor_id text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Extend points_bets with settlement tracking columns if not already present
ALTER TABLE points_bets ADD COLUMN IF NOT EXISTS settled_payout_minor bigint DEFAULT 0;
ALTER TABLE points_bets ADD COLUMN IF NOT EXISTS settled_at timestamptz;

-- 6. High-Performance Indexes
CREATE INDEX IF NOT EXISTS points_settlement_revisions_ticket_idx ON points_settlement_revisions(ticket_id);
CREATE INDEX IF NOT EXISTS points_cashout_ticket_idx ON points_cashout_transactions(ticket_id);
CREATE INDEX IF NOT EXISTS points_trader_audit_created_idx ON points_trader_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS points_outbox_pending_idx ON points_outbox(created_at ASC) WHERE published_at IS NULL;
