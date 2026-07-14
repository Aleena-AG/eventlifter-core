import { authHeader, clearAuth, getUser } from '@/lib/auth'
import { getEwentcastAccount, logoutLocal } from '@/lib/ewentcast-session'
import type { ChannelKey } from '@/lib/types'
import { purgeChannelDataFromDb } from '@/lib/channel-data-sync'
import { disconnectChannelSettings } from '@/lib/channel-connect'
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
    const data = await res.json().catch(() => ({})) as { error?: string; message?: string }
    throw new Error(data.message || data.error || 'Failed to save settings')
  }
}

/**
 * Disconnect a channel integration via DELETE /api/v1/settings/:channel.
 * Hightribe signed in as native auth (no Ewentcast settings) still signs out.
 */
export async function disconnectChannelIntegration(
  channel: ChannelKey,
): Promise<'linked' | 'session' | 'cleared'> {
  if (channel !== 'luma' && channel !== 'eventbrite' && channel !== 'hightribe') {
    throw new Error('Unknown channel')
  }

  if (channel === 'hightribe') {
    const account = getEwentcastAccount()
    if (account?.auth_source === 'hightribe_native' && getUser()) {
      try {
        await logoutLocal()
      } catch {
        // clear locally even if logout API fails
      }
      clearAuth()
      void purgeChannelDataFromDb(channel)
      return 'session'
    }
  }

  await disconnectChannelSettings(channel)

  if (getUser()) {
    void purgeChannelDataFromDb(channel)
  }

  return 'cleared'
}

export function channelDisconnectLabel(channel: ChannelKey, connected: boolean): string | null {
  if (!connected) return null
  return 'Disconnect'
}

export { saveUserSettings }
