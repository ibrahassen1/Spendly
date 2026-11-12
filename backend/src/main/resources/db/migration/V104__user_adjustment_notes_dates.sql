-- Append only: preserve existing account balances, paycheck history and adjustments.
ALTER TABLE user_money_adjustments
  ADD COLUMN note VARCHAR(200) NOT NULL DEFAULT 'Manual adjustment',
  ADD COLUMN occurred_on DATE;
UPDATE user_money_adjustments SET occurred_on = created_at::date WHERE occurred_on IS NULL;
ALTER TABLE user_money_adjustments ALTER COLUMN occurred_on SET NOT NULL;
CREATE INDEX idx_user_money_adjustments_occurred
  ON user_money_adjustments(user_id, occurred_on DESC, id DESC);
