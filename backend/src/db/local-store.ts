import fs from 'fs'
import path from 'path'
import type { AppSettings } from '../types/settings'
import type { ChannelName } from '../services/events'

function dataDir(): string {
  const dir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), 'data')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function storePath(): string {
  return path.join(dataDir(), 'local-app-store.json')
}

interface LocalUser {
  id: number
  email: string
  name: string
  password_hash: string
  auth_source: 'local' | 'hightribe'
  ht_user_id: string | null
  created_at: string
  updated_at: string
}

interface LocalSession {
  id: number
  user_id: number
  token: string
  expires_at: string
  created_at: string
}

interface LocalSubscription {
  user_id: number
  plan: string
  status: string
  trial_ends_at: string | null
  current_period_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  money_back_refunded_at: string | null
  created_at: string
  updated_at: string
}

interface LocalHtConnection {
  user_id: number
  ht_user_id: string
  ht_token: string
  connected_at: string
}

interface LocalResetToken {
  id: number
  user_id: number
  token: string
  expires_at: string
  used_at: string | null
  created_at: string
}

export interface LocalEventRow {
  id: number
  user_id: number
  external_id: string
  title: string
  start_at: string | null
  end_at: string | null
  timezone: string | null
  url: string | null
  cover_url: string | null
  status: string | null
  is_free: number | null
  payload_json: Record<string, unknown>
  synced_at: string
  created_at: string
  updated_at: string
}

export interface LocalBookingRow {
  id: number
  user_id: number
  channel: ChannelName
  external_id: string
  event_external_id: string | null
  event_title: string
  guest_name: string
  guest_email: string
  status: string | null
  ticket_count: number | null
  registered_at: string
  payload_json: Record<string, unknown>
  synced_at: string
  created_at: string
  updated_at: string
}

interface LocalAppStore {
  nextId: {
    user: number
    session: number
    resetToken: number
    event: number
    booking: number
  }
  users: LocalUser[]
  sessions: LocalSession[]
  subscriptions: LocalSubscription[]
  ht_connections: LocalHtConnection[]
  password_reset_tokens: LocalResetToken[]
  user_settings: Record<string, AppSettings>
  luma_events: LocalEventRow[]
  eventbrite_events: LocalEventRow[]
  hightribe_events: LocalEventRow[]
  channel_bookings: LocalBookingRow[]
}

declare global {
  // eslint-disable-next-line no-var
  var __ewentcastLocalStore: LocalAppStore | undefined
}

function emptyStore(): LocalAppStore {
  return {
    nextId: { user: 1, session: 1, resetToken: 1, event: 1, booking: 1 },
    users: [],
    sessions: [],
    subscriptions: [],
    ht_connections: [],
    password_reset_tokens: [],
    user_settings: {},
    luma_events: [],
    eventbrite_events: [],
    hightribe_events: [],
    channel_bookings: [],
  }
}

function loadStore(): LocalAppStore {
  if (global.__ewentcastLocalStore) return global.__ewentcastLocalStore
  try {
    const file = storePath()
    if (fs.existsSync(file)) {
      global.__ewentcastLocalStore = JSON.parse(fs.readFileSync(file, 'utf8')) as LocalAppStore
      return global.__ewentcastLocalStore
    }
  } catch {
    /* use empty */
  }
  global.__ewentcastLocalStore = emptyStore()
  return global.__ewentcastLocalStore
}

function saveStore(store: LocalAppStore): void {
  global.__ewentcastLocalStore = store
  fs.writeFileSync(storePath(), JSON.stringify(store, null, 2))
}

function eventTable(store: LocalAppStore, channel: ChannelName): LocalEventRow[] {
  if (channel === 'luma') return store.luma_events
  if (channel === 'eventbrite') return store.eventbrite_events
  return store.hightribe_events
}

export function localGetUserByEmail(email: string): LocalUser | null {
  const store = loadStore()
  return store.users.find((u) => u.email === email.trim().toLowerCase()) || null
}

export function localGetUserById(id: number): LocalUser | null {
  return loadStore().users.find((u) => u.id === id) || null
}

export function localCreateUser(input: {
  email: string
  name: string
  password_hash: string
  auth_source: 'local' | 'hightribe'
  ht_user_id?: string | null
}): LocalUser {
  const store = loadStore()
  const now = new Date().toISOString()
  const user: LocalUser = {
    id: store.nextId.user++,
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    password_hash: input.password_hash,
    auth_source: input.auth_source,
    ht_user_id: input.ht_user_id ?? null,
    created_at: now,
    updated_at: now,
  }
  store.users.push(user)
  saveStore(store)
  return user
}

