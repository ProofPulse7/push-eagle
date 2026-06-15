import Link from 'next/link';

import { LEGAL_LINKS } from '@/lib/client/legal-links';

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 prose prose-neutral dark:prose-invert">
      <h1>Push Eagle Privacy Policy</h1>
      <p>Last updated: June 2026</p>
      <p>
        Push Eagle (&quot;we&quot;, &quot;our&quot;, &quot;us&quot;) provides web push notification software for Shopify
        merchants. This policy explains how we collect, use, store, and delete data when you install and use Push
        Eagle.
      </p>
      <h2>Data we process</h2>
      <ul>
        <li>Shop and merchant account information from Shopify (store name, domain, contact email, granted scopes).</li>
        <li>Subscriber device tokens and optional browser, locale, country, and activity signals from your storefront.</li>
        <li>Campaign, automation, segment, and delivery records created inside the app.</li>
        <li>Order and product metadata received from Shopify webhooks for attribution and automation triggers.</li>
      </ul>
      <h2>How we use data</h2>
      <p>
        We use this data only to operate Push Eagle: deliver notifications, measure performance, run automations,
        provide support, and maintain billing. We do not sell merchant or buyer personal data.
      </p>
      <h2>Data retention and deletion</h2>
      <p>
        When you uninstall the app, we mark your store as uninstalled and stop processing new data. Shopify mandatory
        GDPR webhooks trigger customer redaction and full shop data deletion after the required retention period.
      </p>
      <h2>Subprocessors</h2>
      <p>
        We use infrastructure providers such as Vercel, Neon, Cloudflare, Firebase/Google Cloud, and Shopify APIs to
        host and deliver the service.
      </p>
      <h2>Contact</h2>
      <p>
        Questions about privacy: <a href={LEGAL_LINKS.supportEmail}>support@push-eagle.com</a>
      </p>
      <p>
        <Link href={LEGAL_LINKS.termsOfService}>Terms of service</Link>
      </p>
    </main>
  );
}
