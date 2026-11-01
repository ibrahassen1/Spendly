-- Per-account Gmail import cutoff, independent of paycheck/budget history.
CREATE TABLE IF NOT EXISTS user_gmail_tracking_settings (
  user_id VARCHAR(255) PRIMARY KEY REFERENCES user_safe_balances(user_id) ON DELETE CASCADE,
  tracking_start_date DATE NOT NULL
);
