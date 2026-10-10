-- ============================================================================
-- xBET Modern Platform - Initial Seed Data (001)
-- ============================================================================

-- 1. Currencies
INSERT INTO currencies (code, name, symbol, exchange_rate_to_usd, decimals, is_active) VALUES
('USD', 'US Dollar', '$', 1.00000000, 2, TRUE),
('EUR', 'Euro', '€', 1.08500000, 2, TRUE),
('GBP', 'British Pound', '£', 1.27000000, 2, TRUE),
('BRL', 'Brazilian Real', 'R$', 0.19000000, 2, TRUE),
('TRY', 'Turkish Lira', '₺', 0.03000000, 2, TRUE)
ON CONFLICT (code) DO NOTHING;

-- 2. System Ledger Accounts (House Margin, Escrow, Payment Clearing)
INSERT INTO ledger_accounts (id, user_id, account_type, currency_code, name, is_active) VALUES
('00000000-0000-0000-0000-000000000001', NULL, 'HOUSE_MARGIN', 'USD', 'House Margin Account (USD)', TRUE),
('00000000-0000-0000-0000-000000000002', NULL, 'HOUSE_MARGIN', 'EUR', 'House Margin Account (EUR)', TRUE),
('00000000-0000-0000-0000-000000000003', NULL, 'HOUSE_ESCROW', 'USD', 'Sportsbook & Casino Escrow (USD)', TRUE),
('00000000-0000-0000-0000-000000000004', NULL, 'HOUSE_ESCROW', 'EUR', 'Sportsbook & Casino Escrow (EUR)', TRUE),
('00000000-0000-0000-0000-000000000005', NULL, 'PAYMENT_CLEARING', 'USD', 'Payment Gateway Clearing (USD)', TRUE),
('00000000-0000-0000-0000-000000000006', NULL, 'PAYMENT_CLEARING', 'EUR', 'Payment Gateway Clearing (EUR)', TRUE)
ON CONFLICT DO NOTHING;

-- 3. Super Admin & Demo Player Users
-- Password for all seed users is 'Password123!' (Argon2id hash placeholder)
INSERT INTO users (id, username, email, password_hash, role, status, preferred_currency_code, preferred_language, odds_format) VALUES
('11111111-1111-1111-1111-111111111111', 'superadmin', 'admin@xbetplatform.local', '$argon2id$v=19$m=65536,t=3,p=4$4qWn+K3kRj...$placeholder_hash', 'SUPER_ADMIN', 'ACTIVE', 'USD', 'en', 'DECIMAL'),
('22222222-2222-2222-2222-222222222222', 'riskmanager', 'risk@xbetplatform.local', '$argon2id$v=19$m=65536,t=3,p=4$4qWn+K3kRj...$placeholder_hash', 'RISK_MANAGER', 'ACTIVE', 'USD', 'en', 'DECIMAL'),
('33333333-3333-3333-3333-333333333333', 'demoplayer', 'player@xbetplatform.local', '$argon2id$v=19$m=65536,t=3,p=4$4qWn+K3kRj...$placeholder_hash', 'PLAYER', 'ACTIVE', 'USD', 'en', 'DECIMAL')
ON CONFLICT DO NOTHING;

INSERT INTO user_profiles (user_id, first_name, last_name, date_of_birth, country_code, city, kyc_verified, kyc_level) VALUES
('11111111-1111-1111-1111-111111111111', 'System', 'Administrator', '1990-01-01', 'GB', 'London', TRUE, 3),
('22222222-2222-2222-2222-222222222222', 'Head', 'RiskOfficer', '1988-05-12', 'GB', 'London', TRUE, 3),
('33333333-3333-3333-3333-333333333333', 'John', 'Doe', '1995-07-20', 'GB', 'Manchester', TRUE, 1)
ON CONFLICT DO NOTHING;

-- Create Player Ledger Accounts for Demo Player
INSERT INTO ledger_accounts (id, user_id, account_type, currency_code, name, is_active) VALUES
('33333333-3333-3333-3333-000000000001', '33333333-3333-3333-3333-333333333333', 'PLAYER_MAIN', 'USD', 'John Doe Main Wallet (USD)', TRUE),
('33333333-3333-3333-3333-000000000002', '33333333-3333-3333-3333-333333333333', 'PLAYER_BONUS', 'USD', 'John Doe Bonus Wallet (USD)', TRUE)
ON CONFLICT DO NOTHING;

-- Initial Demo Deposit for Player: $1,000.00
-- Double-entry: Debit Payment Clearing, Credit Player Main Account
INSERT INTO journal_entries (id, transaction_type, reference_id, reference_type, description) VALUES
('aaaa1111-bbbb-cccc-dddd-eeee00000001', 'DEPOSIT', 'DEP-DEMO-001', 'INITIAL_CREDIT', 'Initial Demo Player Balance Credit')
ON CONFLICT DO NOTHING;

