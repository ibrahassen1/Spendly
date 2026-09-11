ALTER TABLE email_alert_transactions
ADD COLUMN source_bank VARCHAR(50) NOT NULL DEFAULT 'WELLS_FARGO';