export function localUpdateUser(
  id: number,
  patch: Partial<Pick<LocalUser, 'name' | 'password_hash' | 'auth_source' | 'ht_user_id'>>,
): void {
  const store = loadStore()
  const user = store.users.find((u) => u.id === id)
  if (!user) return
  Object.assign(user, patch, { updated_at: new Date().toISOString() })
  saveStore(store)
}

export function localCreateSession(userId: number, token: string, expiresAt: Date): void {
  const store = loadStore()
  store.sessions.push({
    id: store.nextId.session++,
    user_id: userId,
    token,
    expires_at: expiresAt.toISOString(),
    created_at: new Date().toISOString(),
  })
  saveStore(store)
}

export function localDeleteSession(token: string): void {
  const store = loadStore()
  store.sessions = store.sessions.filter((s) => s.token !== token)
  saveStore(store)
}

export function localDeleteSessionsForUser(userId: number): void {
  const store = loadStore()
  store.sessions = store.sessions.filter((s) => s.user_id !== userId)
  saveStore(store)
}

export function localResolveSession(token: string): LocalUser | null {
  const clean = token.startsWith('Bearer ') ? token.slice(7) : token
  const store = loadStore()
  const session = store.sessions.find(
    (s) => s.token === clean && new Date(s.expires_at) > new Date(),
  )
  if (!session) return null
  return store.users.find((u) => u.id === session.user_id) || null
}

export function localGetSubscription(userId: number): LocalSubscription | null {
  return loadStore().subscriptions.find((s) => s.user_id === userId) || null
}

export function localUpsertSubscription(
  userId: number,
  patch: Partial<Omit<LocalSubscription, 'user_id'>>,
): LocalSubscription {
  const store = loadStore()
  const now = new Date().toISOString()
  let sub = store.subscriptions.find((s) => s.user_id === userId)
  if (!sub) {
    sub = {
      user_id: userId,
      plan: 'pro_monthly_20',
      status: 'trialing',
      trial_ends_at: null,
      current_period_end: null,
      stripe_customer_id: null,
      stripe_subscription_id: null,
      money_back_refunded_at: null,
      created_at: now,
      updated_at: now,
    }
    store.subscriptions.push(sub)
  }
  Object.assign(sub, patch, { updated_at: now })
  saveStore(store)
  return sub
}

export function localGetHtConnection(userId: number): LocalHtConnection | null {
  return loadStore().ht_connections.find((h) => h.user_id === userId) || null
}

export function localUpsertHtConnection(userId: number, htUserId: string, htToken: string): void {
  const store = loadStore()
  const existing = store.ht_connections.find((h) => h.user_id === userId)
  const connected_at = new Date().toISOString()
  if (existing) {
    existing.ht_user_id = htUserId
    existing.ht_token = htToken
    existing.connected_at = connected_at
  } else {
    store.ht_connections.push({ user_id: userId, ht_user_id: htUserId, ht_token: htToken, connected_at })
  }
  saveStore(store)
}

export function localDeleteHtConnection(userId: number): void {
  const store = loadStore()
  store.ht_connections = store.ht_connections.filter((h) => h.user_id !== userId)
  saveStore(store)
}

export function localCreateResetToken(userId: number, token: string, expiresAt: Date): void {
  const store = loadStore()
  store.password_reset_tokens = store.password_reset_tokens.filter(
    (t) => !(t.user_id === userId && !t.used_at),
  )
  store.password_reset_tokens.push({
    id: store.nextId.resetToken++,
    user_id: userId,
    token,
    expires_at: expiresAt.toISOString(),
    used_at: null,
    created_at: new Date().toISOString(),
  })
  saveStore(store)
}

export function localConsumeResetToken(token: string): { id: number; user_id: number } | null {
  const store = loadStore()
  const row = store.password_reset_tokens.find(
    (t) => t.token === token && !t.used_at && new Date(t.expires_at) > new Date(),
  )
  if (!row) return null
  row.used_at = new Date().toISOString()
  saveStore(store)
  return { id: row.id, user_id: row.user_id }
}

export function localGetUserSettings(userId: number): AppSettings | null {
  return loadStore().user_settings[String(userId)] || null
}

export function localSetUserSettings(userId: number, settings: AppSettings): void {
  const store = loadStore()
  store.user_settings[String(userId)] = settings
  saveStore(store)
}

