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
  maxDisplaysPerSession: z.coerce.number().int().min(1).max(10).optional(),
  hideForDays: z.coerce.number().int().min(1).max(30).optional(),
  desktopPosition: z.enum(['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']).optional(),
  mobilePosition: z.enum(['top', 'bottom']).optional(),
  placementPreset: z.enum(['balanced', 'safe-left', 'safe-right', 'safe-top', 'safe-bottom']).optional(),
  offsetX: z.coerce.number().int().min(-240).max(240).optional(),
  offsetY: z.coerce.number().int().min(-240).max(240).optional(),
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
    const hasFullPayload =
      body.promptType !== undefined &&
      body.title !== undefined &&
      body.message !== undefined &&
      body.allowText !== undefined &&
      body.allowBgColor !== undefined &&
      body.allowTextColor !== undefined &&
      body.laterText !== undefined &&
      body.logoUrl !== undefined &&
      body.desktopDelaySeconds !== undefined &&
      body.mobileDelaySeconds !== undefined &&
      body.maxDisplaysPerSession !== undefined &&
      body.hideForDays !== undefined &&
      body.desktopPosition !== undefined &&
      body.mobilePosition !== undefined &&
      body.placementPreset !== undefined &&
      body.offsetX !== undefined &&
      body.offsetY !== undefined;

    const settings = hasFullPayload
      ? await updateOptInSettings({
          shopDomain,
          promptType: body.promptType,
          title: body.title,
          message: body.message,
          allowText: body.allowText,
          allowBgColor: body.allowBgColor,
          allowTextColor: body.allowTextColor,
          laterText: body.laterText,
          logoUrl: body.logoUrl,
          desktopDelaySeconds: body.desktopDelaySeconds,
          mobileDelaySeconds: body.mobileDelaySeconds,
          maxDisplaysPerSession: body.maxDisplaysPerSession,
          hideForDays: body.hideForDays,
          desktopPosition: body.desktopPosition,
          mobilePosition: body.mobilePosition,
          placementPreset: body.placementPreset,
          offsetX: body.offsetX,
          offsetY: body.offsetY,
        })
      : await (async () => {
          const current = await getOptInSettings(shopDomain);
          return updateOptInSettings({
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
          });
        })();

    return NextResponse.json({ ok: true, shopDomain, ...settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update opt-in settings.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}