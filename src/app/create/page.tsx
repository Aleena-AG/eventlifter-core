'use client'

import { useRouter } from 'next/navigation'
import { EwentcastWizard } from '@/components/ewentcast/EwentcastWizard'
import { markEventsListStale } from '@/lib/channel-data-sync'
import './ewentcast.css'

export default function CreatePage() {
  const router = useRouter()

  return (
    <div className="ew-page-shell">
      <EwentcastWizard
        onDone={() => {
          markEventsListStale()
          router.push('/events')
        }}
      />
    </div>
  )
}
