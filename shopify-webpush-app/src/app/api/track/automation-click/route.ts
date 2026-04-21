import { NextResponse } from 'next/server';

import { trackAutomationClick } from '@/lib/server/data/store';
import { parseShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const resolveTargetUrl = (target: string, shopDomain: string): URL | null => {
  try {
    const absolute = new URL(target);
    if (!/^https?:$/i.test(absolute.protocol)) {
      return null;
    }
    return absolute;
  } catch {
    try {
      const relative = new URL(target, `https://${shopDomain}`);
      if (!/^https?:$/i.test(relative.protocol)) {
        return null;
      }
      return relative;
    } catch {
      return null;
    }
  }
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ruleKey = url.searchParams.get('r');
    const shop = url.searchParams.get('s');
    const target = url.searchParams.get('u');
    const externalId = url.searchParams.get('e');
    const noRedirect = url.searchParams.get('nr') === '1';

    if (!ruleKey || !shop || !target) {
      return NextResponse.json({ ok: false, error: 'Missing automation click-tracking parameters.' }, { status: 400 });
    }

    const shopDomain = parseShopDomain(shop);
    const targetUrl = resolveTargetUrl(target, shopDomain);
    if (!targetUrl) {
      return NextResponse.json({ ok: false, error: 'Invalid target URL.' }, { status: 400 });
    }

    const forwardedFor = request.headers.get('x-forwarded-for');
    const ipAddress = forwardedFor ? forwardedFor.split(',')[0]?.trim() : null;

    await trackAutomationClick({
      ruleKey: ruleKey as Parameters<typeof trackAutomationClick>[0]['ruleKey'],
      shopDomain,
      targetUrl: targetUrl.toString(),
      externalId,
      userAgent: request.headers.get('user-agent'),
      ipAddress,
      referrer: request.headers.get('referer'),
    });

    if (noRedirect) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.redirect(targetUrl, { status: 307 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to track automation click.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}