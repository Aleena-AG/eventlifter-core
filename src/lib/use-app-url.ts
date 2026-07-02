'use client'

import { useEffect, useState } from 'react'
import { getAppUrl } from '@/lib/app-url'

/** Current site origin in the browser; matches the URL bar (ewentcast.com, local .test, etc.). */
export function useAppUrl(): string {
  const [appUrl, setAppUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.origin.replace(/\/$/, '')
    }
    return getAppUrl()
  })

  useEffect(() => {
    setAppUrl(window.location.origin.replace(/\/$/, ''))
  }, [])

  return appUrl
}

export function useEventbriteRedirectUri(): string {
  const appUrl = useAppUrl()
  return `${appUrl}/api/eventbrite/callback`
}
