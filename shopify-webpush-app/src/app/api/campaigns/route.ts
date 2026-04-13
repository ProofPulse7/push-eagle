import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createCampaign, listCampaigns } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

const createCampaignSchema = z.object({
  shopDomain: z.string().optional(),
  title: z.string().min(1),
  body: z.string().min(1),
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

export async function GET(request: Request) {
  try {
    const shopDomain = extractShopDomain(request);
    const campaigns = await listCampaigns(shopDomain);
    return NextResponse.json({ ok: true, campaigns });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list campaigns.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = createCampaignSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const campaign = await createCampaign({
      shopDomain,
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

    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create campaign.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
