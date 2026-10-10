-- ============================================================================
-- Ledger & Sportsbook/Casino Transaction Integrity Simulation Test
-- ============================================================================

BEGIN;

-- 1. Create a Test Player
INSERT INTO users (id, username, email, password_hash, role, status, preferred_currency_code)
VALUES ('99999999-9999-9999-9999-999999999999', 'test_bettor', 'bettor@test.local', 'hash_test', 'PLAYER', 'ACTIVE', 'USD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ledger_accounts (id, user_id, account_type, currency_code, name)
VALUES ('99999999-9999-9999-9999-000000000001', '99999999-9999-9999-9999-999999999999', 'PLAYER_MAIN', 'USD', 'Test Bettor Main Wallet')
ON CONFLICT DO NOTHING;

-- 2. Deposit $500.00 (Debit Payment Clearing, Credit Player Main Account)
INSERT INTO journal_entries (id, transaction_type, reference_id, reference_type, description)
VALUES ('e1111111-0000-0000-0000-000000000001', 'DEPOSIT', 'DEP-TEST-001', 'STRIPE_INTENT', 'Player Deposit $500');

INSERT INTO transactions (journal_entry_id, account_id, direction, amount, currency_code)
VALUES 
('e1111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'DEBIT', 500.0000, 'USD'),
('e1111111-0000-0000-0000-000000000001', '99999999-9999-9999-9999-000000000001', 'CREDIT', 500.0000, 'USD');

-- 3. Create a Live Match Fixture (Arsenal vs Chelsea)
INSERT INTO fixtures (id, tournament_id, home_team, away_team, start_time, status, is_in_play, current_score)
VALUES ('f1111111-0000-0000-0000-000000000001', 1, 'Arsenal', 'Chelsea', NOW(), 'LIVE', TRUE, '{"home": 1, "away": 0}');

-- 4. Create Market (Match Winner 1X2) and Selections
INSERT INTO markets (id, fixture_id, market_type, name, status, is_in_play)
VALUES ('m1111111-0000-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000001', 'MATCH_WINNER_1X2', 'Full Time Result', 'ACTIVE', TRUE);

INSERT INTO selections (id, market_id, name, odds, status)
VALUES 
('s1111111-0000-0000-0000-000000000001', 'm1111111-0000-0000-0000-000000000001', 'Arsenal', 2.5000, 'ACTIVE'),
('s1111111-0000-0000-0000-000000000002', 'm1111111-0000-0000-0000-000000000001', 'Draw', 3.4000, 'ACTIVE'),
('s1111111-0000-0000-0000-000000000003', 'm1111111-0000-0000-0000-000000000001', 'Chelsea', 2.9000, 'ACTIVE');

-- 5. Place Bet: $100 on Arsenal @ 2.50
INSERT INTO bet_slips (id, slip_number, user_id, bet_type, status, currency_code, stake_amount, total_odds, potential_payout, is_in_play)
VALUES ('b1111111-0000-0000-0000-000000000001', 'SLIP-2026-0001', '99999999-9999-9999-9999-999999999999', 'SINGLE', 'ACCEPTED', 'USD', 100.0000, 2.5000, 250.0000, TRUE);

INSERT INTO bet_legs (id, bet_slip_id, selection_id, fixture_id, market_id, locked_odds, fixture_name_snapshot, market_name_snapshot, selection_name_snapshot)
VALUES ('l1111111-0000-0000-0000-000000000001', 'b1111111-0000-0000-0000-000000000001', 's1111111-0000-0000-0000-000000000001', 'f1111111-0000-0000-0000-000000000001', 'm1111111-0000-0000-0000-000000000001', 2.5000, 'Arsenal vs Chelsea', 'Full Time Result', 'Arsenal');

-- Debit Player Main Wallet $100, Credit House Escrow $100
INSERT INTO journal_entries (id, transaction_type, reference_id, reference_type, description)
VALUES ('e1111111-0000-0000-0000-000000000002', 'BET_STAKE', 'b1111111-0000-0000-0000-000000000001', 'BET_SLIP', 'Placed Bet $100 on Arsenal @ 2.50');

INSERT INTO transactions (journal_entry_id, account_id, direction, amount, currency_code)
VALUES 
('e1111111-0000-0000-0000-000000000002', '99999999-9999-9999-9999-000000000001', 'DEBIT', 100.0000, 'USD'),
('e1111111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', 'CREDIT', 100.0000, 'USD');

-- 6. Match Finished: Arsenal wins! Settle Bet Slip (Payout = $250.00)
UPDATE bet_slips SET status = 'WON', actual_payout = 250.0000, settled_at = NOW() WHERE id = 'b1111111-0000-0000-0000-000000000001';
UPDATE bet_legs SET status = 'WON', settled_at = NOW() WHERE id = 'l1111111-0000-0000-0000-000000000001';
UPDATE selections SET status = 'WON', settled_at = NOW() WHERE id = 's1111111-0000-0000-0000-000000000001';
UPDATE selections SET status = 'LOST', settled_at = NOW() WHERE id IN ('s1111111-0000-0000-0000-000000000002', 's1111111-0000-0000-0000-000000000003');

-- Payout Journal Entry:
-- Debit House Escrow $100 (stake returned), Debit House Margin $150 (house profit loss), Credit Player Wallet $250
INSERT INTO journal_entries (id, transaction_type, reference_id, reference_type, description)
VALUES ('e1111111-0000-0000-0000-000000000003', 'BET_PAYOUT', 'b1111111-0000-0000-0000-000000000001', 'BET_SLIP', 'Winning Bet Payout $250.00');

INSERT INTO transactions (journal_entry_id, account_id, direction, amount, currency_code)
VALUES 
('e1111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000003', 'DEBIT', 100.0000, 'USD'),
('e1111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'DEBIT', 150.0000, 'USD'),
('e1111111-0000-0000-0000-000000000003', '99999999-9999-9999-9999-000000000001', 'CREDIT', 250.0000, 'USD');

-- 7. Casino Wager & Payout: Blackjack $50 bet, Player gets Blackjack (payout 3:2 = $125 total return)
INSERT INTO casino_sessions (id, user_id, game_id, session_token, currency_code)
VALUES ('cs111111-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', 'c0000000-0000-0000-0000-000000000001', 'session_token_xyz', 'USD');

INSERT INTO casino_rounds (id, session_id, round_number, total_wager, total_payout, is_completed, gameState)
VALUES ('cr111111-0000-0000-0000-000000000001', 'cs111111-0000-0000-0000-000000000001', 'RND-BJ-001', 50.0000, 125.0000, TRUE, '{"playerHand": ["As", "Kd"], "dealerHand": ["10h", "7c"], "result": "BLACKJACK"}');

-- Casino Wager Journal Entry: Debit Player $50, Credit Escrow $50
INSERT INTO journal_entries (id, transaction_type, reference_id, reference_type, description)
VALUES ('e1111111-0000-0000-0000-000000000004', 'CASINO_WAGER', 'cr111111-0000-0000-0000-000000000001', 'CASINO_ROUND', 'Blackjack Wager $50');

INSERT INTO transactions (journal_entry_id, account_id, direction, amount, currency_code)
VALUES 
('e1111111-0000-0000-0000-000000000004', '99999999-9999-9999-9999-000000000001', 'DEBIT', 50.0000, 'USD'),
('e1111111-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', 'CREDIT', 50.0000, 'USD');

-- Casino Win Payout Journal Entry: Debit Escrow $50, Debit Margin $75, Credit Player $125
INSERT INTO journal_entries (id, transaction_type, reference_id, reference_type, description)
VALUES ('e1111111-0000-0000-0000-000000000005', 'CASINO_PAYOUT', 'cr111111-0000-0000-0000-000000000001', 'CASINO_ROUND', 'Blackjack Win Payout $125');

INSERT INTO transactions (journal_entry_id, account_id, direction, amount, currency_code)
VALUES 
('e1111111-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000003', 'DEBIT', 50.0000, 'USD'),
('e1111111-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'DEBIT', 75.0000, 'USD'),
('e1111111-0000-0000-0000-000000000005', '99999999-9999-9999-9999-000000000001', 'CREDIT', 125.0000, 'USD');

COMMIT;
