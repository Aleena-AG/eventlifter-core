import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env.local') })

const base = process.env.TEST_API_BASE || 'http://127.0.0.1:3000'

async function registerToken() {
  const email = `dash-${Date.now()}@example.com`
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Dash Test', email, password: 'testpass123' }),
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
  console.log(`${res.status} ${pathname}`)
  console.log(text.slice(0, 300))
  console.log('---')
}

const token = await registerToken()
await probe('/api/settings', token)
await probe('/api/dashboard/stats', token)
await probe('/api/events/eventbrite', token)
