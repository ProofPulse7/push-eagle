import { getNeonSql } from '@/lib/integrations/database/neon';
import { getShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';
import { parseShopDomain } from '@/lib/server/shop-context';

const SHOP_CONTACT_QUERY = `#graphql
  query PushEagleShopContact {
    shop {
      contactEmail
      email
    }
  }
`;

const resolveMerchantEmailFromDb = async (shopDomain: string) => {
  const sql = getNeonSql();
  const rows = await sql`
    SELECT email
    FROM merchants
    WHERE shop_domain = ${shopDomain}
    LIMIT 1
  `;

  const email = rows[0]?.email;
  return typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : null;
};

const resolveShopContactEmailFromShopify = async (shopDomain: string) => {
  const token = await getShopifyOfflineAccessToken(shopDomain);
  if (!token) {
    return null;
  }

  const response = await fetch(`https://${shopDomain}/admin/api/2025-07/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query: SHOP_CONTACT_QUERY }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    data?: { shop?: { contactEmail?: string | null; email?: string | null } };
  };

  const contact = payload.data?.shop?.contactEmail ?? payload.data?.shop?.email;
  return typeof contact === 'string' && contact.includes('@') ? contact.trim().toLowerCase() : null;
};

export const resolveShopOwnerEmail = async (shopDomainInput: string) => {
  const shopDomain = parseShopDomain(shopDomainInput);
  return (
    (await resolveShopContactEmailFromShopify(shopDomain)) ??
    (await resolveMerchantEmailFromDb(shopDomain))
  );
};

export const deliverGdprDataRequestExport = async (input: {
  shopDomain: string;
  exportId: number;
  customer: { id?: number | string; email?: string | null };
  payload: Record<string, unknown>;
}) => {
  const shopDomain = parseShopDomain(input.shopDomain);
  const recipient = await resolveShopOwnerEmail(shopDomain);
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.GDPR_EXPORT_FROM_EMAIL?.trim() || 'support@push-eagle.com';

  if (!recipient) {
    console.warn('[gdpr] customers/data_request export stored but no shop owner email found', {
      shopDomain,
      exportId: input.exportId,
    });
    return { delivered: false, reason: 'no_recipient' as const };
  }

  if (!apiKey) {
    console.info('[gdpr] customers/data_request export ready for manual delivery', {
      shopDomain,
      exportId: input.exportId,
      recipient,
    });
    return { delivered: false, reason: 'email_not_configured' as const, recipient };
  }

  const customerLabel =
    input.customer.email?.trim() ||
    (input.customer.id != null ? `customer ${input.customer.id}` : 'requested customer');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipient],
      subject: `Push Eagle GDPR data request — ${customerLabel}`,
      text: [
        'Shopify sent a customer data request for your store.',
        '',
        `Store: ${shopDomain}`,
        `Export ID: ${input.exportId}`,
        `Customer: ${customerLabel}`,
        '',
        'The exported JSON payload is attached below for your records.',
        '',
        JSON.stringify(input.payload, null, 2),
      ].join('\n'),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    console.error('[gdpr] failed to email GDPR export', {
      shopDomain,
      exportId: input.exportId,
      recipient,
      status: response.status,
      errorText,
    });
    return { delivered: false, reason: 'email_failed' as const, recipient };
  }

  return { delivered: true, recipient };
};
