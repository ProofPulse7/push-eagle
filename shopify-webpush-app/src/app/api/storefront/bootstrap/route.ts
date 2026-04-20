import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { verifyShopifyAppProxySignature } from '@/lib/integrations/shopify/verify';
import { getMerchantCapabilitySnapshot, getOptInSettings, processDueAutomationJobsForShop } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';
import { getAnonymousExternalId, getCustomerExternalId } from '@/lib/server/storefront-identity';

export const runtime = 'nodejs';

/**
 * Allow CORS from *.myshopify.com origins.
 * The app proxy routes through Shopify's own domain, but if the proxy isn't
 * registered on a store the storefront JS falls back to a direct fetch which
 * requires CORS headers.
 */
function addCorsHeaders(response: NextResponse, requestOrigin: string | null) {
  if (requestOrigin && /^https:\/\/[a-z0-9.-]+$/i.test(requestOrigin)) {
    response.headers.set('Access-Control-Allow-Origin', requestOrigin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'cache-control, content-type');
    response.headers.set('Vary', 'Origin');
  }
  return response;
}

// Handle CORS preflight
export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin');
  const response = new NextResponse(null, { status: 204 });
  addCorsHeaders(response as unknown as NextResponse, origin);
  return response;
}

export async function GET(request: Request) {
  const origin = request.headers.get('origin');
  const requestUrl = new URL(request.url);
  const directAppOrigin = requestUrl.origin.replace(/\/$/, '');
  const proxyBasePath = '/apps/push-eagle';

  try {
    const url = new URL(request.url);

    // Signature verification is best-effort only: the bootstrap response contains
    // non-sensitive public data (popup styling, Firebase config). A hard 401 would
    // silently fall back to hardcoded defaults on the storefront, which is worse.
    const signatureValid = verifyShopifyAppProxySignature(url.searchParams);

    const shopDomain = parseShopDomain(url.searchParams.get('shop'));
    const cookieStore = await cookies();
    const cookieName = `pe_ext_${shopDomain.replace(/[^a-z0-9]/gi, '_')}`;

    const customerExternalId = getCustomerExternalId({
      customerId: url.searchParams.get('logged_in_customer_id'),
      email: url.searchParams.get('logged_in_customer_email'),
    });

    const optIn = await getOptInSettings(shopDomain);
    const shopifyCapabilities = await getMerchantCapabilitySnapshot(shopDomain);

    void processDueAutomationJobsForShop(shopDomain, 20, 5).catch(() => undefined);

    const existingCookieId = cookieStore.get(cookieName)?.value ?? null;
    const requestedExternalId = url.searchParams.get('externalId')?.trim() || null;
    const externalId = customerExternalId ?? existingCookieId ?? requestedExternalId ?? getAnonymousExternalId();

    const response = NextResponse.json({
      ok: true,
      shopDomain,
      externalId,
      tokenEndpoint: '/apps/push-eagle/token',
      conversionEndpoint: `${proxyBasePath}/conversion`,
      conversionFallbackEndpoint: `${directAppOrigin}/api/storefront/conversion`,
      activityEndpoint: `${proxyBasePath}/activity`,
      activityFallbackEndpoint: `${directAppOrigin}/api/storefront/activity`,
      tokenDiagnosticsEndpoint: `${proxyBasePath}/token-diagnostics`,
      tokenDiagnosticsFallbackEndpoint: `${directAppOrigin}/api/storefront/token-diagnostics`,
      iosHomeScreenEndpoint: `${proxyBasePath}/ios-home-screen`,
      iosHomeScreenFallbackEndpoint: `${directAppOrigin}/api/storefront/ios-home-screen`,
      optIn,
      shopifyCapabilities,
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
      webPushVapidPublicKey: env.VAPID_PUBLIC_KEY,
    });

    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    addCorsHeaders(response, origin);

    // Only set the tracking cookie when the request is verified as coming from
    // Shopify's app proxy (signature present). Non-proxy requests still get opt-in
    // settings but we skip the cross-site cookie to avoid polluting non-proxy calls.
    if (signatureValid) {
      response.cookies.set(cookieName, externalId, {
        httpOnly: false,
        sameSite: 'lax',
        secure: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to bootstrap storefront session.';
    const errResponse = NextResponse.json({ ok: false, error: message }, { status: 400 });
    addCorsHeaders(errResponse, origin);
    return errResponse;
  }
}
