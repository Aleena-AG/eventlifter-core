import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(root, '.env.local') })
dotenv.config({ path: path.join(root, '.env') })

const host = process.env.CHANNEL_MANAGER_DB_HOST
const user = process.env.CHANNEL_MANAGER_DB_USER
const password = process.env.CHANNEL_MANAGER_DB_PASSWORD
const database = process.env.CHANNEL_MANAGER_DB_NAME || 'channel_manager_db'
const port = Number(process.env.CHANNEL_MANAGER_DB_PORT || 3306)

if (!host || !user || !password) {
  console.error('DB env missing')
  process.exit(1)
}

try {
  const conn = await mysql.createConnection({ host, port, user, password, database, connectTimeout: 15000 })
  const [rows] = await conn.query('SELECT 1 AS ok')
  console.log('DB OK', rows)
  await conn.end()
} catch (err) {
  console.error('DB FAIL', err instanceof Error ? err.message : err)
  process.exit(1)
}
