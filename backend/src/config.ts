import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

dotenv.config({ path: path.join(root, '.env.local') })
dotenv.config({ path: path.join(root, '.env') })

export const config = {
  port: Number(process.env.BACKEND_PORT || 4000),
  corsOrigin: process.env.BACKEND_CORS_ORIGIN || 'http://localhost:3000',
  db: {
    host: process.env.CHANNEL_MANAGER_DB_HOST || '',
    port: Number(process.env.CHANNEL_MANAGER_DB_PORT || 3306),
    user: process.env.CHANNEL_MANAGER_DB_USER || '',
    password: process.env.CHANNEL_MANAGER_DB_PASSWORD || '',
    database: process.env.CHANNEL_MANAGER_DB_NAME || 'channel_manager_db',
  },
  healthToken: process.env.DB_HEALTH_TOKEN || '',
  skipPayment: process.env.EWENTCAST_SKIP_PAYMENT === 'true',
  exposeResetToken: process.env.AUTH_EXPOSE_RESET_TOKEN === 'true' || process.env.NODE_ENV !== 'production',
  sessionDays: Number(process.env.AUTH_SESSION_DAYS || 30),
  resetTokenHours: Number(process.env.AUTH_RESET_TOKEN_HOURS || 2),
  htApiBase: (process.env.HT_API_BASE || 'https://api.hightribe.com').replace(/\/$/, ''),
}

export function dbConfigured(): boolean {
  return !!(config.db.host && config.db.user && config.db.password && config.db.database)
}
