CREATE TABLE gmail_transactions (
 user_id VARCHAR(255) NOT NULL,
 gmail_message_id VARCHAR(255) NOT NULL,
 merchant VARCHAR(255) NOT NULL,
 amount NUMERIC(14,2) NOT NULL CHECK(amount > 0),
 transaction_date DATE NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id,gmail_message_id)
);
CREATE INDEX idx_gmail_transactions_user_date ON gmail_transactions(user_id,transaction_date DESC);
