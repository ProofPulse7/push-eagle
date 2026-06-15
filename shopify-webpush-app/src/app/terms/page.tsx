import { LEGAL_LINKS } from '@/lib/client/legal-links';
import { LegalPageShell } from '@/components/legal/legal-page-shell';

export default function TermsOfServicePage() {
  return (
    <LegalPageShell
      eyebrow="Legal"
      title="Terms of Service"
      updated="June 2026"
      alternateHref={LEGAL_LINKS.privacyPolicy}
      alternateLabel="Read privacy policy"
    >
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of Push Eagle. By installing,
        accessing, or using Push Eagle through Shopify, you agree to these Terms on behalf of your store and the
        organization that operates it.
      </p>

      <h2>The service</h2>
      <p>
        Push Eagle helps Shopify merchants collect web push subscribers, send campaigns and automations, segment
        audiences, and measure notification performance. Features, limits, and availability may vary by plan and are
        subject to fair use and platform constraints.
      </p>

      <h2>Eligibility and account security</h2>
      <p>
        You must have authority to bind your Shopify store to these Terms. You are responsible for maintaining the
        security of your Shopify account, app permissions, and any credentials used to access Push Eagle.
      </p>

      <h2>Plans, billing, and impressions</h2>
      <p>
        Paid plans are billed through the Shopify Billing API unless otherwise agreed in writing. Free and paid plans
        include monthly impression limits that reset on a recurring billing cycle. Upgrades, downgrades, and
        cancellations are handled through Shopify subscription management and in-app plan selection. You are
        responsible for reviewing and approving charges in Shopify when required.
      </p>

      <h2>Acceptable use</h2>
      <p>You agree not to use Push Eagle to:</p>
      <ul>
        <li>Send unlawful, deceptive, abusive, or spammy notifications.</li>
        <li>Collect subscribers without appropriate notice and consent.</li>
        <li>Interfere with the service, other merchants, or Shopify systems.</li>
        <li>Reverse engineer, resell, or misuse the service except as permitted by law.</li>
      </ul>
      <p>
        You remain solely responsible for the content of your messages and for compliance with applicable marketing,
        privacy, and consumer protection laws.
      </p>

      <h2>Third-party services</h2>
      <p>
        Push Eagle integrates with Shopify and other providers such as browser push infrastructure and hosting
        platforms. Your use of those services may also be subject to their terms and policies.
      </p>

      <h2>Availability and support</h2>
      <p>
        We aim to provide reliable delivery and responsive support, but Push Eagle is provided on an &quot;as
        available&quot; basis. Browser, device, and operating system limitations may affect subscriber reach, delivery
        timing, and analytics accuracy. Scheduled maintenance, third-party outages, or force majeure events may cause
        interruptions.
      </p>

      <h2>Intellectual property</h2>
      <p>
        Push Eagle, including its software, branding, and documentation, remains our property or that of our licensors.
        You retain ownership of your store content, subscriber lists, and campaign materials. You grant us the rights
        necessary to host, process, and transmit that content solely to provide the service.
      </p>

      <h2>Suspension and termination</h2>
      <p>
        You may uninstall Push Eagle at any time from Shopify Admin. We may suspend or terminate access if you violate
        these Terms, create security or legal risk, fail to pay applicable charges, or misuse the service. Upon
        termination, your right to use Push Eagle ends, subject to any data retention or deletion obligations described
        in our Privacy Policy.
      </p>

      <h2>Disclaimer of warranties</h2>
      <p>
        To the fullest extent permitted by law, Push Eagle is provided without warranties of any kind, whether express
        or implied, including implied warranties of merchantability, fitness for a particular purpose, and
        non-infringement.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, we will not be liable for any indirect, incidental, special,
        consequential, or punitive damages, or for lost profits, revenue, data, or goodwill. Our total liability for
        any claim arising out of these Terms or the service will not exceed the fees paid by you to us for Push Eagle
        in the twelve months before the event giving rise to the claim.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. If we make material changes, we will update the date above and may
        provide additional notice inside the app or by email. Continued use after changes become effective constitutes
        acceptance of the revised Terms.
      </p>

      <h2>Contact</h2>
      <p>
        Support and legal inquiries: <a href={LEGAL_LINKS.supportEmail}>support@push-eagle.com</a>
      </p>
    </LegalPageShell>
  );
}
