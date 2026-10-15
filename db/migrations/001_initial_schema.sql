-- ============================================================================
-- xBET Modern Platform - Initial PostgreSQL 16 Schema Migration (001)
-- ============================================================================

-- Enable essential extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUM DEFINITIONS
-- ============================================================================

CREATE TYPE user_status_enum AS ENUM (
    'PENDING_VERIFICATION',
    'ACTIVE',
    'SUSPENDED',
    'SELF_EXCLUDED',
    'CLOSED'
);

CREATE TYPE user_role_enum AS ENUM (
    'PLAYER',
    'AGENT',
    'SUPPORT',
    'RISK_MANAGER',
    'ADMINISTRATOR',
    'SUPER_ADMIN'
);

CREATE TYPE account_type_enum AS ENUM (
    'PLAYER_MAIN',
    'PLAYER_BONUS',
    'HOUSE_MARGIN',
    'HOUSE_ESCROW',
    'PAYMENT_CLEARING',
    'AFFILIATE_COMMISSION'
);

CREATE TYPE transaction_type_enum AS ENUM (
    'DEPOSIT',
    'WITHDRAWAL',
    'BET_STAKE',
    'BET_PAYOUT',
    'BET_REFUND',
    'BET_CASHOUT',
    'CASINO_WAGER',
    'CASINO_PAYOUT',
    'CASINO_REFUND',
    'BONUS_GRANT',
    'BONUS_CONVERSION',
    'MANUAL_ADJUSTMENT',
    'AFFILIATE_PAYOUT'
);

CREATE TYPE transaction_direction_enum AS ENUM (
    'DEBIT',
    'CREDIT'
);

CREATE TYPE fixture_status_enum AS ENUM (
    'NOT_STARTED',
    'LIVE',
    'HALF_TIME',
    'EXTRA_TIME',
    'PENALTIES',
    'FINISHED',
    'POSTPONED',
    'CANCELLED',
    'INTERRUPTED',
    'ABANDONED'
);

CREATE TYPE market_status_enum AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'SETTLED',
    'CANCELLED',
    'VOID'
);

CREATE TYPE selection_status_enum AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'WON',
    'LOST',
    'HALF_WON',
    'HALF_LOST',
    'VOID',
    'CANCELLED'
);

CREATE TYPE bet_slip_type_enum AS ENUM (
    'SINGLE',
    'COMBI',
    'SYSTEM'
);

CREATE TYPE bet_slip_status_enum AS ENUM (
    'PENDING',
    'ACCEPTED',
    'REJECTED',
    'WON',
    'LOST',
    'HALF_WON',
    'HALF_LOST',
    'CASHED_OUT',
    'VOID',
    'CANCELLED'
);

CREATE TYPE odds_format_enum AS ENUM (
    'DECIMAL',
    'FRACTIONAL',
    'AMERICAN',
    'HONG_KONG',
    'MALAY',
    'INDONESIAN'
);

CREATE TYPE casino_game_type_enum AS ENUM (
    'TABLE_GAME',
    'SLOT',
    'ROULETTE',
    'BLACKJACK',
    'BACCARAT',
    'POKER',
    'VIRTUAL_SPORTS',
    'LIVE_CASINO',
    'SCRATCH_CARD',
    'KENO',
    'BINGO'
);

-- ============================================================================
-- HELPER FUNCTIONS & TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 1. CURRENCIES & SYSTEM CONFIGURATION
-- ============================================================================

CREATE TABLE currencies (
    code VARCHAR(3) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    symbol VARCHAR(8) NOT NULL,
    exchange_rate_to_usd DECIMAL(18, 8) NOT NULL DEFAULT 1.0,
    decimals SMALLINT NOT NULL DEFAULT 2,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. USERS, PROFILES, ROLES & KYC
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role_enum NOT NULL DEFAULT 'PLAYER',
    status user_status_enum NOT NULL DEFAULT 'ACTIVE',
    preferred_currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code),
    preferred_language VARCHAR(10) NOT NULL DEFAULT 'en',
    odds_format odds_format_enum NOT NULL DEFAULT 'DECIMAL',
    referral_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    two_factor_secret VARCHAR(255),
    two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    registration_ip INET,
    last_login_ip INET,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_referral ON users(referral_user_id);

CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    phone_number VARCHAR(30),
    country_code VARCHAR(2) NOT NULL,
    city VARCHAR(100),
    address_line_1 VARCHAR(255),
    address_line_2 VARCHAR(255),
    postal_code VARCHAR(20),
    kyc_verified BOOLEAN NOT NULL DEFAULT FALSE,
    kyc_level SMALLINT NOT NULL DEFAULT 0,
    daily_deposit_limit DECIMAL(18, 2),
    daily_stake_limit DECIMAL(18, 2),
    self_exclusion_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token ON user_sessions(token_hash);

-- ============================================================================
-- 3. DOUBLE-ENTRY FINANCIAL LEDGER
-- ============================================================================

CREATE TABLE ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
    account_type account_type_enum NOT NULL,
    currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code),
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_account_currency UNIQUE (user_id, account_type, currency_code)
);

CREATE INDEX idx_ledger_accounts_user ON ledger_accounts(user_id);
CREATE INDEX idx_ledger_accounts_type ON ledger_accounts(account_type);

CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_number BIGSERIAL UNIQUE NOT NULL,
    transaction_type transaction_type_enum NOT NULL,
    reference_id VARCHAR(100), -- External ID, BetSlip ID, Casino Round ID, or Payment Intent ID
    reference_type VARCHAR(50),
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_journal_entries_ref ON journal_entries(reference_type, reference_id);
CREATE INDEX idx_journal_entries_type ON journal_entries(transaction_type);
CREATE INDEX idx_journal_entries_created ON journal_entries(created_at);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
    account_id UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
    direction transaction_direction_enum NOT NULL,
    amount DECIMAL(18, 4) NOT NULL CHECK (amount > 0),
    currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_entry ON transactions(journal_entry_id);

-- View to compute live ledger balances safely
CREATE OR REPLACE VIEW account_balances_view AS
SELECT 
    a.id AS account_id,
    a.user_id,
    a.account_type,
    a.currency_code,
    COALESCE(SUM(
        CASE 
            WHEN a.account_type IN ('PLAYER_MAIN', 'PLAYER_BONUS', 'AFFILIATE_COMMISSION') AND t.direction = 'CREDIT' THEN t.amount
            WHEN a.account_type IN ('PLAYER_MAIN', 'PLAYER_BONUS', 'AFFILIATE_COMMISSION') AND t.direction = 'DEBIT' THEN -t.amount
            WHEN a.account_type IN ('HOUSE_MARGIN', 'HOUSE_ESCROW', 'PAYMENT_CLEARING') AND t.direction = 'CREDIT' THEN t.amount
            WHEN a.account_type IN ('HOUSE_MARGIN', 'HOUSE_ESCROW', 'PAYMENT_CLEARING') AND t.direction = 'DEBIT' THEN -t.amount
            ELSE 0
        END
    ), 0) AS balance,
    COUNT(t.id) AS transaction_count,
    MAX(t.created_at) AS last_transaction_at
FROM ledger_accounts a
LEFT JOIN transactions t ON a.id = t.account_id
GROUP BY a.id, a.user_id, a.account_type, a.currency_code;

-- ============================================================================
-- 4. SPORTSBOOK DOMAIN
-- ============================================================================

