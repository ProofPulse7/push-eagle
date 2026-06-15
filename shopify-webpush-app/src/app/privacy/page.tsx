import { LEGAL_LINKS } from '@/lib/client/legal-links';
import { LegalPageShell } from '@/components/legal/legal-page-shell';

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell
      eyebrow="Legal"
      title="Privacy Policy"
      updated="June 2026"
      alternateHref={LEGAL_LINKS.termsOfService}
      alternateLabel="Read terms of service"
    >
      <p>
        Push Eagle (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) provides web push notification software for Shopify
        merchants. This Privacy Policy explains what we collect, why we collect it, how long we keep it, and the
        choices you have when you install and use Push Eagle.
      </p>

      <h2>Who this policy applies to</h2>
      <p>
        This policy applies to merchants who install Push Eagle on a Shopify store and to the end customers whose
        devices may receive notifications after opting in on the merchant&apos;s storefront.
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Merchant account data</strong> from Shopify, including store domain, store name, contact email,
          timezone, and granted app permissions.
        </li>
        <li>
          <strong>Subscriber data</strong> collected on the storefront after consent, such as push notification tokens,
          browser type, locale, country, page activity, and campaign interaction events.
        </li>
        <li>
          <strong>App usage data</strong> you create inside Push Eagle, including campaigns, automations, segments,
          delivery logs, and analytics summaries.
        </li>
        <li>
          <strong>Shopify commerce data</strong> received through webhooks and APIs for attribution and automation
          triggers, such as order totals, product identifiers, checkout activity, inventory changes, and fulfillment
          status.
        </li>
      </ul>

      <h2>How we use information</h2>
      <p>We use collected data only to operate, secure, and improve Push Eagle, including to:</p>
      <ul>
        <li>Deliver manual and automated web push notifications.</li>
        <li>Measure impressions, clicks, conversions, and campaign performance.</li>
        <li>Maintain billing, plan limits, and customer support.</li>
        <li>Detect abuse, prevent fraud, and keep the service reliable.</li>
      </ul>
      <p>We do not sell merchant or buyer personal data.</p>

      <h2>Legal bases and merchant responsibilities</h2>
      <p>
        Merchants are responsible for providing appropriate notice and obtaining valid consent before collecting push
        subscribers. Push Eagle supplies opt-in tools and settings, but each merchant must comply with applicable
        privacy, marketing, and consumer protection laws in the regions where they operate.
      </p>

      <h2>Data sharing and subprocessors</h2>
      <p>
        We use trusted infrastructure and service providers to host and deliver Push Eagle, including Shopify, Vercel,
        Neon, Cloudflare, Firebase/Google Cloud, and email/support tooling. These providers process data on our
        instructions and only as needed to provide the service.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        We retain merchant and subscriber data while the app remains installed and as needed to provide the service.
        When a merchant uninstalls Push Eagle, we mark the store as uninstalled and stop processing new subscriber or
        order data. Shopify mandatory GDPR webhooks trigger customer redaction and shop data deletion according to
        Shopify&apos;s compliance requirements.
      </p>

      <h2>Security</h2>
      <p>
        We use industry-standard safeguards such as encrypted transport, access controls, scoped API permissions, and
        isolated merchant data storage. No method of transmission or storage is completely secure, but we work to protect
        data against unauthorized access, alteration, or disclosure.
      </p>

      <h2>International transfers</h2>
      <p>
        Push Eagle may process data in the United States and other countries where our infrastructure providers operate.
        We take steps designed to ensure an appropriate level of protection wherever data is processed.
      </p>

      <h2>Your rights and requests</h2>
      <p>
        Depending on your location, you may have rights to access, correct, delete, or restrict certain processing of
        personal data. Merchants can contact us using the details below. End-customer requests related to a specific
        Shopify store should generally be directed to that merchant, who may also receive Shopify GDPR redaction
        requests on the customer&apos;s behalf.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we do, we will revise the &quot;Last updated&quot;
        date above. Material changes may also be communicated inside the app or by email where appropriate.
      </p>

      <h2>Contact us</h2>
      <p>
        Questions about privacy or data handling:{' '}
        <a href={LEGAL_LINKS.supportEmail}>support@push-eagle.com</a>
      </p>
    </LegalPageShell>
  );
}
