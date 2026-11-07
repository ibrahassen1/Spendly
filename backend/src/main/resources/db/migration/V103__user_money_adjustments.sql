-- Add account-scoped manual money adjustments without touching shared legacy tables.
CREATE TABLE user_money_adjustments (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL REFERENCES user_safe_balances(user_id),
    request_id VARCHAR(100) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_money_adjustment_request UNIQUE(user_id,request_id),
    CONSTRAINT ck_user_money_adjustment_nonzero CHECK (amount <> 0)
);
CREATE INDEX idx_user_money_adjustments_history
    ON user_money_adjustments(user_id,created_at DESC,id DESC);
