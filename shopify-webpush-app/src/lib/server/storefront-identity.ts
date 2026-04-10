import { createHash, randomUUID } from 'crypto';

export const getCustomerExternalId = ({ customerId, email }: { customerId?: string | null; email?: string | null }) => {
  if (customerId) {
    return `shopify_customer:${customerId}`;
  }

  if (email) {
    const normalizedEmail = email.trim().toLowerCase();
    const digest = createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 24);
    return `email:${digest}`;
  }

  return null;
};

export const getAnonymousExternalId = () => `anon:${randomUUID().replace(/-/g, '')}`;
