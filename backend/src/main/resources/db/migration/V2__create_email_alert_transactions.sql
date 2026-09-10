CREATE TABLE email_alert_transactions (
    id BIGSERIAL PRIMARY KEY,
    gmail_message_id VARCHAR(255) NOT NULL UNIQUE,
    merchant VARCHAR(255),
    amount NUMERIC(12, 2) NOT NULL,
    card_last4 VARCHAR(4),
    transaction_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'TEMPORARY',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
