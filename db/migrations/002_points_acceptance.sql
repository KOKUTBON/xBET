-- Points-only sportsbook acceptance. Run after 001_initial_schema.sql.
-- IDs from the current odds service and auth session are opaque text; the
-- legacy fixture/user FK tables are not authoritative for this slice.
CREATE TABLE IF NOT EXISTS points_accounts (
    account_key text PRIMARY KEY,
    user_id text,
    currency_code varchar(3) NOT NULL DEFAULT 'PTS' CHECK (currency_code = 'PTS'),
    balance_minor bigint NOT NULL DEFAULT 0,
    CONSTRAINT points_player_nonnegative CHECK (user_id IS NULL OR balance_minor >= 0),
    CONSTRAINT points_user_currency UNIQUE (user_id, currency_code)
);

CREATE TABLE IF NOT EXISTS points_quotes (
    id uuid PRIMARY KEY,
    user_id text NOT NULL,
    selection jsonb NOT NULL,
    odds numeric(12,4) NOT NULL CHECK (odds > 1),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS points_bets (
    id uuid PRIMARY KEY,
    user_id text NOT NULL,
    idempotency_key text NOT NULL,
    quote_id uuid NOT NULL UNIQUE REFERENCES points_quotes(id),
    selection jsonb NOT NULL,
    stake_minor bigint NOT NULL CHECK (stake_minor > 0),
    potential_payout_minor bigint NOT NULL CHECK (potential_payout_minor >= 0),
    balance_after_minor bigint NOT NULL CHECK (balance_after_minor >= 0),
    odds numeric(12,4) NOT NULL,
    status text NOT NULL DEFAULT 'ACCEPTED',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS points_liabilities (
    selection_id text PRIMARY KEY,
    liability_minor bigint NOT NULL DEFAULT 0 CHECK (liability_minor >= 0)
);

CREATE TABLE IF NOT EXISTS points_journals (
    id uuid PRIMARY KEY,
    kind text NOT NULL,
    reference_id text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS points_journal_lines (
    id uuid PRIMARY KEY,
    journal_id uuid NOT NULL REFERENCES points_journals(id),
    account_key text NOT NULL REFERENCES points_accounts(account_key),
    delta_minor bigint NOT NULL CHECK (delta_minor <> 0)
);

CREATE TABLE IF NOT EXISTS points_admin_adjustments (
    user_id text NOT NULL,
    idempotency_key text NOT NULL,
    delta_minor bigint NOT NULL CHECK (delta_minor <> 0),
    balance_after_minor bigint NOT NULL CHECK (balance_after_minor >= 0),
    journal_id uuid NOT NULL UNIQUE REFERENCES points_journals(id),
    PRIMARY KEY (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS points_journal_lines_account_idx ON points_journal_lines(account_key);
CREATE INDEX IF NOT EXISTS points_bets_user_idx ON points_bets(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS points_outbox (
    id uuid PRIMARY KEY,
    event_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz
);
