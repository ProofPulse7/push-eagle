import { NextResponse } from 'next/server';
import { z } from 'zod';

import { invalidateShopDashboardCaches } from '@/lib/server/cache/api-kv-cache';
import { deferAfterResponse } from '@/lib/server/defer-after-response';
import { getNeonSql } from '@/lib/integrations/database/neon';
import {
  countCampaignAudienceTokens,
  createCampaign,
  requeueCampaignForDelivery,
  sendCampaign,
} from '@/lib/server/data/store';
import { resolveServerCampaignMediaUrl } from '@/lib/server/media/resolve-campaign-media';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';
export const maxDuration = 300;

const mediaSchema = z.object({
  imageUrl: z.string().nullable().optional(),
  windowsImageUrl: z.string().nullable().optional(),
  macosImageUrl: z.string().nullable().optional(),
  androidImageUrl: z.string().nullable().optional(),
  iconUrl: z.string().nullable().optional(),
});

const launchSchema = z.object({
  shopDomain: z.string().optional(),
  title: z.string().min(1),
  body: z.string().default(''),
  targetUrl: z.string().min(1),
  segmentId: z.string().optional().nullable(),
  media: mediaSchema.optional(),
  actionButtons: z
    .array(z.object({ title: z.string().min(1), link: z.string().min(1) }))
    .max(2)
    .optional(),
  maxBatches: z.number().int().min(1).max(2000).optional(),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRemoteUrl = (value: string | null | undefined) => {
  const trimmed = String(value ?? '').trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
};

const resolveMediaIfNeeded = async (shopDomain: string, value: string | null | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (isRemoteUrl(trimmed)) {
    return trimmed;
  }

  return resolveServerCampaignMediaUrl(shopDomain, trimmed);
};

const deliverCampaignWithRetry = async (
  shopDomain: string,
  campaignId: string,
  maxBatches: number,
) => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await sendCampaign(shopDomain, campaignId, { maxBatches });
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(1200 * attempt);
      }
    }
  }

  await requeueCampaignForDelivery(shopDomain, campaignId);
  throw lastError instanceof Error ? lastError : new Error('Campaign delivery failed after retries.');
};

const startBackgroundDelivery = (
  shopDomain: string,
  campaignId: string,
  maxBatches: number,
) => {
  deferAfterResponse(async () => {
    try {
      await deliverCampaignWithRetry(shopDomain, campaignId, maxBatches);
    } catch (error) {
      console.error('[campaigns/launch] background delivery failed', {
        shopDomain,
        campaignId,
        error: error instanceof Error ? error.message : String(error),
      });
      await requeueCampaignForDelivery(shopDomain, campaignId).catch(() => undefined);
    } finally {
      void invalidateShopDashboardCaches(shopDomain);
    }
  });
};

export async function POST(request: Request) {
  try {
    const body = launchSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const maxBatches = body.maxBatches ?? 2000;
    const media = body.media ?? {};

    const [iconUrl, windowsImageUrl, macosImageUrl, androidImageUrl] = await Promise.all([
      resolveMediaIfNeeded(shopDomain, media.iconUrl ?? null),
      resolveMediaIfNeeded(shopDomain, media.windowsImageUrl ?? null),
      resolveMediaIfNeeded(shopDomain, media.macosImageUrl ?? null),
      resolveMediaIfNeeded(shopDomain, media.androidImageUrl ?? null),
    ]);

    const listImageUrl =
      (await resolveMediaIfNeeded(shopDomain, media.imageUrl ?? null))
      ?? macosImageUrl
      ?? windowsImageUrl
      ?? androidImageUrl;

    const segmentId = body.segmentId && body.segmentId !== '' ? body.segmentId : 'all';
    const recipientCount = await countCampaignAudienceTokens(shopDomain, segmentId);

    const campaign = await createCampaign({
      shopDomain,
      title: body.title,
      body: body.body || ' ',
      targetUrl: body.targetUrl,
      iconUrl,
      imageUrl: listImageUrl,
      windowsImageUrl,
      macosImageUrl,
      androidImageUrl,
      actionButtons: body.actionButtons,
      segmentId,
      status: 'draft',
    });

    const campaignId = String(campaign.id);

    const sql = getNeonSql();
    await sql`
      UPDATE campaigns
      SET
        status = 'queued',
        sent_at = NOW(),
        target_recipient_count = ${recipientCount}
      WHERE id = ${campaignId}
        AND shop_domain = ${shopDomain}
    `;

    void invalidateShopDashboardCaches(shopDomain);
    startBackgroundDelivery(shopDomain, campaignId, maxBatches);

    return NextResponse.json({
      ok: true,
      campaignId,
      async: true,
      queued: true,
      completed: false,
      recipientCount,
      targetRecipientCount: recipientCount,
      successCount: 0,
      delivery_count: 0,
      remainingRecipients: recipientCount,
      message: 'Campaign created. Notifications are being delivered now.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to launch campaign.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
