-- Rebuild foundation: preserve the existing production tables and Gmail parser.
-- All new account data is keyed to the verified Clerk JWT subject.
-- Do not migrate shared production records to any user automatically.
CREATE TABLE IF NOT EXISTS account_safe_balances (
    user_id VARCHAR(255) PRIMARY KEY,
    allocation NUMERIC(12,2) NOT NULL DEFAULT 0,
    start_date DATE NOT NULL,
    CONSTRAINT account_safe_balances_nonnegative_start CHECK (allocation >= -9999999999.99)
);

CREATE TABLE IF NOT EXISTS account_gmail_connections (
    user_id VARCHAR(255) PRIMARY KEY,
    encrypted_refresh_token TEXT NOT NULL,
    email TEXT,
    connected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_gmail_oauth_states (
    state_hash CHAR(64) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS account_gmail_transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    gmail_message_id VARCHAR(255) NOT NULL,
    merchant TEXT NOT NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    transaction_date DATE NOT NULL,
    transaction_time TIMESTAMP,
    card_last4 VARCHAR(4),
    source_bank VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'TEMPORARY',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, gmail_message_id)
);

CREATE INDEX IF NOT EXISTS idx_account_gmail_transactions_user_date
    ON account_gmail_transactions(user_id, transaction_date DESC);

CREATE TABLE IF NOT EXISTS account_gmail_tracking_settings (
    user_id VARCHAR(255) PRIMARY KEY,
    tracking_start_date DATE NOT NULL
);
