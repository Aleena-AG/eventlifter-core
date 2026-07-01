import { authHeader, clearAuth, getUser } from '@/lib/auth'
import {
  disconnectHightribe,
  getEwentcastAccount,
  isEwentcastSignupUser,
  logoutLocal,
} from '@/lib/ewentcast-session'
import type { ChannelKey } from '@/lib/types'
import { purgeChannelDataFromDb } from '@/lib/channel-data-sync'
import type { AppSettings } from '@/lib/settings-types'

async function saveUserSettings(patch: Partial<AppSettings>): Promise<void> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      Accept: 'application/json',
    },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error || 'Failed to save settings')
  }
}

async function clearChannelSettingsInDb(channel: 'luma' | 'eventbrite' | 'hightribe'): Promise<void> {
  try {
    const res = await fetch(`/api/settings/${channel}`, {
      method: 'DELETE',
      headers: { Authorization: authHeader(), Accept: 'application/json' },
    })
    if (!res.ok) return
    await res.json().catch(() => undefined)
  } catch {
    // best-effort
  }
}

async function clearLumaCredentials(): Promise<void> {
  await clearChannelSettingsInDb('luma')
}

async function clearEventbriteCredentials(): Promise<void> {
  await clearChannelSettingsInDb('eventbrite')
}

async function disconnectHightribeChannel(): Promise<'linked' | 'session'> {
  if (isEwentcastSignupUser() && getEwentcastAccount()?.ht_connected) {
    await disconnectHightribe()
    return 'linked'
  }
  if (getUser()) {
    try {
      await logoutLocal()
    } catch {
      // clear locally even if logout API fails
    }
    clearAuth()
    return 'session'
  }
  throw new Error('Not connected to HighTribe')
}

export async function disconnectChannelIntegration(
  channel: ChannelKey,
): Promise<'linked' | 'session' | 'cleared'> {
  let result: 'linked' | 'session' | 'cleared'

  if (channel === 'luma') {
    await clearLumaCredentials()
    result = 'cleared'
  } else if (channel === 'eventbrite') {
    await clearEventbriteCredentials()
    result = 'cleared'
  } else if (channel === 'hightribe') {
    result = await disconnectHightribeChannel()
  } else {
    throw new Error('Unknown channel')
  }

  if (getUser()) {
    void purgeChannelDataFromDb(channel)
  }

  return result
}

export function channelDisconnectLabel(channel: ChannelKey, connected: boolean): string | null {
  if (!connected) return null
  if (channel === 'hightribe' && isEwentcastSignupUser() && getEwentcastAccount()?.ht_connected) {
    return 'Disconnect HighTribe'
  }
  if (channel === 'hightribe') return 'Sign out'
  return 'Disconnect'
}

// exported for settings save helpers if needed elsewhere
export { saveUserSettings }
