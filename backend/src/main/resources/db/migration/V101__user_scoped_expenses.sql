CREATE TABLE user_expenses (
 id BIGSERIAL PRIMARY KEY,
 user_id VARCHAR(255) NOT NULL,
 merchant VARCHAR(200) NOT NULL,
 amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
 expense_date DATE NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_user_expenses_user_date ON user_expenses(user_id, expense_date DESC);
