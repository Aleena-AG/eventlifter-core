import { loadSettings } from '@/app/api/settings/route'

export function getHtApiBase(): string {
  const s = loadSettings()
  const fromSettings = s.hightribe.serviceUrl?.replace(/\/$/, '')
  const fromEnv = process.env.HT_API_BASE?.replace(/\/$/, '')
  const base = fromSettings || fromEnv || 'https://api.hightribe.com'
  return `${base}/api`
}
