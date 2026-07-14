import { NextRequest } from 'next/server'
import { proxyToBackend } from '@/lib/backend-client'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  return proxyToBackend(req, 'users')
}
