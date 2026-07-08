'use client'

import { useRouter } from 'next/navigation'
import { EwentcastWizard } from '@/components/ewentcast/EwentcastWizard'
import './ewentcast.css'

export default function CreatePage() {
  const router = useRouter()

  return (
    <div className="ew-page-shell">
      <EwentcastWizard onDone={() => router.push('/events')} />
    </div>
  )
}
