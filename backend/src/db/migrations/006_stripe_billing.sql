ALTER TABLE subscriptions
  ADD COLUMN stripe_customer_id VARCHAR(255) NULL AFTER current_period_end,
  ADD COLUMN stripe_subscription_id VARCHAR(255) NULL AFTER stripe_customer_id;

CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions (stripe_customer_id);
