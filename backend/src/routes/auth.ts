import { Router } from 'express'
import type { AuthedRequest } from '../middleware/auth'
import { requireAuth } from '../middleware/auth'
import {
  getMe,
  loginUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
  deleteSession,
} from '../services/auth'
import {
  connectHightribeAccount,
  disconnectHightribeAccount,
  loginHightribeAccount,
  loginHightribeWithToken,
} from '../services/hightribe-connect'

export const authRouter = Router()

authRouter.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body as {
      name?: string
      email?: string
      password?: string
    }
    if (!name || !email || !password) {
      return res.status(422).json({ status: false, message: 'All fields are required' })
    }
    if (password.length < 8) {
      return res.status(422).json({ status: false, message: 'Password must be at least 8 characters' })
    }

    const result = await registerUser({ name, email, password })
    return res.json({
      status: true,
      token: result.token,
      user: result.user,
      ewentcast: result.account,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed'
    const code = message.includes('already exists') ? 422 : 500
    return res.status(code).json({ status: false, message })
  }
})

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string }
    if (!email || !password) {
      return res.status(422).json({ status: false, message: 'Email and password are required' })
    }

    const result = await loginUser(email, password)
    return res.json({
      status: true,
      token: result.token,
      user: result.user,
      ewentcast: result.account,
    })
  } catch (err) {
    return res.status(401).json({
      status: false,
      message: err instanceof Error ? err.message : 'Login failed',
    })
  }
})

authRouter.post('/logout', requireAuth, async (req: AuthedRequest, res) => {
  if (req.sessionToken) await deleteSession(req.sessionToken)
  return res.json({ status: true })
})

authRouter.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const me = await getMe(req.sessionToken!)
  if (!me) return res.status(401).json({ status: false, message: 'Unauthorized' })
  return res.json({
    status: true,
    user: me.user,
    ewentcast: me.account,
    ht_link_token: me.ht_link_token,
  })
})

authRouter.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body as { email?: string }
    if (!email) return res.status(422).json({ status: false, message: 'Email is required' })
    const result = await requestPasswordReset(email)
    return res.json({ status: true, ...result })
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: err instanceof Error ? err.message : 'Request failed',
    })
  }
})

authRouter.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body as { token?: string; password?: string }
    if (!token || !password) {
      return res.status(422).json({ status: false, message: 'Token and password are required' })
    }
    await resetPassword(token, password)
    return res.json({ status: true, message: 'Password updated. You can sign in now.' })
  } catch (err) {
    return res.status(400).json({
      status: false,
      message: err instanceof Error ? err.message : 'Reset failed',
    })
  }
})

authRouter.post('/login-hightribe', async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string }
    if (!email || !password) {
      return res.status(422).json({ status: false, message: 'Email and password are required' })
    }
    const result = await loginHightribeAccount(email, password)
    return res.json({
      status: true,
      token: result.token,
      user: result.user,
      ewentcast: result.account,
      ht_link_token: result.ht_link_token,
    })
  } catch (err) {
    return res.status(401).json({
      status: false,
      message: err instanceof Error ? err.message : 'HighTribe login failed',
    })
  }
})

authRouter.post('/login-hightribe-token', async (req, res) => {
  try {
    const { ht_token: bodyToken } = req.body as { ht_token?: string }
    const headerAuth = req.headers.authorization || ''
    const htToken = bodyToken || (headerAuth.startsWith('Bearer ') ? headerAuth.slice(7) : '')
    if (!htToken) {
      return res.status(422).json({ status: false, message: 'HighTribe token is required' })
    }
    const result = await loginHightribeWithToken(htToken)
    return res.json({
      status: true,
      token: result.token,
      user: result.user,
      ewentcast: result.account,
      ht_link_token: result.ht_link_token,
    })
  } catch (err) {
    return res.status(401).json({
      status: false,
      message: err instanceof Error ? err.message : 'HighTribe sign-in failed',
    })
  }
})

authRouter.post('/connect-hightribe', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string }
    if (!email || !password) {
      return res.status(422).json({ status: false, message: 'Email and password are required' })
    }
    const result = await connectHightribeAccount(req.user!.id, email, password)
    return res.json({
      status: true,
      message: 'HighTribe connected successfully.',
      ewentcast: result.account,
      ht_link_token: result.ht_link_token,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connect failed'
    const code = message.includes('subscription') ? 402 : message.includes('Invalid') ? 401 : 400
    return res.status(code).json({ status: false, message })
  }
})

authRouter.post('/disconnect-hightribe', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const account = await disconnectHightribeAccount(req.user!.id)
    return res.json({
      status: true,
      message: 'HighTribe disconnected.',
      ewentcast: account,
    })
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: err instanceof Error ? err.message : 'Disconnect failed',
    })
  }
})