CREATE TABLE sports (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(100) UNIQUE,
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    icon_name VARCHAR(100),
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    i18n_names JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(100) UNIQUE,
    slug VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    country_code VARCHAR(3),
    flag_url VARCHAR(255),
    sport_id INT NOT NULL REFERENCES sports(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_category_sport_slug UNIQUE (sport_id, slug)
);

CREATE TABLE tournaments (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(100) UNIQUE,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    slug VARCHAR(150) NOT NULL,
    name VARCHAR(150) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    min_stake DECIMAL(18, 2) DEFAULT 0.10,
    max_stake DECIMAL(18, 2) DEFAULT 5000.00,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tournament_category_slug UNIQUE (category_id, slug)
);

CREATE INDEX idx_tournaments_category ON tournaments(category_id);

CREATE TABLE fixtures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(100) UNIQUE,
    tournament_id INT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    home_team VARCHAR(150) NOT NULL,
    away_team VARCHAR(150) NOT NULL,
    home_team_id VARCHAR(100),
    away_team_id VARCHAR(100),
    start_time TIMESTAMPTZ NOT NULL,
    status fixture_status_enum NOT NULL DEFAULT 'NOT_STARTED',
    is_in_play BOOLEAN NOT NULL DEFAULT FALSE,
    current_score JSONB DEFAULT '{"home": 0, "away": 0}',
    period_scores JSONB DEFAULT '[]',
    match_clock VARCHAR(30),
    feed_provider VARCHAR(50) NOT NULL DEFAULT 'OddsFeed',
    last_feed_update TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fixtures_start_time ON fixtures(start_time);
CREATE INDEX idx_fixtures_status ON fixtures(status);
CREATE INDEX idx_fixtures_in_play ON fixtures(is_in_play);
CREATE INDEX idx_fixtures_tournament ON fixtures(tournament_id);

CREATE TABLE markets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(100),
    fixture_id UUID NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
    market_type VARCHAR(100) NOT NULL, -- e.g., 'MATCH_WINNER_1X2', 'TOTAL_OVER_UNDER', 'HANDICAP'
    name VARCHAR(150) NOT NULL,
    line VARCHAR(50), -- e.g., '2.5', '-1.5'
    status market_status_enum NOT NULL DEFAULT 'ACTIVE',
    is_in_play BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT NOT NULL DEFAULT 0,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_fixture_market_line UNIQUE (fixture_id, market_type, line)
);

CREATE INDEX idx_markets_fixture ON markets(fixture_id);
CREATE INDEX idx_markets_status ON markets(status);

CREATE TABLE selections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    external_id VARCHAR(100),
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- e.g., 'Home', 'Draw', 'Away', 'Over', 'Under'
    odds DECIMAL(8, 4) NOT NULL CHECK (odds >= 1.0001),
    previous_odds DECIMAL(8, 4),
    status selection_status_enum NOT NULL DEFAULT 'ACTIVE',
    probability DECIMAL(5, 4),
    sort_order INT NOT NULL DEFAULT 0,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_selections_market ON selections(market_id);
CREATE INDEX idx_selections_status ON selections(status);

CREATE TABLE bet_slips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slip_number VARCHAR(30) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    bet_type bet_slip_type_enum NOT NULL DEFAULT 'SINGLE',
    status bet_slip_status_enum NOT NULL DEFAULT 'PENDING',
    currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code),
    stake_amount DECIMAL(18, 4) NOT NULL CHECK (stake_amount > 0),
    total_odds DECIMAL(12, 4) NOT NULL CHECK (total_odds >= 1.0001),
    potential_payout DECIMAL(18, 4) NOT NULL,
    actual_payout DECIMAL(18, 4) DEFAULT 0,
    cashout_amount DECIMAL(18, 4),
    is_in_play BOOLEAN NOT NULL DEFAULT FALSE,
    placed_ip INET,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bet_slips_user ON bet_slips(user_id);
CREATE INDEX idx_bet_slips_status ON bet_slips(status);
CREATE INDEX idx_bet_slips_created ON bet_slips(created_at);

CREATE TABLE bet_legs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bet_slip_id UUID NOT NULL REFERENCES bet_slips(id) ON DELETE CASCADE,
    selection_id UUID NOT NULL REFERENCES selections(id) ON DELETE RESTRICT,
    fixture_id UUID NOT NULL REFERENCES fixtures(id) ON DELETE RESTRICT,
    market_id UUID NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
    locked_odds DECIMAL(8, 4) NOT NULL,
    status selection_status_enum NOT NULL DEFAULT 'ACTIVE',
    fixture_name_snapshot VARCHAR(255) NOT NULL,
    market_name_snapshot VARCHAR(150) NOT NULL,
    selection_name_snapshot VARCHAR(100) NOT NULL,
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bet_legs_bet_slip ON bet_legs(bet_slip_id);
CREATE INDEX idx_bet_legs_selection ON bet_legs(selection_id);

