CREATE TABLE money_adjustments (
    id BIGSERIAL PRIMARY KEY,
    amount NUMERIC(12, 2) NOT NULL,
    adjustment_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_money_adjustments_date
    ON money_adjustments(adjustment_date);
