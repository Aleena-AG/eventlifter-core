import { notFound } from 'next/navigation'
import { isValidWebhookLogToken, listWebhookLogs } from '@/lib/server/webhook-log'
import { WebhookLogsViewer } from './WebhookLogsViewer'

export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ token: string }>
}

export default async function WebhookLogsPage({ params }: PageProps) {
  const { token } = await params
  if (!isValidWebhookLogToken(token)) notFound()

  const logs = await listWebhookLogs(150)
  return <WebhookLogsViewer token={token} initialLogs={logs} />
}