export function localListEvents(channel: ChannelName, userId: number): LocalEventRow[] {
  return eventTable(loadStore(), channel)
    .filter((e) => e.user_id === userId)
    .sort((a, b) => {
      const aMs = a.start_at ? new Date(a.start_at).getTime() : 0
      const bMs = b.start_at ? new Date(b.start_at).getTime() : 0
      return bMs - aMs
    })
}

export function localGetEvent(
  channel: ChannelName,
  userId: number,
  externalId: string,
): LocalEventRow | null {
  return (
    eventTable(loadStore(), channel).find(
      (e) => e.user_id === userId && e.external_id === String(externalId),
    ) || null
  )
}

export function localResolveUserIdFromEvent(channel: ChannelName, eventId: string): number | null {
  const row = eventTable(loadStore(), channel).find((e) => e.external_id === String(eventId))
  return row?.user_id ?? null
}

export function localUpsertEvents(
  channel: ChannelName,
  userId: number,
  rows: Array<Omit<LocalEventRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>,
): number {
  const store = loadStore()
  const table = eventTable(store, channel)
  const now = new Date().toISOString()
  let upserted = 0

  for (const row of rows) {
    const existing = table.find(
      (e) => e.user_id === userId && e.external_id === row.external_id,
    )
    if (existing) {
      Object.assign(existing, row, { updated_at: now })
    } else {
      table.push({
        ...row,
        id: store.nextId.event++,
        user_id: userId,
        created_at: now,
        updated_at: now,
      })
    }
    upserted++
  }

  saveStore(store)
  return upserted
}

export function localDeleteEvent(
  channel: ChannelName,
  userId: number,
  externalId: string,
): boolean {
  const store = loadStore()
  const table = eventTable(store, channel)
  const before = table.length
  const next = table.filter(
    (e) => !(e.user_id === userId && e.external_id === String(externalId)),
  )
  if (next.length === before) return false
  if (channel === 'luma') store.luma_events = next
  else if (channel === 'eventbrite') store.eventbrite_events = next
  else store.hightribe_events = next
  saveStore(store)
  return true
}

export function localDeleteAllEvents(channel: ChannelName, userId: number): number {
  const store = loadStore()
  const table = eventTable(store, channel)
  const before = table.length
  const next = table.filter((e) => e.user_id !== userId)
  const deleted = before - next.length
  if (channel === 'luma') store.luma_events = next
  else if (channel === 'eventbrite') store.eventbrite_events = next
  else store.hightribe_events = next
  saveStore(store)
  return deleted
}

/** Drop stored events for this user/channel that are not in keepExternalIds. */
export function localPruneEvents(
  channel: ChannelName,
  userId: number,
  keepExternalIds: Set<string>,
): number {
  const store = loadStore()
  const table = eventTable(store, channel)
  const next = table.filter(
    (e) => !(e.user_id === userId && !keepExternalIds.has(e.external_id)),
  )
  const pruned = table.length - next.length
  if (pruned === 0) return 0
  if (channel === 'luma') store.luma_events = next
  else if (channel === 'eventbrite') store.eventbrite_events = next
  else store.hightribe_events = next
  saveStore(store)
  return pruned
}

export function localListBookings(userId: number): LocalBookingRow[] {
  return loadStore()
    .channel_bookings.filter((b) => b.user_id === userId)
    .sort((a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime())
}

export function localUpsertBookings(
  userId: number,
  channel: ChannelName,
  rows: Array<Omit<LocalBookingRow, 'id' | 'user_id' | 'channel' | 'created_at' | 'updated_at'>>,
): number {
  const store = loadStore()
  const now = new Date().toISOString()
  let upserted = 0

  for (const row of rows) {
    const existing = store.channel_bookings.find(
      (b) => b.user_id === userId && b.channel === channel && b.external_id === row.external_id,
    )
    if (existing) {
      Object.assign(existing, row, { synced_at: now, updated_at: now })
    } else {
      store.channel_bookings.push({
        ...row,
        id: store.nextId.booking++,
        user_id: userId,
        channel,
        created_at: now,
        updated_at: now,
      })
    }
    upserted++
  }

  saveStore(store)
  return upserted
}

export function localDeleteAllBookings(userId: number, channel?: ChannelName): number {
  const store = loadStore()
  const before = store.channel_bookings.length
  store.channel_bookings = store.channel_bookings.filter((b) => {
    if (b.user_id !== userId) return true
    if (channel && b.channel !== channel) return true
    return false
  })
  saveStore(store)
  return before - store.channel_bookings.length
}
