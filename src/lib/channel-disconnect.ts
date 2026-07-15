import { clearAuth, getUser } from '@/lib/auth'
import {
  getEwentcastAccount,
  logoutLocal,
  setEwentcastAccount,
  setHtLinkToken,
} from '@/lib/ewentcast-session'
import type { ChannelKey } from '@/lib/types'
import { purgeChannelDataFromDb } from '@/lib/channel-data-sync'
import { disconnectChannelSettings } from '@/lib/channel-connect'

function clearLocalHightribeLink(): void {
  setHtLinkToken(null)
  const account = getEwentcastAccount()
  if (account) {
    setEwentcastAccount({
      ...account,
      ht_connected: false,
      linked_ht_user_id: null,
      ht_connected_at: null,
      ht_connect_email: null,
    })
  }
}

/**
 * Disconnect a channel via DELETE /api/v1/settings/:channel
 * (hightribe | luma | eventbrite). Always hits the API; then clears local cache.
 *
 * Hightribe native login treats disconnect as sign-out after the DELETE.
 */
export async function disconnectChannelIntegration(
  channel: ChannelKey,
): Promise<'linked' | 'session' | 'cleared'> {
  if (channel !== 'luma' && channel !== 'eventbrite' && channel !== 'hightribe') {
    throw new Error('Unknown channel')
  }

  const account = channel === 'hightribe' ? getEwentcastAccount() : null
  const nativeHtSession =
    channel === 'hightribe'
    && account?.auth_source === 'hightribe_native'
    && !!getUser()

  // DELETE /api/v1/settings/hightribe | /luma | /eventbrite
  await disconnectChannelSettings(channel)

  if (channel === 'hightribe') {
    clearLocalHightribeLink()
  }

  if (nativeHtSession) {
    try {
      await logoutLocal()
    } catch {
      // clear locally even if logout API fails
    }
    clearAuth()
    void purgeChannelDataFromDb(channel)
    return 'session'
  }

  if (getUser()) {
    void purgeChannelDataFromDb(channel)
  }

  return 'cleared'
}

export function channelDisconnectLabel(channel: ChannelKey, connected: boolean): string | null {
  if (!connected) return null
  return 'Disconnect'
}
