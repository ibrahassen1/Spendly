-- Private planner state and idempotent paycheck credits.
CREATE TABLE account_planners (
 user_id VARCHAR(255) PRIMARY KEY,
 planner_json TEXT NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE account_paycheck_credits (
 user_id VARCHAR(255) NOT NULL,
 period_id VARCHAR(255) NOT NULL,
 paycheck NUMERIC(12,2) NOT NULL CHECK (paycheck >= 0),
 safe_credit NUMERIC(12,2) NOT NULL CHECK (safe_credit >= 0),
 paycheck_date DATE NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(user_id, period_id)
);
