import fs from 'fs'
import path from 'path'
import type { ChannelKey } from '@/lib/types'

export interface ChannelRef {
  eventId: string
  ticketId?: string
  url?: string
}

export interface AttendeeRecord {
  email: string
  name: string
  source: ChannelKey
  registeredAt: string
  merged?: boolean
}

export interface MasterEventRecord {
  id: string
  title: string
  capacity: number
  sold: number
  channels: Partial<Record<ChannelKey, ChannelRef>>
  attendees: AttendeeRecord[]
  createdAt: string
  updatedAt: string
}

const FILE = path.join(process.cwd(), 'data', 'event-registry.json')

function ensureFile() {
  const dir = path.dirname(FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ events: [] }, null, 2))
}

function readAll(): { events: MasterEventRecord[] } {
  ensureFile()
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) as { events: MasterEventRecord[] }
  } catch {
    return { events: [] }
  }
}

function writeAll(data: { events: MasterEventRecord[] }) {
  ensureFile()
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2))
}

export function listMasterEvents(): MasterEventRecord[] {
  return readAll().events
}

export function getMasterEvent(id: string): MasterEventRecord | undefined {
  return readAll().events.find(e => e.id === id)
}

export function findMasterByChannelEvent(channel: ChannelKey, eventId: string): MasterEventRecord | undefined {
  return readAll().events.find(e => e.channels[channel]?.eventId === String(eventId))
}

export function saveMasterEvent(record: MasterEventRecord): MasterEventRecord {
  const data = readAll()
  const idx = data.events.findIndex(e => e.id === record.id)
  record.updatedAt = new Date().toISOString()
  if (idx >= 0) data.events[idx] = record
  else data.events.push(record)
  writeAll(data)
  return record
}

export function createMasterEvent(input: {
  title: string
  capacity: number
  channels?: Partial<Record<ChannelKey, ChannelRef>>
}): MasterEventRecord {
  const now = new Date().toISOString()
  const record: MasterEventRecord = {
    id: `mst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    capacity: input.capacity,
    sold: 0,
    channels: input.channels || {},
    attendees: [],
    createdAt: now,
    updatedAt: now,
  }
  return saveMasterEvent(record)
}

export function registerAttendee(
  masterId: string,
  attendee: Omit<AttendeeRecord, 'registeredAt'> & { registeredAt?: string },
): MasterEventRecord | null {
  const master = getMasterEvent(masterId)
  if (!master) return null

  const email = attendee.email.toLowerCase().trim()
  const exists = master.attendees.some(a => a.email.toLowerCase() === email)
  if (!exists) {
    master.attendees.push({
      ...attendee,
      email,
      registeredAt: attendee.registeredAt || new Date().toISOString(),
    })
    master.sold = master.attendees.length
    saveMasterEvent(master)
  }
  return master
}

export function linkChannelEvent(
  masterId: string,
  channel: ChannelKey,
  ref: ChannelRef,
): MasterEventRecord | null {
  const master = getMasterEvent(masterId)
  if (!master) return null
  master.channels[channel] = ref
  return saveMasterEvent(master)
}

export function deleteMasterEvent(id: string): boolean {
  const data = readAll()
  const next = data.events.filter(e => e.id !== id)
  if (next.length === data.events.length) return false
  writeAll({ events: next })
  return true
}

export function removeChannelFromMaster(masterId: string, channel: ChannelKey): MasterEventRecord | null {
  const master = getMasterEvent(masterId)
  if (!master) return null
  delete master.channels[channel]
  const remaining = Object.keys(master.channels).length
  if (remaining === 0) {
    deleteMasterEvent(masterId)
    return null
  }
  return saveMasterEvent(master)
}