-- ============================================================================
-- 5. CASINO & VIRTUAL GAMES DOMAIN
-- ============================================================================

CREATE TABLE casino_providers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    api_endpoint VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE casino_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id INT NOT NULL REFERENCES casino_providers(id) ON DELETE CASCADE,
    game_code VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(150) NOT NULL,
    category casino_game_type_enum NOT NULL,
    thumbnail_url VARCHAR(255),
    banner_url VARCHAR(255),
    rtp_percentage DECIMAL(5, 2) NOT NULL DEFAULT 96.00,
    min_bet DECIMAL(18, 2) NOT NULL DEFAULT 0.10,
    max_bet DECIMAL(18, 2) NOT NULL DEFAULT 1000.00,
    has_demo BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_provider_game_code UNIQUE (provider_id, game_code)
);

CREATE INDEX idx_casino_games_category ON casino_games(category);
CREATE INDEX idx_casino_games_active ON casino_games(is_active);

CREATE TABLE casino_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id UUID NOT NULL REFERENCES casino_games(id) ON DELETE RESTRICT,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    currency_code VARCHAR(3) NOT NULL REFERENCES currencies(code),
    ip_address INET,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ
);

CREATE INDEX idx_casino_sessions_user ON casino_sessions(user_id);
CREATE INDEX idx_casino_sessions_token ON casino_sessions(session_token);

CREATE TABLE casino_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES casino_sessions(id) ON DELETE CASCADE,
    round_number VARCHAR(100) NOT NULL,
    server_seed_hash VARCHAR(255),
    server_seed VARCHAR(255),
    client_seed VARCHAR(255),
    nonce BIGINT DEFAULT 0,
    total_wager DECIMAL(18, 4) NOT NULL DEFAULT 0,
    total_payout DECIMAL(18, 4) NOT NULL DEFAULT 0,
    game_state JSONB DEFAULT '{}',
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    CONSTRAINT uq_session_round UNIQUE (session_id, round_number)
);

CREATE INDEX idx_casino_rounds_session ON casino_rounds(session_id);

CREATE TABLE virtual_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL REFERENCES casino_games(id) ON DELETE CASCADE,
    event_number BIGINT NOT NULL,
    name VARCHAR(150) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    duration_seconds INT NOT NULL DEFAULT 180,
    status fixture_status_enum NOT NULL DEFAULT 'NOT_STARTED',
    result_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_virtual_events_start ON virtual_events(start_time);
CREATE INDEX idx_virtual_events_game ON virtual_events(game_id);

-- ============================================================================
-- 6. RISK LIMITS & AUDIT LOGS
-- ============================================================================

CREATE TABLE risk_limits (
    id SERIAL PRIMARY KEY,
    sport_id INT REFERENCES sports(id) ON DELETE CASCADE,
    tournament_id INT REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    max_stake_per_bet DECIMAL(18, 2),
    max_payout_per_bet DECIMAL(18, 2),
    max_market_liability DECIMAL(18, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    target_entity VARCHAR(100) NOT NULL,
    target_id VARCHAR(100) NOT NULL,
    ip_address INET,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ============================================================================
-- 7. ATTACH AUTOMATIC UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER trg_currencies_updated_at BEFORE UPDATE ON currencies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_sports_updated_at BEFORE UPDATE ON sports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_tournaments_updated_at BEFORE UPDATE ON tournaments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_fixtures_updated_at BEFORE UPDATE ON fixtures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_markets_updated_at BEFORE UPDATE ON markets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_selections_updated_at BEFORE UPDATE ON selections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_bet_slips_updated_at BEFORE UPDATE ON bet_slips FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_casino_games_updated_at BEFORE UPDATE ON casino_games FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_virtual_events_updated_at BEFORE UPDATE ON virtual_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
