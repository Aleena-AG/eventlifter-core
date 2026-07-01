import { authHeader, clearAuth, getUser } from '@/lib/auth'
import {
  disconnectHightribe,
  getEwentcastAccount,
  isEwentcastSignupUser,
  logoutLocal,
} from '@/lib/ewentcast-session'
import {
  appSettingsToHtPatch,
  htDataToPublicForm,
  saveChannelSettingsViaProxy,
} from '@/lib/channel-settings-client'
import type { ChannelKey } from '@/lib/types'

async function clearLocalSettings(patch: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/settings?localOnly=1', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader(),
      Accept: 'application/json',
    },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const data = await res.json() as { error?: string }
    throw new Error(data.error || 'Failed to clear local settings')
  }
}

async function clearLumaCredentials(): Promise<void> {
  const empty = {
    luma: { apiKey: '', calendarId: '', apiBaseUrl: '', discoverBaseUrl: '' },
  }

  await clearLocalSettings(htDataToPublicForm(appSettingsToHtPatch(empty)))

  if (getUser()) {
    try {
      const saved = await saveChannelSettingsViaProxy(appSettingsToHtPatch(empty))
      await clearLocalSettings(htDataToPublicForm(saved))
    } catch {
      // Local cache cleared; HT sync optional for ewentcast-only users
    }
  }
}

async function clearEventbriteCredentials(): Promise<void> {
  const empty = {
    eventbrite: {
      clientId: '',
      clientSecret: '',
      redirectUri: '',
      privateToken: '',
      publicToken: '',
    },
  }

  await clearLocalSettings(htDataToPublicForm(appSettingsToHtPatch(empty)))

  if (getUser()) {
    try {
      const saved = await saveChannelSettingsViaProxy(appSettingsToHtPatch(empty))
      await clearLocalSettings(htDataToPublicForm(saved))
    } catch {
      // Local cache cleared
    }
  }
}

async function disconnectHightribeChannel(): Promise<'linked' | 'session'> {
  if (isEwentcastSignupUser() && getEwentcastAccount()?.ht_connected) {
    await disconnectHightribe()
    return 'linked'
  }
  if (getUser()) {
    await logoutLocal()
    clearAuth()
    return 'session'
  }
  throw new Error('Not connected to HighTribe')
}

export async function disconnectChannelIntegration(
  channel: ChannelKey,
): Promise<'linked' | 'session' | 'cleared'> {
  if (channel === 'luma') {
    await clearLumaCredentials()
    return 'cleared'
  }
  if (channel === 'eventbrite') {
    await clearEventbriteCredentials()
    return 'cleared'
  }
  if (channel === 'hightribe') {
    return disconnectHightribeChannel()
  }
  throw new Error('Unknown channel')
}

export function channelDisconnectLabel(channel: ChannelKey, connected: boolean): string | null {
  if (!connected) return null
  if (channel === 'hightribe' && isEwentcastSignupUser() && getEwentcastAccount()?.ht_connected) {
    return 'Disconnect HighTribe'
  }
  if (channel === 'hightribe') return 'Sign out'
  return 'Disconnect'
}
