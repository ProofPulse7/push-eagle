import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getPrivacySettings, updatePrivacySettings } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const updateSchema = z.object({
  shopDomain: z.string().optional(),
  allowSupport: z.boolean(),
  ipAddressOption: z.enum(['anonymized', 'no-ip']),
  enableGeo: z.boolean(),
  enablePreferences: z.boolean(),
  emailStoreOption: z.enum(['full-email', 'hash-email', 'no-email']),
  locationStoreOption: z.enum(['yes', 'no']),
  nameStoreOption: z.enum(['yes', 'no']),
});

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const settings = await getPrivacySettings(shopDomain);
    return NextResponse.json({ ok: true, shopDomain, ...settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch privacy settings.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = updateSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const settings = await updatePrivacySettings({
      shopDomain,
      allowSupport: body.allowSupport,
      ipAddressOption: body.ipAddressOption,
      enableGeo: body.enableGeo,
      enablePreferences: body.enablePreferences,
      emailStoreOption: body.emailStoreOption,
      locationStoreOption: body.locationStoreOption,
      nameStoreOption: body.nameStoreOption,
    });

    return NextResponse.json({ ok: true, shopDomain, ...settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update privacy settings.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
