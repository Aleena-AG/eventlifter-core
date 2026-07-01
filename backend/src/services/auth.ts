import type { RowDataPacket } from 'mysql2'
import { config } from '../config.js'
import { getPool, query } from '../db/pool.js'
import { hashPassword, newToken, verifyPassword } from '../lib/crypto.js'
import { isEmailConfigured, sendPasswordResetEmail } from './email.js'

export interface UserRow extends RowDataPacket {
  id: number
  email: string
  name: string
  password_hash: string
  auth_source: 'local' | 'hightribe'
  ht_user_id: string | null
}

export interface AccountView {
  auth_source: 'ewentcast_signup' | 'hightribe_native'
  subscription_plan: string
  subscription_status: string
  subscription_active: boolean
  subscription_amount_usd: number
  ht_connected: boolean
  linked_ht_user_id: number | null
  ht_connected_at: string | null
}

export interface UserView {
  id: number
  name: string
  email: string
}

function sessionExpiry(): Date {
  const d = new Date()
  d.setDate(d.getDate() + config.sessionDays)
  return d
}

function resetExpiry(): Date {
  const d = new Date()
  d.setHours(d.getHours() + config.resetTokenHours)
  return d
}

export async function getAccountView(userId: number): Promise<AccountView> {
  const subs = await query<RowDataPacket[]>(
    'SELECT plan, status, trial_ends_at, current_period_end FROM subscriptions WHERE user_id = ? LIMIT 1',
    [userId],
  )
  const ht = await query<RowDataPacket[]>(
    'SELECT ht_user_id, connected_at FROM ht_connections WHERE user_id = ? LIMIT 1',
    [userId],
  )
  const users = await query<UserRow[]>(
    'SELECT auth_source FROM users WHERE id = ? LIMIT 1',
    [userId],
  )

  const sub = subs[0]
  const htRow = ht[0]
  const authSource: AccountView['auth_source'] =
    users[0]?.auth_source === 'hightribe' ? 'hightribe_native' : 'ewentcast_signup'
  const status = (sub?.status as string) || 'trialing'
  const active = config.skipPayment || status === 'active' || status === 'trialing'

  return {
    auth_source: authSource,
    subscription_plan: (sub?.plan as string) || 'pro_monthly_20',
    subscription_status: status,
    subscription_active: active,
    subscription_amount_usd: 20,
    ht_connected: !!htRow?.ht_user_id,
    linked_ht_user_id: htRow?.ht_user_id ? Number(htRow.ht_user_id) : null,
    ht_connected_at: htRow?.connected_at
      ? new Date(htRow.connected_at as Date).toISOString()
      : null,
  }
}

export async function createSession(userId: number): Promise<string> {
  const token = newToken()
  const expiresAt = sessionExpiry()
  await getPool().query(
    'INSERT INTO sessions (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [userId, token, expiresAt, new Date()],
  )
  return token
}

export async function deleteSession(token: string): Promise<void> {
  await getPool().query('DELETE FROM sessions WHERE token = ?', [token])
}

export async function resolveSession(token: string): Promise<UserRow | null> {
  const clean = token.startsWith('Bearer ') ? token.slice(7) : token
  const rows = await query<UserRow[]>(
    `SELECT u.id, u.email, u.name, u.password_hash, u.auth_source, u.ht_user_id
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?
     LIMIT 1`,
    [clean, new Date()],
  )
  return rows[0] || null
}

