-- Restricted points pilot: durable identity, protection, markets, and commitments.
CREATE TABLE IF NOT EXISTS points_users (
  id text PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('PLAYER','TRADER','RISK_MANAGER','ADMINISTRATOR')),
  daily_wager_limit_minor bigint NOT NULL DEFAULT 100000 CHECK (daily_wager_limit_minor > 0),
  excluded_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS points_sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES points_users(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS points_daily_wagers (
  user_id text NOT NULL REFERENCES points_users(id),
  day date NOT NULL,
  wager_minor bigint NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, day)
);
CREATE TABLE IF NOT EXISTS points_fixture_states (
  fixture_id text PRIMARY KEY,
  version bigint NOT NULL,
  snapshot jsonb NOT NULL,
  frozen boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS points_pilot_control (
  id integer PRIMARY KEY CHECK (id = 1),
  frozen boolean NOT NULL DEFAULT false
);
INSERT INTO points_pilot_control(id) VALUES(1) ON CONFLICT DO NOTHING;
ALTER TABLE points_quotes ADD COLUMN IF NOT EXISTS fixture_version bigint;
CREATE TABLE IF NOT EXISTS points_result_requests (
  idempotency_key text PRIMARY KEY,
  request jsonb NOT NULL,
  response jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS points_roulette_commitments (
  id uuid PRIMARY KEY,
  user_id text NOT NULL REFERENCES points_users(id),
  idempotency_key text NOT NULL,
  seed_ciphertext text NOT NULL,
  seed_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,idempotency_key)
);
ALTER TABLE points_casino_rounds ADD COLUMN IF NOT EXISTS request_hash text;
CREATE TABLE IF NOT EXISTS points_notifications (
  id uuid PRIMARY KEY REFERENCES points_outbox(id),
  user_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS points_notifications_user_idx ON points_notifications(user_id, created_at DESC);