INSERT INTO transactions (journal_entry_id, account_id, direction, amount, currency_code) VALUES
('aaaa1111-bbbb-cccc-dddd-eeee00000001', '00000000-0000-0000-0000-000000000005', 'DEBIT', 1000.0000, 'USD'),
('aaaa1111-bbbb-cccc-dddd-eeee00000001', '33333333-3333-3333-3333-000000000001', 'CREDIT', 1000.0000, 'USD')
ON CONFLICT DO NOTHING;

-- 4. Sports, Categories & Tournaments
INSERT INTO sports (id, external_id, slug, name, icon_name, sort_order) VALUES
(1, 'sr:sport:1', 'soccer', 'Soccer', 'futbol', 1),
(2, 'sr:sport:2', 'basketball', 'Basketball', 'basketball-ball', 2),
(3, 'sr:sport:5', 'tennis', 'Tennis', 'table-tennis', 3),
(4, 'sr:sport:12', 'ice-hockey', 'Ice Hockey', 'hockey-puck', 4),
(5, 'sr:sport:23', 'volleyball', 'Volleyball', 'volleyball-ball', 5),
(6, 'sr:sport:4', 'american-football', 'American Football', 'football-ball', 6)
ON CONFLICT (id) DO NOTHING;

INSERT INTO categories (id, external_id, slug, name, country_code, sport_id, sort_order) VALUES
(1, 'sr:category:1', 'england', 'England', 'ENG', 1, 1),
(2, 'sr:category:2', 'spain', 'Spain', 'ESP', 1, 2),
(3, 'sr:category:3', 'international-clubs', 'International Clubs', 'INT', 1, 3),
(4, 'sr:category:4', 'usa', 'USA', 'USA', 2, 1),
(5, 'sr:category:5', 'atp', 'ATP Tour', 'INT', 3, 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO tournaments (id, external_id, category_id, slug, name, is_featured, sort_order) VALUES
(1, 'sr:tournament:17', 1, 'premier-league', 'Premier League', TRUE, 1),
(2, 'sr:tournament:8', 2, 'la-liga', 'LaLiga', TRUE, 2),
(3, 'sr:tournament:7', 3, 'uefa-champions-league', 'UEFA Champions League', TRUE, 3),
(4, 'sr:tournament:132', 4, 'nba', 'NBA', TRUE, 1),
(5, 'sr:tournament:200', 5, 'wimbledon', 'Wimbledon Singles', TRUE, 1)
ON CONFLICT (id) DO NOTHING;

-- Reset sequence IDs
SELECT setval('sports_id_seq', (SELECT MAX(id) FROM sports));
SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));
SELECT setval('tournaments_id_seq', (SELECT MAX(id) FROM tournaments));

-- 5. Casino Providers & Games (Catalog ported from existing project)
INSERT INTO casino_providers (id, code, name, is_active) VALUES
(1, 'internal_rgs', 'In-House Proprietary RGS', TRUE),
(2, 'studio_two', 'Live Studio Two', TRUE),
(3, 'studio_one', 'Live Studio One', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO casino_games (id, provider_id, game_code, slug, title, category, rtp_percentage, min_bet, max_bet, is_featured) VALUES
('c0000000-0000-0000-0000-000000000001', 1, 'blackjack_classic', 'blackjack-classic', 'Classic Blackjack', 'BLACKJACK', 99.50, 1.00, 1000.00, TRUE),
('c0000000-0000-0000-0000-000000000002', 1, 'roulette_european', 'roulette-european', 'European Roulette', 'ROULETTE', 97.30, 0.50, 2000.00, TRUE),
('c0000000-0000-0000-0000-000000000003', 1, 'baccarat_pro', 'baccarat-pro', 'Baccarat Professional', 'BACCARAT', 98.94, 1.00, 1500.00, TRUE),
('c0000000-0000-0000-0000-000000000004', 1, 'highlow_card', 'high-low', 'High-Low Cards', 'TABLE_GAME', 96.50, 0.20, 500.00, FALSE),
('c0000000-0000-0000-0000-000000000005', 1, 'stud_poker', 'stud-poker', 'Caribbean Stud Poker', 'POKER', 97.80, 1.00, 500.00, FALSE),
('c0000000-0000-0000-0000-000000000006', 1, 'slot_chicken', 'slot-chicken', 'Crazy Chicken Slot', 'SLOT', 96.20, 0.10, 200.00, TRUE),
('c0000000-0000-0000-0000-000000000007', 1, 'slot_fruits', 'slot-fruits', 'Fruit Party Bonanza', 'SLOT', 96.50, 0.10, 200.00, TRUE),
('c0000000-0000-0000-0000-000000000008', 1, 'greyhound_racing', 'virtual-greyhound', 'Virtual Greyhound Racing', 'VIRTUAL_SPORTS', 95.00, 0.50, 1000.00, TRUE),
('c0000000-0000-0000-0000-000000000009', 1, 'horse_racing', 'virtual-horse-racing', 'Virtual Horse Racing', 'VIRTUAL_SPORTS', 95.00, 0.50, 1000.00, TRUE)
ON CONFLICT (id) DO NOTHING;

SELECT setval('casino_providers_id_seq', (SELECT MAX(id) FROM casino_providers));
