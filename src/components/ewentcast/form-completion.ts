import type { EventFormData } from '@/lib/publish-event'
import type { ChannelKey } from '@/lib/types'
import { ALL_CHANNELS, SECTIONS, type FieldDef } from './config'

// Completion is measured against the channels the event will publish to. When
// none are selected/connected yet, fall back to all channels so the percentage
// still reflects the fields the user has filled (instead of showing 0%).
function effectiveTargets(targets: ChannelKey[]): ChannelKey[] {
  return targets.length > 0 ? targets : ALL_CHANNELS
}

const OPTIONAL_FIELDS = new Set([
  'summary', 'tags', 'coverUrl', 'lat', 'lng', 'password',
  'refundPolicy', 'faq', 'minPerOrder', 'maxPerOrder', 'salesStart', 'salesEnd',
])

function appliesToTargets(f: FieldDef, targets: ChannelKey[]): boolean {
  return f.on.some(ch => targets.includes(ch))
}

export function isFieldRequired(f: FieldDef, targets: ChannelKey[], ev: EventFormData): boolean {
  if (!appliesToTargets(f, targets)) return false
  if (f.type === 'toggle') return false
  if (OPTIONAL_FIELDS.has(f.k)) return false

  const format = String(ev.format ?? '')
  if (['venue', 'address', 'city', 'region', 'postal', 'country', 'lat', 'lng'].includes(f.k)) {
    if (format === 'Online') return false
  }
  if (f.k === 'onlineUrl') {
    return format === 'Online' || format === 'Hybrid'
  }
  if (f.k === 'price' || f.k === 'currency') {
    const ticketType = String(ev.ticketType ?? '')
    if (!ticketType || ticketType === 'Free') return false
  }
  return true
}

export function isFieldFilled(f: FieldDef, value: string | boolean | undefined): boolean {
  if (f.type === 'toggle') return true
  return String(value ?? '').trim() !== ''
}

export type SectionStatus = {
  complete: boolean
  filled: number
  total: number
  pct: number
}

export function getSectionStatus(
  sectionIndex: number,
  ev: EventFormData,
  targets: ChannelKey[],
): SectionStatus {
  const eff = effectiveTargets(targets)
  const fields = SECTIONS[sectionIndex].fields.filter(f => isFieldRequired(f, eff, ev))
  if (fields.length === 0) return { complete: true, filled: 0, total: 0, pct: 100 }
  const filled = fields.filter(f => isFieldFilled(f, ev[f.k])).length
  const total = fields.length
  return {
    complete: filled === total,
    filled,
    total,
    pct: Math.round((filled / total) * 100),
  }
}

export function getFormCompletion(ev: EventFormData, targets: ChannelKey[]) {
  const eff = effectiveTargets(targets)
  const sectionStatuses = SECTIONS.map((_, i) => getSectionStatus(i, ev, eff))
  const allRequired = SECTIONS.flatMap(s => s.fields).filter(f => isFieldRequired(f, eff, ev))
  const filled = allRequired.filter(f => isFieldFilled(f, ev[f.k])).length
  const total = allRequired.length
  const pct = total === 0 ? 0 : Math.round((filled / total) * 100)
  const allComplete = sectionStatuses.every(s => s.complete)
  return { pct, allComplete, sectionStatuses, filled, total }
}
