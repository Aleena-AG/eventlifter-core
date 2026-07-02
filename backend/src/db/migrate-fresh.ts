import { runFreshMigrations } from './migrate'

const seed = process.argv.includes('--seed')

runFreshMigrations({ seed })
  .then((r) => {
    console.log(JSON.stringify({ ok: true, ...r, seeded: seed }))
    process.exit(0)
  })
  .catch((err) => {
    console.error(JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }))
    process.exit(1)
  })
