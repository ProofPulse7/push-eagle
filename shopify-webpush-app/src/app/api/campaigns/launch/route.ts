import { NextResponse } from 'next/server';
import { z } from 'zod';

import { invalidateShopDashboardCaches } from '@/lib/server/cache/api-kv-cache';
import { startCampaignDelivery } from '@/lib/server/campaigns/campaign-send-queue';
import { createCampaign } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';
export const maxDuration = 300;

const launchSchema = z.object({
  shopDomain: z.string().optional(),
  title: z.string().min(1),
  body: z.string().default(''),
  targetUrl: z.string().optional().nullable(),
  iconUrl: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  windowsImageUrl: z.string().optional().nullable(),
  macosImageUrl: z.string().optional().nullable(),
  androidImageUrl: z.string().optional().nullable(),
  actionButtons: z.array(z.object({ title: z.string().min(1), link: z.string().min(1) })).max(2).optional(),
  segmentId: z.string().optional().nullable(),
  scheduledAt: z.string().optional().nullable(),
  sendingOption: z.enum(['now', 'schedule', 'recurring']).default('now'),
});

export async function POST(request: Request) {
  try {
    const body = launchSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const segmentId = body.segmentId?.trim() ? body.segmentId.trim() : 'all';

    const campaign = await createCampaign({
      shopDomain,
      title: body.title,
      body: body.body?.trim() ? body.body : ' ',
      targetUrl: body.targetUrl,
      iconUrl: body.iconUrl,
      imageUrl: body.imageUrl,
      windowsImageUrl: body.windowsImageUrl,
      macosImageUrl: body.macosImageUrl,
      androidImageUrl: body.androidImageUrl,
      actionButtons: body.actionButtons,
      segmentId,
      status: body.sendingOption === 'schedule' ? 'scheduled' : 'draft',
      scheduledAt: body.sendingOption === 'schedule' ? body.scheduledAt : null,
    });

    const campaignId = String((campaign as { id?: unknown }).id ?? '');
    if (!campaignId) {
      throw new Error('Failed to create campaign record.');
    }

    if (body.sendingOption !== 'now') {
      void invalidateShopDashboardCaches(shopDomain);
      return NextResponse.json({
        ok: true,
        campaign,
        campaignId,
        launched: false,
      });
    }

    const delivery = await startCampaignDelivery(shopDomain, campaignId);
    void invalidateShopDashboardCaches(shopDomain);

    return NextResponse.json({
      ok: true,
      campaign,
      campaignId,
      launched: true,
      queued: true,
      status: 'sending',
      delivery,
      message: 'Campaign queued for scalable background delivery.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to launch campaign.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
