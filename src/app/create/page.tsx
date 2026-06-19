import { redirect } from 'next/navigation'

export default function CreatePage() {
  redirect('/events?create=1')
}
