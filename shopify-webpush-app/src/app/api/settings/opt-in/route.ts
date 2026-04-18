import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getOptInSettings, updateOptInSettings } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const updateSchema = z.object({
  shopDomain: z.string().optional(),
  promptType: z.enum(['browser', 'custom']).optional(),
  title: z.string().min(1).max(120).optional(),
  message: z.string().min(1).max(300).optional(),
  allowText: z.string().min(1).max(40).optional(),
  allowBgColor: z.string().regex(/^#([0-9a-fA-F]{6})$/).optional(),
  allowTextColor: z.string().regex(/^#([0-9a-fA-F]{6})$/).optional(),
  laterText: z.string().min(1).max(40).optional(),
  logoUrl: z.string().nullable().optional(),
  desktopDelaySeconds: z.coerce.number().int().min(0).max(60).optional(),
  mobileDelaySeconds: z.coerce.number().int().min(0).max(60).optional(),
  maxDisplaysPerSession: z.coerce.number().int().min(1).max(20).optional(),
  hideForDays: z.coerce.number().int().min(1).max(30).optional(),
  desktopPosition: z.enum(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']).optional(),
  mobilePosition: z.enum(['top', 'bottom']).optional(),
  placementPreset: z.enum(['balanced', 'safe-left', 'safe-right', 'safe-top', 'safe-bottom']).optional(),
  offsetX: z.coerce.number().int().min(-240).max(240).optional(),
  offsetY: z.coerce.number().int().min(-240).max(240).optional(),
  iosWidgetEnabled: z.boolean().optional(),
  iosWidgetTitle: z.string().min(1).max(120).optional(),
  iosWidgetMessage: z.string().min(1).max(300).optional(),
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
    const current = await getOptInSettings(shopDomain);
    const settings = await updateOptInSettings({
      shopDomain,
      promptType: body.promptType ?? current.promptType,
      title: body.title ?? current.title,
      message: body.message ?? current.message,
      allowText: body.allowText ?? current.allowText,
      allowBgColor: body.allowBgColor ?? current.allowBgColor,
      allowTextColor: body.allowTextColor ?? current.allowTextColor,
      laterText: body.laterText ?? current.laterText,
      logoUrl: body.logoUrl === undefined ? current.logoUrl : body.logoUrl,
      desktopDelaySeconds: body.desktopDelaySeconds ?? current.desktopDelaySeconds,
      mobileDelaySeconds: body.mobileDelaySeconds ?? current.mobileDelaySeconds,
      maxDisplaysPerSession: body.maxDisplaysPerSession ?? current.maxDisplaysPerSession,
      hideForDays: body.hideForDays ?? current.hideForDays,
      desktopPosition: body.desktopPosition ?? current.desktopPosition,
      mobilePosition: body.mobilePosition ?? current.mobilePosition,
      placementPreset: body.placementPreset ?? current.placementPreset,
      offsetX: body.offsetX ?? current.offsetX,
      offsetY: body.offsetY ?? current.offsetY,
      iosWidgetEnabled: body.iosWidgetEnabled ?? current.iosWidgetEnabled,
      iosWidgetTitle: body.iosWidgetTitle ?? current.iosWidgetTitle,
      iosWidgetMessage: body.iosWidgetMessage ?? current.iosWidgetMessage,
    });

    return NextResponse.json({ ok: true, shopDomain, ...settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update opt-in settings.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}