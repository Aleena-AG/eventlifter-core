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

type HtProfile = { htToken: string; htUserId: string; htEmail: string; htName: string }

function normalizeHtToken(raw: string): string {
  return raw.startsWith('Bearer ') ? raw.slice(7) : raw
}

function parseHtUserPayload(
  data: Record<string, unknown>,
  fallbackEmail?: string,
): { htUserId: string; htEmail: string; htName: string } {
  const user = (data.user && typeof data.user === 'object' ? data.user : data) as Record<string, unknown>
  const htUserId = String(user.id ?? '')
  const htEmail = String(user.email || fallbackEmail || '')
    .trim()
    .toLowerCase()
  const htName = String(user.name || htEmail.split('@')[0] || 'User').trim()
  return { htUserId, htEmail, htName }
}

async function loginToHightribeApi(email: string, password: string): Promise<HtProfile> {
  const res = await fetch(`${config.htApiBase}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  })

  const data = await res.json() as HtLoginResponse
  if (!res.ok || !data.status || !data.token) {
    throw new Error(data.message || 'Invalid HighTribe credentials.')
  }

  const htToken = normalizeHtToken(data.token)
  const { htUserId, htEmail, htName } = parseHtUserPayload(
    (data.user ? { user: data.user } : {}) as Record<string, unknown>,
    email,
  )

  return { htToken, htUserId, htEmail, htName }
}

/** Validate an existing HighTribe browser token via GET /api/user. */
export async function fetchHightribeUserFromToken(htToken: string): Promise<HtProfile> {
  const clean = normalizeHtToken(htToken)
  const res = await fetch(`${config.htApiBase}/api/user`, {
    headers: { Authorization: `Bearer ${clean}`, Accept: 'application/json' },
  })

  const data = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) {
    const message = typeof data.message === 'string' ? data.message : 'Invalid or expired HighTribe session.'
    throw new Error(message)
  }

  const { htUserId, htEmail, htName } = parseHtUserPayload(data)
  if (!htUserId || !htEmail) {
    throw new Error('Could not read your HighTribe profile.')
  }

  return { htToken: clean, htUserId, htEmail, htName }
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

async function provisionHightribeSession(
  profile: HtProfile,
): Promise<{ token: string; user: UserView; account: AccountView; ht_link_token: string }> {
  const { htToken, htUserId, htEmail, htName } = profile
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

/** Sign in with HighTribe email/password — creates local user/session so events can be saved to MySQL. */
export async function loginHightribeAccount(
  email: string,
  password: string,
): Promise<{ token: string; user: UserView; account: AccountView; ht_link_token: string }> {
  const profile = await loginToHightribeApi(email, password)
  return provisionHightribeSession(profile)
}

/** Sign in with an existing HighTribe token from browser storage (SSO). */
export async function loginHightribeWithToken(
  htToken: string,
): Promise<{ token: string; user: UserView; account: AccountView; ht_link_token: string }> {
  const profile = await fetchHightribeUserFromToken(htToken)
  return provisionHightribeSession(profile)
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
