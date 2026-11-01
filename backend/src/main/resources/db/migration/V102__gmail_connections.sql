CREATE TABLE gmail_oauth_states (
 state_hash VARCHAR(64) PRIMARY KEY,
 user_id VARCHAR(255) NOT NULL,
 expires_at TIMESTAMP NOT NULL
);
CREATE TABLE gmail_connections (
 user_id VARCHAR(255) PRIMARY KEY,
 email VARCHAR(320),
 encrypted_refresh_token TEXT NOT NULL,
 connected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
