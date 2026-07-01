import { getPool } from '../db/pool.js'
import { config } from '../config.js'
import { getAccountView, type AccountView } from './auth.js'
import { purgeChannelData } from './channel-data.js'

interface HtLoginResponse {
  status?: boolean
  token?: string
  message?: string
  user?: { id?: number | string; name?: string; email?: string }
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

  await getPool().query(
    `INSERT INTO ht_connections (user_id, ht_user_id, ht_token, connected_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       ht_user_id = VALUES(ht_user_id),
       ht_token = VALUES(ht_token),
       connected_at = VALUES(connected_at)`,
    [userId, htUserId, htToken, new Date()],
  )

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
