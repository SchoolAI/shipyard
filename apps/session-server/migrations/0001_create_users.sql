-- Shipyard user identity tables
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE linked_identities (
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider_username TEXT,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_id)
);

CREATE INDEX idx_identities_user ON linked_identities(user_id);

-- Device flow state (ephemeral)
CREATE TABLE pending_devices (
  device_code TEXT PRIMARY KEY,
  user_code TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  authorized_user_id TEXT REFERENCES users(id),
  authorized_at INTEGER
);

CREATE INDEX idx_devices_user_code ON pending_devices(user_code);
CREATE INDEX idx_devices_expires ON pending_devices(expires_at);
