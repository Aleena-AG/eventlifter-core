import { getPool, query } from '../db/pool'
import { config } from '../config'
import {
  createSession,
  getAccountView,
  type AccountView,
  type UserView,
} from './auth'
import { hashPassword, newToken } from '../lib/crypto'
import { purgeChannelData } from './channel-data'

interface HtLoginResponse {
  status?: boolean
  token?: string
  message?: string
  user?: { id?: number | string; name?: string; email?: string }
}

async function loginToHightribeApi(
  email: string,
  password: string,
): Promise<{ htToken: string; htUserId: string; htEmail: string; htName: string }> {
  const res = await fetch(`${config.htApiBase}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  })

  const data = await res.json() as HtLoginResponse
  if (!res.ok || !data.status || !data.token) {
    throw new Error(data.message || 'Invalid HighTribe credentials.')
  }

  const htUserId = String(data.user?.id ?? '')
  const htToken = data.token.startsWith('Bearer ') ? data.token.slice(7) : data.token
  const htEmail = (data.user?.email || email).trim().toLowerCase()
  const htName = (data.user?.name || htEmail.split('@')[0] || 'User').trim()

  return { htToken, htUserId, htEmail, htName }
}

async function upsertHtConnection(userId: number, htUserId: string, htToken: string): Promise<void> {
  await getPool().query(
    `INSERT INTO ht_connections (user_id, ht_user_id, ht_token, connected_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       ht_user_id = VALUES(ht_user_id),
       ht_token = VALUES(ht_token),
       connected_at = VALUES(connected_at)`,
    [userId, htUserId, htToken, new Date()],
  )
}

async function ensureUserSubscription(userId: number): Promise<void> {
  const now = new Date()
  const existing = await query<{ user_id: number }[]>(
    'SELECT user_id FROM subscriptions WHERE user_id = ? LIMIT 1',
    [userId],
  )
  if (existing.length > 0) return

  const status = 'trialing'
  const trialEnd = new Date()
  trialEnd.setDate(trialEnd.getDate() + config.trialDays)
  await getPool().query(
    `INSERT INTO subscriptions (user_id, plan, status, trial_ends_at, created_at, updated_at)
     VALUES (?, 'pro_monthly_20', ?, ?, ?, ?)`,
    [userId, status, trialEnd, now, now],
  )
}

/** Sign in with HighTribe — creates local user/session so events can be saved to MySQL. */
export async function loginHightribeAccount(
  email: string,
  password: string,
): Promise<{ token: string; user: UserView; account: AccountView; ht_link_token: string }> {
  const { htToken, htUserId, htEmail, htName } = await loginToHightribeApi(email, password)
  const pool = getPool()
  const now = new Date()

  const existing = await query<{ id: number; auth_source: string }[]>(
    'SELECT id, auth_source FROM users WHERE email = ? LIMIT 1',
    [htEmail],
  )
  let userId: number

  if (existing[0]) {
    userId = existing[0].id
    await pool.query(
      `UPDATE users SET name = ?, auth_source = 'hightribe', ht_user_id = ?, updated_at = ? WHERE id = ?`,
      [htName, htUserId, now, userId],
    )
  } else {
    const passwordHash = hashPassword(newToken())
    const [result] = await pool.query<{ insertId: number }>(
      `INSERT INTO users (email, name, password_hash, auth_source, ht_user_id, created_at, updated_at)
       VALUES (?, ?, ?, 'hightribe', ?, ?, ?)`,
      [htEmail, htName, passwordHash, htUserId, now, now],
    )
    userId = (result as unknown as { insertId: number }).insertId
  }

  await ensureUserSubscription(userId)
  await upsertHtConnection(userId, htUserId, htToken)

  const token = await createSession(userId)
  const user: UserView = { id: userId, name: htName, email: htEmail }

  return {
    token,
    user,
    account: await getAccountView(userId),
    ht_link_token: htToken,
  }
}

export async function connectHightribeAccount(
  userId: number,
  email: string,
  password: string,
): Promise<{ account: AccountView; ht_link_token: string }> {
  const account = await getAccountView(userId)
  if (!account.subscription_active) {
    throw new Error('Active Ewentcast subscription required before connecting HighTribe.')
  }

  const { htToken, htUserId } = await loginToHightribeApi(email, password)
  await upsertHtConnection(userId, htUserId, htToken)

  return {
    account: await getAccountView(userId),
    ht_link_token: htToken,
  }
}

export async function disconnectHightribeAccount(userId: number): Promise<AccountView> {
  await purgeChannelData(userId, 'hightribe')
  await getPool().query('DELETE FROM ht_connections WHERE user_id = ?', [userId])
  return getAccountView(userId)
}
