-- Account-scoped planner snapshots. Existing shared financial records are NOT migrated.
CREATE TABLE IF NOT EXISTS user_planners (
    user_id VARCHAR(255) PRIMARY KEY,
    planner_json TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
