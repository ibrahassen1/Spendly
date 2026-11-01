-- Account-specific balances are intentionally separate from legacy shared tables.
-- No legacy financial records are copied or attributed to a Clerk user.
CREATE TABLE user_safe_balances (
 user_id VARCHAR(255) PRIMARY KEY,
 allocation NUMERIC(12,2) NOT NULL,
 start_date DATE NOT NULL
);
CREATE TABLE user_money_adjustments (
 id BIGSERIAL PRIMARY KEY,
 user_id VARCHAR(255) NOT NULL REFERENCES user_safe_balances(user_id),
 amount NUMERIC(12,2) NOT NULL,
 adjustment_date DATE NOT NULL,
 created_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_user_money_adjustments_user_date ON user_money_adjustments(user_id, adjustment_date);
