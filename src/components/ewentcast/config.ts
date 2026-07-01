import type { ChannelKey } from '@/lib/types'
import { HIGHTRIBE_COLOR, LUMA_COLOR, EVENTBRITE_COLOR } from '@/lib/brand'

export const CH_META: Record<ChannelKey, { name: string; color: string; auth: string; cap: string; base: string; signin: string }> = {
  hightribe: { name: 'Hightribe', color: HIGHTRIBE_COLOR, auth: 'Native', cap: 'Two-way sync', base: 'Hightribe.co/e/', signin: 'Linked to your Hightribe account' },
  eventbrite: { name: 'Eventbrite', color: EVENTBRITE_COLOR, auth: 'OAuth 2.0', cap: 'Two-way sync · webhooks', base: 'eventbrite.com/e/', signin: 'Sign in to Eventbrite' },
  luma: { name: 'Luma', color: LUMA_COLOR, auth: 'API key', cap: 'Two-way sync · Luma Plus', base: 'lu.ma/', signin: 'Sign in to Luma for your key' },
}

export const ALL_CHANNELS: ChannelKey[] = ['hightribe', 'eventbrite', 'luma']

export const WIZARD_STEPS = ['Create event', 'Publish', 'Dashboard'] as const

export type FieldDef = {
  k: string
  label: string
  hint?: string
  placeholder?: string
  type?: 'textarea' | 'select' | 'toggle' | 'cover'
  opts?: string[]
  full?: boolean
  on: ChannelKey[]
}

export const SECTIONS: { key: string; label: string; fields: FieldDef[] }[] = [
  { key: 'basics', label: 'Basics', fields: [
    { k: 'title', label: 'Title', placeholder: 'e.g. Summer rooftop concert', on: ALL_CHANNELS },
    { k: 'summary', label: 'Summary', hint: 'short line', placeholder: 'One-line teaser for listings', on: ['hightribe', 'eventbrite'] },
    { k: 'description', label: 'Description', type: 'textarea', full: true, placeholder: 'Tell guests what to expect…', on: ALL_CHANNELS },
    { k: 'coverUrl', label: 'Cover photo', hint: 'upload or paste URL', type: 'cover', full: true, on: ALL_CHANNELS },
    { k: 'category', label: 'Category', type: 'select', opts: ['Music', 'Food & Drink', 'Arts & Culture', 'Community', 'Business', 'Sports & Fitness'], on: ['hightribe', 'eventbrite'] },
    { k: 'tags', label: 'Tags', hint: 'comma separated', on: ['hightribe', 'luma'] },
  ]},
  { key: 'when', label: 'When', fields: [
    { k: 'date', label: 'Start date', on: ALL_CHANNELS },
    { k: 'time', label: 'Start time', on: ALL_CHANNELS },
    { k: 'endDate', label: 'End date', on: ALL_CHANNELS },
    { k: 'endTime', label: 'End time', on: ALL_CHANNELS },
    { k: 'timezone', label: 'Timezone', type: 'select', opts: ['America/Los_Angeles', 'America/New_York', 'Asia/Karachi', 'Europe/London', 'UTC'], on: ALL_CHANNELS },
  ]},
  { key: 'where', label: 'Where', fields: [
    { k: 'format', label: 'Format', type: 'select', opts: ['In person', 'Online', 'Hybrid'], on: ALL_CHANNELS },
    { k: 'venue', label: 'Venue name', placeholder: 'e.g. The Grand Hall', on: ALL_CHANNELS },
    { k: 'address', label: 'Street address', placeholder: '123 Main St', on: ALL_CHANNELS },
    { k: 'city', label: 'City', placeholder: 'City', on: ALL_CHANNELS },
    { k: 'region', label: 'Region / State', on: ALL_CHANNELS },
    { k: 'postal', label: 'Postal code', on: ALL_CHANNELS },
    { k: 'country', label: 'Country', on: ALL_CHANNELS },
    { k: 'lat', label: 'Latitude', on: ALL_CHANNELS },
    { k: 'lng', label: 'Longitude', on: ALL_CHANNELS },
    { k: 'onlineUrl', label: 'Online link', hint: 'online / hybrid', on: ALL_CHANNELS },
  ]},
  { key: 'tickets', label: 'Tickets', fields: [
    { k: 'ticketType', label: 'Ticket type', type: 'select', opts: ['Paid', 'Free', 'Donation'], on: ALL_CHANNELS },
    { k: 'price', label: 'Price', on: ALL_CHANNELS },
    { k: 'currency', label: 'Currency', type: 'select', opts: ['USD', 'PKR', 'EUR', 'GBP'], on: ALL_CHANNELS },
    { k: 'capacity', label: 'Capacity', on: ALL_CHANNELS },
    { k: 'minPerOrder', label: 'Min per order', on: ['eventbrite'] },
    { k: 'maxPerOrder', label: 'Max per order', on: ['eventbrite'] },
    { k: 'salesStart', label: 'Sales start', on: ['eventbrite', 'luma'] },
    { k: 'salesEnd', label: 'Sales end', on: ['eventbrite', 'luma'] },
    { k: 'waitlist', label: 'Waitlist when full', type: 'toggle', on: ['hightribe', 'luma'] },
  ]},
  { key: 'access', label: 'Access', fields: [
    { k: 'visibility', label: 'Visibility', type: 'select', opts: ['Public', 'Unlisted', 'Private', 'Member-only'], on: ALL_CHANNELS },
    { k: 'requireApproval', label: 'Require host approval', type: 'toggle', on: ['hightribe', 'luma'] },
    { k: 'inviteOnly', label: 'Invite only', type: 'toggle', on: ['hightribe', 'eventbrite'] },
    { k: 'showRemaining', label: 'Show tickets remaining', type: 'toggle', on: ['eventbrite'] },
    { k: 'password', label: 'Access password', hint: 'optional', on: ['eventbrite'] },
  ]},
  { key: 'host', label: 'Host', fields: [
    { k: 'hostName', label: 'Host / organizer', placeholder: 'Your name or organization', on: ALL_CHANNELS },
    { k: 'refundPolicy', label: 'Refund policy', type: 'textarea', full: true, placeholder: 'e.g. Full refund up to 7 days before the event', on: ['hightribe', 'eventbrite'] },
    { k: 'faq', label: 'FAQ', type: 'textarea', full: true, placeholder: 'Parking, dress code, accessibility…', on: ['hightribe', 'eventbrite'] },
  ]},
]

export const DEFAULT_EVENT: Record<string, string | boolean> = {
  title: '',
  summary: '',
  description: '',
  coverUrl: '',
  category: '',
  tags: '',
  date: '',
  time: '',
  endDate: '',
  endTime: '',
  timezone: '',
  format: '',
  venue: '',
  address: '',
  city: '',
  region: '',
  postal: '',
  country: '',
  lat: '',
  lng: '',
  onlineUrl: '',
  ticketType: '',
  price: '',
  currency: '',
  capacity: '',
  minPerOrder: '',
  maxPerOrder: '',
  salesStart: '',
  salesEnd: '',
  waitlist: false,
  visibility: '',
  requireApproval: false,
  inviteOnly: false,
  showRemaining: false,
  password: '',
  hostName: '',
  refundPolicy: '',
  faq: '',
}

/** @deprecated Use DEFAULT_EVENT */
export const SAMPLE_EVENT = DEFAULT_EVENT
