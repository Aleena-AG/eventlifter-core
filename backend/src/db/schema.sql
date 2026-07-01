CREATE TABLE IF NOT EXISTS master_events (
  id VARCHAR(64) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  capacity INT NOT NULL DEFAULT 150,
  sold INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS channel_refs (
  master_id VARCHAR(64) NOT NULL,
  channel ENUM('hightribe', 'luma', 'eventbrite') NOT NULL,
  event_id VARCHAR(128) NOT NULL DEFAULT '',
  ticket_id VARCHAR(128) NULL,
  url VARCHAR(500) NULL,
  PRIMARY KEY (master_id, channel),
  INDEX idx_channel_event (channel, event_id),
  CONSTRAINT fk_channel_refs_master
    FOREIGN KEY (master_id) REFERENCES master_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendees (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  master_id VARCHAR(64) NOT NULL,
  email VARCHAR(320) NOT NULL,
  name VARCHAR(500) NOT NULL,
  source_channel ENUM('hightribe', 'luma', 'eventbrite') NOT NULL,
  registered_at DATETIME(3) NOT NULL,
  UNIQUE KEY uniq_master_email (master_id, email),
  CONSTRAINT fk_attendees_master
    FOREIGN KEY (master_id) REFERENCES master_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  id TINYINT PRIMARY KEY DEFAULT 1,
  settings_json JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(128) PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
