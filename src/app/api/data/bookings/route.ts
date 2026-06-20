import { NextResponse } from 'next/server'
import { listBookings } from '@/lib/db/bookings-store'
import { getSyncMeta } from '@/lib/db/index'

export async function GET() {
  const bookings = listBookings(500)
  return NextResponse.json({
    bookings,
    lastSyncedAt: getSyncMeta('last_sync_at'),
  })
}
