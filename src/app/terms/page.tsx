import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Terms & Conditions — Ewentcast',
  description: 'Terms governing access to and use of Ewentcast.',
}

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms & Conditions"
      intro="These terms govern your access to and use of Ewentcast. By using the service, you agree to these terms."
    >
      <section>
        <h2>1. Eligibility and accounts</h2>
        <p>You must be legally able to enter into a binding agreement and provide accurate account information. You are responsible for activity under your account and for keeping login credentials secure. Notify us promptly if you suspect unauthorized access.</p>
      </section>

      <section>
        <h2>2. The Ewentcast service</h2>
        <p>Ewentcast helps users create, publish, synchronize, and monitor events across supported third-party channels. Features, integrations, limits, and availability may change as the service evolves or as third-party platforms update their systems.</p>
      </section>

      <section>
        <h2>3. Connected platforms</h2>
        <p>You authorize Ewentcast to access connected platforms and perform actions you request, including creating or updating events and retrieving bookings. Your use of Hightribe, Luma, Eventbrite, and other connected services remains subject to their own terms and policies.</p>
        <p>We are not responsible for third-party outages, API changes, account restrictions, content removal, fees, or decisions made by a connected platform.</p>
      </section>

      <section>
        <h2>4. Your content and responsibilities</h2>
        <p>You retain ownership of event descriptions, images, attendee information, and other content you submit. You grant Ewentcast the limited rights needed to host, process, transform, and transmit that content to provide the service.</p>
        <ul>
          <li>You must have the rights and permissions required to use and publish your content.</li>
          <li>You must comply with applicable privacy, marketing, ticketing, consumer, and event laws.</li>
          <li>You are responsible for event accuracy, attendee communications, refunds, cancellations, taxes, and fulfilment.</li>
          <li>You must not use Ewentcast for unlawful, fraudulent, harmful, or abusive activity.</li>
        </ul>
      </section>

      <section>
        <h2>5. Subscriptions and payment</h2>
        <p>Paid plans are billed according to the pricing and billing cycle shown at purchase. Unless stated otherwise, subscriptions renew automatically until cancelled. Fees are generally non-refundable except where required by law or expressly stated in an applicable offer.</p>
      </section>

      <section>
        <h2>6. Service availability</h2>
        <p>We aim to provide a reliable service but do not guarantee uninterrupted or error-free operation. Event synchronization may be delayed or fail because of network conditions, third-party APIs, permissions, rate limits, or invalid data. You should verify important event details on each connected channel.</p>
      </section>

      <section>
        <h2>7. Suspension and termination</h2>
        <p>You may stop using Ewentcast at any time. We may suspend or terminate access where necessary to address non-payment, security risks, legal requirements, harmful conduct, or material violations of these terms. Provisions that should reasonably survive termination will remain in effect.</p>
      </section>

      <section>
        <h2>8. Disclaimers and limitation of liability</h2>
        <p>To the extent permitted by law, Ewentcast is provided “as is” and “as available,” without warranties of merchantability, fitness for a particular purpose, or non-infringement.</p>
        <p>To the extent permitted by law, Ewentcast will not be liable for indirect, incidental, special, consequential, or punitive damages, lost profits, lost data, missed bookings, overselling caused by third-party delays, or business interruption.</p>
      </section>

      <section>
        <h2>9. Changes and contact</h2>
        <p>We may update these terms to reflect service, business, or legal changes. Continued use after updated terms take effect constitutes acceptance. For questions, contact us through the support channel provided within Ewentcast.</p>
      </section>
    </LegalPage>
  )
}
