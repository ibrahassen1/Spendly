CREATE TABLE user_paycheck_credits (
 id BIGSERIAL PRIMARY KEY,
 user_id VARCHAR(255) NOT NULL REFERENCES user_safe_balances(user_id),
 period_id VARCHAR(100) NOT NULL,
 paycheck NUMERIC(12,2) NOT NULL,
 safe_credit NUMERIC(12,2) NOT NULL,
 submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT uq_user_paycheck_period UNIQUE (user_id, period_id)
);
CREATE INDEX idx_user_paycheck_credits_user ON user_paycheck_credits(user_id);
