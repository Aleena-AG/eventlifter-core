import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env.local') })

const base = process.env.TEST_API_BASE || 'http://127.0.0.1:3000'
const badToken = 'invalid-session-token-for-probe'

async function probe(pathname) {
  const res = await fetch(`${base}${pathname}`, {
    headers: { Authorization: `Bearer ${badToken}`, Accept: 'application/json' },
  })
  console.log(`${res.status} ${pathname}`)
}

for (const p of [
  '/api/auth/me',
  '/api/events/luma',
  '/api/eventbrite/status',
  '/api/eventbrite/users/me/organizations',
  '/api/luma/users/self',
]) {
  await probe(p)
}
