import Link from 'next/link';

import { LEGAL_LINKS } from '@/lib/client/legal-links';

export default function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 prose prose-neutral dark:prose-invert">
      <h1>Push Eagle Terms of Service</h1>
      <p>Last updated: June 2026</p>
      <p>
        By installing or using Push Eagle, you agree to these terms on behalf of your Shopify store. If you do not
        agree, do not use the app.
      </p>
      <h2>Service</h2>
      <p>
        Push Eagle lets merchants collect web push subscribers, send campaigns and automations, and measure
        performance. Features may vary by plan and are subject to fair-use impression limits.
      </p>
      <h2>Billing</h2>
      <p>
        Paid plans are billed through the Shopify Billing API. You can upgrade, downgrade, or cancel according to
        Shopify&apos;s subscription management tools.
      </p>
      <h2>Acceptable use</h2>
      <p>
        You are responsible for message content, consent, and compliance with applicable laws including marketing and
        privacy regulations in your jurisdictions.
      </p>
      <h2>Availability</h2>
      <p>
        We strive for reliable delivery but do not guarantee uninterrupted service. Browser and device limitations may
        affect subscriber reach.
      </p>
      <h2>Termination</h2>
      <p>
        You may uninstall the app at any time from Shopify Admin. We may suspend service for abuse, non-payment, or
        violations of these terms.
      </p>
      <h2>Contact</h2>
      <p>
        Support: <a href={LEGAL_LINKS.supportEmail}>support@push-eagle.com</a>
      </p>
      <p>
        <Link href={LEGAL_LINKS.privacyPolicy}>Privacy policy</Link>
      </p>
    </main>
  );
}
