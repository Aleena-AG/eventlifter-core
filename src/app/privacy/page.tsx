import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'

export const metadata: Metadata = {
  title: 'Privacy Policy — Ewentcast',
  description: 'How Ewentcast collects, uses, and protects personal information.',
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      intro="This policy explains what information Ewentcast collects, why we use it, and the choices available to you."
    >
      <section>
        <h2>1. Information we collect</h2>
        <p>We collect information you provide when you create or manage an account, including your name, email address, organization details, and account preferences.</p>
        <p>When you connect event platforms, we process event, ticket, booking, and attendee information needed to provide the service. Connected-platform credentials and access tokens are used only to perform authorized actions.</p>
      </section>

      <section>
        <h2>2. How we use information</h2>
        <ul>
          <li>To create, publish, update, and synchronize events across connected channels.</li>
          <li>To display bookings, attendee information, ticket availability, and event performance.</li>
          <li>To authenticate users, secure accounts, provide support, and communicate service updates.</li>
          <li>To monitor reliability, prevent misuse, troubleshoot errors, and improve Ewentcast.</li>
          <li>To process subscriptions and comply with legal obligations.</li>
        </ul>
      </section>

      <section>
        <h2>3. Connected services</h2>
        <p>Ewentcast can connect with services such as Hightribe, Luma, and Eventbrite. Information sent to or received from those services is also governed by their privacy policies. You can disconnect a channel from Ewentcast settings.</p>
      </section>

      <section>
        <h2>4. Sharing of information</h2>
        <p>We do not sell personal information. We may share limited information with infrastructure, payment, analytics, and support providers that help operate Ewentcast. We may also disclose information when legally required or when necessary to protect users, the service, or the public.</p>
      </section>

      <section>
        <h2>5. Data retention and security</h2>
        <p>We retain information for as long as needed to provide the service, maintain legitimate business records, resolve disputes, and meet legal requirements. We use reasonable administrative, technical, and organizational safeguards, but no online service can guarantee absolute security.</p>
      </section>

      <section>
        <h2>6. Your choices and rights</h2>
        <p>Depending on your location, you may request access to, correction of, export of, or deletion of your personal information. You may also disconnect integrations or close your account. Some records may be retained where required by law or for legitimate security and accounting purposes.</p>
      </section>

      <section>
        <h2>7. Cookies and local storage</h2>
        <p>Ewentcast may use cookies and browser storage for authentication, security, preferences, and essential product functionality. We may also use limited analytics to understand service performance and usage.</p>
      </section>

      <section>
        <h2>8. Children&apos;s privacy</h2>
        <p>Ewentcast is not directed to children under 13, and we do not knowingly collect personal information from children under 13.</p>
      </section>

      <section>
        <h2>9. Changes and contact</h2>
        <p>We may update this policy as the service or legal requirements change. The date above shows the latest revision. For privacy questions or requests, contact us through the support channel provided within Ewentcast.</p>
      </section>
    </LegalPage>
  )
}
