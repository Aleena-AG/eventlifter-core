import { NextResponse } from 'next/server'
import { resolveSession, type UserRow } from '../../../backend/src/services/auth'

export type SessionContext = { user: UserRow; token: string }

export function isErrorResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse
}

export async function requireSession(req: Request): Promise<SessionContext | NextResponse> {
  const header = req.headers.get('authorization')
  if (!header?.trim()) {
    return NextResponse.json({ status: false, message: 'Unauthorized' }, { status: 401 })
  }

  const user = await resolveSession(header)
  if (!user) {
    return NextResponse.json({ status: false, message: 'Session expired' }, { status: 401 })
  }

  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim()
  return { user, token }
}
