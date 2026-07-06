import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { resolveAppUrl } from './lib/app-url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

dotenv.config({ path: path.join(root, '.env.local') })
dotenv.config({ path: path.join(root, '.env') })

const appUrl = resolveAppUrl()

export const config = {
  port: Number(process.env.BACKEND_PORT || 4000),
  corsOrigin: appUrl,
  appUrl,
  db: {
    host: process.env.CHANNEL_MANAGER_DB_HOST || '',
    port: Number(process.env.CHANNEL_MANAGER_DB_PORT || 3306),
    user: process.env.CHANNEL_MANAGER_DB_USER || '',
    password: process.env.CHANNEL_MANAGER_DB_PASSWORD || '',
    database: process.env.CHANNEL_MANAGER_DB_NAME || 'channel_manager_db',
  },
  healthToken: process.env.DB_HEALTH_TOKEN || '',
  skipPayment: process.env.EWENTCAST_SKIP_PAYMENT === 'true',
  trialDays: Number(process.env.EWENTCAST_TRIAL_DAYS || 14),
  exposeResetToken: process.env.AUTH_EXPOSE_RESET_TOKEN === 'true' || process.env.NODE_ENV !== 'production',
  sessionDays: Number(process.env.AUTH_SESSION_DAYS || 30),
  resetTokenHours: Number(process.env.AUTH_RESET_TOKEN_HOURS || 2),
  htApiBase: (process.env.HT_API_BASE || 'https://api.hightribe.com').replace(/\/$/, ''),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 2525),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Ewentcast <noreply@ewentcast.com>',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    priceId: process.env.STRIPE_PRICE_ID || '',
    amountUsd: Number(process.env.STRIPE_AMOUNT_USD || 20),
  },
  refundDays: Number(process.env.EWENTCAST_REFUND_DAYS || 14),
}

export function stripeConfigured(): boolean {
  return !!(config.stripe.secretKey && config.stripe.priceId)
}

export function dbConfigured(): boolean {
  return !!(config.db.host && config.db.user && config.db.password && config.db.database)
}

/** Local dev only — never bypasses billing in production. */
export function isDevPaymentBypass(): boolean {
  return config.skipPayment && process.env.NODE_ENV !== 'production'
}
