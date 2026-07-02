import mysql from 'mysql2/promise'
import { config, dbConfigured } from '../config'

let pool: mysql.Pool | null = null

export function getPool(): mysql.Pool {
  if (!dbConfigured()) {
    throw new Error('CHANNEL_MANAGER_DB_* env vars are not configured')
  }
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_POOL_SIZE || 20),
      connectTimeout: 15_000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10_000,
    })
  }
  return pool
}

export async function query<T extends mysql.RowDataPacket[]>(
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const [rows] = await getPool().query<T>(sql, params)
  return rows
}
