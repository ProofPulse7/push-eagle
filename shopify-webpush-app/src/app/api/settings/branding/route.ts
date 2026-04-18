import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getBrandingSettings, updateBrandingSettings } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const updateSchema = z.object({
  shopDomain: z.string().optional(),
  logoUrl: z.string().nullable(),
});

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const settings = await getBrandingSettings(shopDomain);
    return NextResponse.json({ ok: true, shopDomain, ...settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch branding settings.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = updateSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const settings = await updateBrandingSettings({
      shopDomain,
      logoUrl: body.logoUrl,
    });

    return NextResponse.json({ ok: true, shopDomain, ...settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update branding settings.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
