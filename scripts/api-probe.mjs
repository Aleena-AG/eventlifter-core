import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env.local') })

const base = process.env.TEST_API_BASE || 'http://127.0.0.1:3000'

async function registerToken() {
  const email = `diag-${Date.now()}@example.com`
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Diag User', email, password: 'testpass123' }),
  })
  const data = await res.json()
  if (!res.ok || !data.token) throw new Error(data.message || `register failed ${res.status}`)
  return data.token
}

async function probe(pathname, token) {
  const res = await fetch(`${base}${pathname}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  const text = await res.text()
  let body = text.slice(0, 200)
  try {
    const j = JSON.parse(text)
    body = j.error || j.message || body
  } catch { /* keep raw */ }
  console.log(`${res.status} ${pathname} -> ${body}`)
}

const token = await registerToken()
for (const p of [
  '/api/auth/me',
  '/api/events/luma',
  '/api/events/hightribe',
  '/api/events/eventbrite',
  '/api/settings',
  '/api/eventbrite/status',
  '/api/luma/users/self',
  '/api/dashboard/stats',
]) {
  await probe(p, token)
}
