import { createHmac, timingSafeEqual } from 'crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { env } from '@/lib/config/env';
import { upsertShopifyCustomer } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const customerSchema = z.object({
  customerId: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
});

const bodySchema = z.object({
  shopDomain: z.string(),
  ts: z.coerce.number().int(),
  customers: z.array(customerSchema).max(200),
});

const MAX_AGE_MS = 5 * 60 * 1000;

const secureEqualHex = (a: string, b: string) => {
  const aBuffer = Buffer.from(a, 'hex');
  const bBuffer = Buffer.from(b, 'hex');
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
};

const verifySignature = (shopDomain: string, ts: number, signature: string) => {
  const secret = env.SHOPIFY_DASHBOARD_SSO_SECRET || env.SHOPIFY_API_SECRET;
  if (!secret) {
    return false;
  }

  const age = Math.abs(Date.now() - ts);
  if (age > MAX_AGE_MS) {
    return false;
  }

  const expected = createHmac('sha256', secret).update(`${shopDomain}.${ts}`).digest('hex');
  return secureEqualHex(expected, signature);
};

const isTrustedRootSource = (request: Request, ts: number) => {
  const age = Math.abs(Date.now() - ts);
  if (age > MAX_AGE_MS) {
    return false;
  }

  const configuredRoot = env.SHOPIFY_ROOT_APP_URL?.trim() || 'https://push-eagle.vercel.app';
  const sourceHeader = request.headers.get('x-push-eagle-source')?.trim();
  return Boolean(sourceHeader) && sourceHeader === configuredRoot;
};

export async function POST(request: Request) {
  try {
    const signature = request.headers.get('x-push-eagle-signature') || '';
    const parsed = bodySchema.parse(await request.json());
    const shopDomain = parseShopDomain(parsed.shopDomain);

    const validSignature = verifySignature(shopDomain, parsed.ts, signature);
    const trustedSource = isTrustedRootSource(request, parsed.ts);

    if (!validSignature && !trustedSource) {
      return NextResponse.json({ ok: false, error: 'Invalid signature.' }, { status: 401 });
    }

    for (const customer of parsed.customers) {
      await upsertShopifyCustomer({
        shopDomain,
        customerId: customer.customerId ?? null,
        email: customer.email ?? null,
        firstName: customer.firstName ?? null,
        lastName: customer.lastName ?? null,
      });
    }

    return NextResponse.json({ ok: true, shopDomain, synced: parsed.customers.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync customers.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
