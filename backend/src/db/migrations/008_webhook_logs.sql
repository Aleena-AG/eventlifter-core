CREATE TABLE IF NOT EXISTS webhook_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  channel VARCHAR(64) NOT NULL,
  method VARCHAR(16) NOT NULL DEFAULT 'POST',
  path VARCHAR(255) NOT NULL DEFAULT '',
  status_code INT NOT NULL,
  outcome VARCHAR(64) NULL,
  payload_json JSON NOT NULL,
  headers_json JSON NULL,
  response_json JSON NULL,
  error_message TEXT NULL,
  duration_ms INT NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_webhook_logs_channel_created (channel, created_at DESC),
  INDEX idx_webhook_logs_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
