import type { Metadata } from 'next'
import { Bricolage_Grotesque, Inter } from 'next/font/google'
import './globals.css'
import { ClientLayout } from '@/components/ClientLayout'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Ewentcast — Get booked everywhere. Oversold nowhere.',
  description: 'Publish events to Eventbrite, Luma, and HighTribe at once. Keep capacity in sync across all channels.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable}`} style={{ height: '100%' }} suppressHydrationWarning>
      <body className={inter.className} style={{ height: '100%', margin: 0, display: 'flex' }} suppressHydrationWarning>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}
