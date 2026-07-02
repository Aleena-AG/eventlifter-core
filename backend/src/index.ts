import cors from 'cors'
import express from 'express'
import { config, dbConfigured } from './config'
import { isEmailConfigured } from './services/email'
import { runMigrations } from './db/migrate'
import { healthRouter } from './routes/health'
import { registryRouter } from './routes/registry'
import { authRouter } from './routes/auth'
import { eventsRouter } from './routes/events'
import { settingsRouter } from './routes/settings'

const app = express()

app.use(cors({ origin: config.corsOrigin, credentials: true }))
app.use(express.json({ limit: '2mb' }))

app.use(healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/events', eventsRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/registry', registryRouter)

app.use((_req, res) => {
  res.status(404).json({ error: 'not found' })
})

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'internal error'
  res.status(500).json({ error: message })
})

async function start() {
  if (!dbConfigured()) {
    console.error('Missing CHANNEL_MANAGER_DB_* environment variables')
    process.exit(1)
  }

  const migration = await runMigrations()
  console.log(`Migrations applied: ${migration.applied.join(', ') || 'none'}; imported=${migration.imported}`)

  app.listen(config.port, () => {
    console.log(`Ewentcast backend listening on http://127.0.0.1:${config.port}`)
    console.log(
      isEmailConfigured()
        ? 'Password reset: sending via SMTP (Mailtrap/production)'
        : 'Password reset: SMTP not set — dev reset link on forgot-password page only',
    )
  })
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
