ALTER TABLE user_paycheck_credits ADD COLUMN paycheck_date DATE;
UPDATE user_paycheck_credits SET paycheck_date = created_at::date WHERE paycheck_date IS NULL;
