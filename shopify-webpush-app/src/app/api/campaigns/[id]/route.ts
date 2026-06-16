import { NextResponse } from 'next/server';
import { z } from 'zod';

import { invalidateShopDashboardCaches } from '@/lib/server/cache/api-kv-cache';
import { deleteCampaign, getCampaignById, updateCampaign } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const updateCampaignSchema = z.object({
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
  status: z.enum(['draft', 'scheduled', 'sent']).optional(),
  scheduledAt: z.string().optional().nullable(),
});

const deleteCampaignSchema = z.object({
  shopDomain: z.string().optional(),
});

export async function GET(request: Request, context: { params: { id: string } }) {
  try {
    const shopDomain = extractShopDomain(request);
    const campaign = await getCampaignById(shopDomain, context.params.id);

    if (!campaign) {
      return NextResponse.json({ ok: false, error: 'Campaign not found.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaign.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  try {
    const body = updateCampaignSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const campaign = await updateCampaign({
      shopDomain,
      campaignId: context.params.id,
      title: body.title,
      body: body.body,
      targetUrl: body.targetUrl,
      iconUrl: body.iconUrl,
      imageUrl: body.imageUrl,
      windowsImageUrl: body.windowsImageUrl,
      macosImageUrl: body.macosImageUrl,
      androidImageUrl: body.androidImageUrl,
      actionButtons: body.actionButtons,
      segmentId: body.segmentId,
      status: body.status,
      scheduledAt: body.scheduledAt,
    });

    void invalidateShopDashboardCaches(shopDomain);

    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update campaign.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: { id: string } }) {
  try {
    const body = deleteCampaignSchema.parse(await request.json().catch(() => ({})));
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const result = await deleteCampaign(shopDomain, context.params.id);

    void invalidateShopDashboardCaches(shopDomain);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete campaign.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
