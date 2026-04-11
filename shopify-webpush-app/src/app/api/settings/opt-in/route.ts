import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getOptInSettings, updateOptInSettings } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const updateSchema = z.object({
  shopDomain: z.string().optional(),
  promptType: z.enum(['browser', 'custom']).default('custom'),
  title: z.string().min(1).max(120),
  message: z.string().min(1).max(300),
  allowText: z.string().min(1).max(40),
  allowBgColor: z.string().regex(/^#([0-9a-fA-F]{6})$/),
  allowTextColor: z.string().regex(/^#([0-9a-fA-F]{6})$/),
  laterText: z.string().min(1).max(40),
  logoUrl: z.string().nullable().optional(),
  desktopDelaySeconds: z.coerce.number().int().min(0).max(60),
  mobileDelaySeconds: z.coerce.number().int().min(0).max(60),
  maxDisplaysPerSession: z.coerce.number().int().min(1).max(10),
  hideForDays: z.coerce.number().int().min(1).max(30),
  desktopPosition: z.enum(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']),
  mobilePosition: z.enum(['top', 'bottom']),
});

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const settings = await getOptInSettings(shopDomain);
    return NextResponse.json({ ok: true, shopDomain, ...settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch opt-in settings.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = updateSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const settings = await updateOptInSettings({
      shopDomain,
      promptType: body.promptType,
      title: body.title,
      message: body.message,
      allowText: body.allowText,
      allowBgColor: body.allowBgColor,
      allowTextColor: body.allowTextColor,
      laterText: body.laterText,
      logoUrl: body.logoUrl ?? null,
      desktopDelaySeconds: body.desktopDelaySeconds,
      mobileDelaySeconds: body.mobileDelaySeconds,
      maxDisplaysPerSession: body.maxDisplaysPerSession,
      hideForDays: body.hideForDays,
      desktopPosition: body.desktopPosition,
      mobilePosition: body.mobilePosition,
    });

    return NextResponse.json({ ok: true, shopDomain, ...settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update opt-in settings.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}