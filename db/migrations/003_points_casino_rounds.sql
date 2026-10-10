-- Points-only Casino durable rounds. Run after 002_points_acceptance.sql.
-- Stores immutable round records, provably fair seed commitments, and settled outcomes.

CREATE TABLE IF NOT EXISTS points_casino_rounds (
    id uuid PRIMARY KEY,
    user_id text NOT NULL,
    idempotency_key text NOT NULL,
    game_code varchar(50) NOT NULL,
    server_seed_hash varchar(64) NOT NULL,
    server_seed text,
    client_seed text NOT NULL,
    nonce bigint NOT NULL DEFAULT 1,
    wager_minor bigint NOT NULL CHECK (wager_minor >= 0),
    payout_minor bigint NOT NULL DEFAULT 0 CHECK (payout_minor >= 0),
    balance_after_minor bigint NOT NULL CHECK (balance_after_minor >= 0),
    game_state jsonb NOT NULL,
    status text NOT NULL DEFAULT 'SETTLED',
    created_at timestamptz NOT NULL DEFAULT now(),
    settled_at timestamptz DEFAULT now(),
    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS points_casino_rounds_user_idx ON points_casino_rounds(user_id, created_at DESC);
