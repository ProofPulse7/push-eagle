import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getAttributionSettings, updateAttributionSettings } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const updateSchema = z.object({
  shopDomain: z.string().optional(),
  attributionModel: z.enum(['click', 'impression']),
  clickWindowDays: z.coerce.number().int().min(1).max(30),
  impressionWindowDays: z.coerce.number().int().min(1).max(30),
});

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const settings = await getAttributionSettings(shopDomain);
    return NextResponse.json({ ok: true, shopDomain, ...settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch attribution settings.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = updateSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const settings = await updateAttributionSettings({
      shopDomain,
      attributionModel: body.attributionModel,
      clickWindowDays: body.clickWindowDays,
      impressionWindowDays: body.impressionWindowDays,
    });

    return NextResponse.json({ ok: true, shopDomain, ...settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update attribution settings.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
