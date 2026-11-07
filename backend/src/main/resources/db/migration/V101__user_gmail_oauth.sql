-- Isolated from legacy shared gmail_credentials and financial tables.
CREATE TABLE user_gmail_oauth_states (
 state_hash VARCHAR(64) PRIMARY KEY,
 user_id VARCHAR(255) NOT NULL,
 expires_at TIMESTAMP NOT NULL
);
CREATE TABLE user_gmail_connections (
 user_id VARCHAR(255) PRIMARY KEY,
 encrypted_refresh_token TEXT NOT NULL,
 connected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
