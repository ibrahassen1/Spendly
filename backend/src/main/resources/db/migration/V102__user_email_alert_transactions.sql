-- Preserve all legacy single-user financial tables and records.
CREATE TABLE user_email_alert_transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    gmail_message_id VARCHAR(255) NOT NULL,
    merchant VARCHAR(255),
    amount NUMERIC(12,2) NOT NULL,
    card_last4 VARCHAR(4),
    transaction_date DATE NOT NULL,
    transaction_time TIMESTAMP,
    source_bank VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'TEMPORARY',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_gmail_message UNIQUE(user_id, gmail_message_id)
);
CREATE INDEX idx_user_email_alert_period
    ON user_email_alert_transactions(user_id, transaction_date, status);
