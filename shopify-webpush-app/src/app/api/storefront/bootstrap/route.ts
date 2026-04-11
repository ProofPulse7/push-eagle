import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { verifyShopifyAppProxySignature } from '@/lib/integrations/shopify/verify';
import { getOptInSettings } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';
import { getAnonymousExternalId, getCustomerExternalId } from '@/lib/server/storefront-identity';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    if (!verifyShopifyAppProxySignature(url.searchParams)) {
      return NextResponse.json({ ok: false, error: 'Invalid Shopify app proxy signature.' }, { status: 401 });
    }

    const shopDomain = parseShopDomain(url.searchParams.get('shop'));
    const cookieStore = await cookies();
    const cookieName = `pe_ext_${shopDomain.replace(/[^a-z0-9]/gi, '_')}`;

    const customerExternalId = getCustomerExternalId({
      customerId: url.searchParams.get('logged_in_customer_id'),
      email: url.searchParams.get('logged_in_customer_email'),
    });

    const optIn = await getOptInSettings(shopDomain);

    const existingCookieId = cookieStore.get(cookieName)?.value ?? null;
    const externalId = customerExternalId ?? existingCookieId ?? getAnonymousExternalId();

    const response = NextResponse.json({
      ok: true,
      shopDomain,
      externalId,
      tokenEndpoint: '/apps/push-eagle/token',
      conversionEndpoint: `${env.NEXT_PUBLIC_APP_URL}/api/storefront/conversion`,
      optIn,
      firebase: {
        apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
        measurementId: env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
        vapidKey: env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      },
    });

    response.cookies.set(cookieName, externalId, {
      httpOnly: false,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to bootstrap storefront session.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
