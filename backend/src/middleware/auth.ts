import type { NextFunction, Request, Response } from 'express'
import { resolveSession, type UserRow } from '../services/auth.js'

export interface AuthedRequest extends Request {
  user?: UserRow
  sessionToken?: string
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header) {
    return res.status(401).json({ status: false, message: 'Unauthorized' })
  }

  const user = await resolveSession(header)
  if (!user) {
    return res.status(401).json({ status: false, message: 'Session expired' })
  }

  req.user = user
  req.sessionToken = header.startsWith('Bearer ') ? header.slice(7) : header
  return next()
}