export async function registerUser(input: {
  name: string
  email: string
  password: string
}): Promise<{ token: string; user: UserView; account: AccountView }> {
  const email = input.email.trim().toLowerCase()
  const existing = await query<{ id: number }[]>(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [email],
  )
  if (existing.length > 0) {
    throw new Error('An account with this email already exists')
  }

  const now = new Date()
  const passwordHash = hashPassword(input.password)
  const trialEnd = new Date()
  trialEnd.setDate(trialEnd.getDate() + 14)

  const pool = getPool()
  const [result] = await pool.query<{ insertId: number }>(
    `INSERT INTO users (email, name, password_hash, auth_source, created_at, updated_at)
     VALUES (?, ?, ?, 'local', ?, ?)`,
    [email, input.name.trim(), passwordHash, now, now],
  )
  const userId = (result as unknown as { insertId: number }).insertId

  const status = config.skipPayment ? 'active' : 'trialing'
  await pool.query(
    `INSERT INTO subscriptions (user_id, plan, status, trial_ends_at, created_at, updated_at)
     VALUES (?, 'pro_monthly_20', ?, ?, ?, ?)`,
    [userId, status, trialEnd, now, now],
  )

  const token = await createSession(userId)
  const user: UserView = { id: userId, name: input.name.trim(), email }
  const account = await getAccountView(userId)
  return { token, user, account }
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ token: string; user: UserView; account: AccountView }> {
  const rows = await query<UserRow[]>(
    'SELECT id, email, name, password_hash, auth_source, ht_user_id FROM users WHERE email = ? LIMIT 1',
    [email.trim().toLowerCase()],
  )
  const user = rows[0]
  if (!user || !verifyPassword(password, user.password_hash)) {
    throw new Error('Invalid email or password')
  }

  const token = await createSession(user.id)
  return {
    token,
    user: { id: user.id, name: user.name, email: user.email },
    account: await getAccountView(user.id),
  }
}

export async function requestPasswordReset(email: string): Promise<{
  ok: boolean
  emailed?: boolean
  resetToken?: string
  resetUrl?: string
}> {
  const rows = await query<UserRow[]>(
    'SELECT id, email, name FROM users WHERE email = ? LIMIT 1',
    [email.trim().toLowerCase()],
  )
  if (!rows[0]) {
    return { ok: true }
  }

  const user = rows[0]
  const token = newToken()
  const expiresAt = resetExpiry()
  const pool = getPool()

  await pool.query(
    'DELETE FROM password_reset_tokens WHERE user_id = ? AND used_at IS NULL',
    [user.id],
  )
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
    [user.id, token, expiresAt, new Date()],
  )

  const resetUrl = `${config.appUrl}/reset-password?token=${token}`

  if (isEmailConfigured()) {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
    })
    return { ok: true, emailed: true }
  }

  if (config.exposeResetToken) {
    return {
      ok: true,
      resetToken: token,
      resetUrl,
    }
  }

  console.warn('[requestPasswordReset] SMTP not configured and AUTH_EXPOSE_RESET_TOKEN is false — email not sent')
  return { ok: true }
}

export async function resetPassword(token: string, password: string): Promise<void> {
  if (password.length < 8) throw new Error('Password must be at least 8 characters')

  const rows = await query<RowDataPacket[]>(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token = ? AND used_at IS NULL AND expires_at > ?
     LIMIT 1`,
    [token, new Date()],
  )
  const row = rows[0]
  if (!row) throw new Error('Invalid or expired reset link')

  const passwordHash = hashPassword(password)
  const pool = getPool()
  await pool.query('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
    passwordHash,
    new Date(),
    row.user_id,
  ])
  await pool.query('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?', [
    new Date(),
    row.id,
  ])
  await pool.query('DELETE FROM sessions WHERE user_id = ?', [row.user_id])
}

export async function getMe(token: string): Promise<{
  user: UserView
  account: AccountView
  ht_link_token: string | null
} | null> {
  const user = await resolveSession(token)
  if (!user) return null

  const ht = await query<RowDataPacket[]>(
    'SELECT ht_token FROM ht_connections WHERE user_id = ? LIMIT 1',
    [user.id],
  )

  return {
    user: { id: user.id, name: user.name, email: user.email },
    account: await getAccountView(user.id),
    ht_link_token: (ht[0]?.ht_token as string) || null,
  }
}
