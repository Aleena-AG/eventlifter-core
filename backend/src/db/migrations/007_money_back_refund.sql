ALTER TABLE subscriptions
  ADD COLUMN money_back_refunded_at DATETIME(3) NULL AFTER stripe_subscription_id;
