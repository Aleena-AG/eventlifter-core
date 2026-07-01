-- Repair: tables added to 002 after it was already applied on some databases
CREATE TABLE IF NOT EXISTS ht_connections (
  user_id BIGINT PRIMARY KEY,
  ht_user_id VARCHAR(64) NULL,
  ht_token TEXT NULL,
  connected_at DATETIME(3) NULL,
  CONSTRAINT fk_ht_connections_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_settings (
  user_id BIGINT PRIMARY KEY,
  settings_json JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
