import { NextResponse } from 'next/server';
import { z } from 'zod';

import { invalidateShopDashboardCaches } from '@/lib/server/cache/api-kv-cache';
import {
  buildFlashSaleNotificationBody,
  upsertCampaignDeliveryOptions,
  type CampaignDeliveryOptions,
} from '@/lib/server/campaigns/delivery-options';
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

const flashSaleConfigSchema = z
  .object({
    discountPercent: z.number().optional(),
    originalPrice: z.number().optional(),
    salePrice: z.number().optional(),
    expiresAt: z.string().optional().nullable(),
    urgencyText: z.string().optional(),
  })
  .optional()
  .nullable();

const deliverySchema = z
  .object({
    sendingOption: z.enum(['now', 'schedule']).default('now'),
    scheduledAt: z.string().optional().nullable(),
    smartDeliver: z.boolean().optional(),
    flashSaleEnabled: z.boolean().optional(),
    flashSaleConfig: flashSaleConfigSchema,
  })
  .optional();

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
  delivery: deliverySchema,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const deliverCampaignWithRetry = async (
  shopDomain: string,
  campaignId: string,
  maxBatches: number,
) => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await sendCampaign(shopDomain, campaignId, { maxBatches });
    } catch (error) {
      lastError = error;
      if (attempt < 4) {
        await sleep(1000 * attempt);
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
    const delivery: CampaignDeliveryOptions = {
      sendingOption: body.delivery?.sendingOption ?? 'now',
      scheduledAt: body.delivery?.scheduledAt ?? null,
      smartDeliver: Boolean(body.delivery?.smartDeliver),
      flashSaleEnabled: Boolean(body.delivery?.flashSaleEnabled),
      flashSaleConfig: body.delivery?.flashSaleConfig ?? null,
    };

    if (delivery.sendingOption === 'schedule') {
      if (!delivery.scheduledAt) {
        return NextResponse.json({ ok: false, error: 'Scheduled date and time are required.' }, { status: 400 });
      }

      const scheduledAt = new Date(delivery.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) {
        return NextResponse.json({ ok: false, error: 'Invalid scheduled date and time.' }, { status: 400 });
      }

      if (scheduledAt.getTime() <= Date.now()) {
        return NextResponse.json({ ok: false, error: 'Scheduled time must be in the future.' }, { status: 400 });
      }
    }

    if (delivery.flashSaleEnabled) {
      const expiresAt = delivery.flashSaleConfig?.expiresAt
        ? new Date(delivery.flashSaleConfig.expiresAt)
        : null;
      if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
        return NextResponse.json({ ok: false, error: 'Flash sale expiry date and time are required.' }, { status: 400 });
      }

      if (expiresAt.getTime() <= Date.now()) {
        return NextResponse.json({ ok: false, error: 'Flash sale expiry must be in the future.' }, { status: 400 });
      }
    }

    const [iconUrl, windowsImageUrl, macosImageUrl, androidImageUrl] = await Promise.all([
      resolveServerCampaignMediaUrl(shopDomain, media.iconUrl ?? null),
      resolveServerCampaignMediaUrl(shopDomain, media.windowsImageUrl ?? null),
      resolveServerCampaignMediaUrl(shopDomain, media.macosImageUrl ?? null),
      resolveServerCampaignMediaUrl(shopDomain, media.androidImageUrl ?? null),
    ]);

    const listImageUrl =
      (await resolveServerCampaignMediaUrl(shopDomain, media.imageUrl ?? null))
      ?? macosImageUrl
      ?? windowsImageUrl
      ?? androidImageUrl;

    const segmentId = body.segmentId && body.segmentId !== '' ? body.segmentId : 'all';
    const recipientCount = await countCampaignAudienceTokens(shopDomain, segmentId);
    const notificationBody = buildFlashSaleNotificationBody(body.body || ' ', delivery.flashSaleConfig);

    const campaign = await createCampaign({
      shopDomain,
      title: body.title,
      body: notificationBody,
      targetUrl: body.targetUrl,
      iconUrl,
      imageUrl: listImageUrl,
      windowsImageUrl,
      macosImageUrl,
      androidImageUrl,
      actionButtons: body.actionButtons,
      segmentId,
      status: delivery.sendingOption === 'schedule' ? 'scheduled' : 'draft',
      scheduledAt: delivery.sendingOption === 'schedule' ? delivery.scheduledAt ?? null : null,
    });

    const campaignId = String(campaign.id);
    const sql = getNeonSql();

    await upsertCampaignDeliveryOptions(sql, campaignId, shopDomain, delivery);

    if (delivery.sendingOption === 'schedule') {
      await sql`
        UPDATE campaigns
        SET
          status = 'scheduled',
          scheduled_at = ${delivery.scheduledAt ? new Date(delivery.scheduledAt) : null},
          sent_at = NULL,
          target_recipient_count = ${recipientCount}
        WHERE id = ${campaignId}
          AND shop_domain = ${shopDomain}
      `;

      const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
      void bumpCronWakeNow();
      void invalidateShopDashboardCaches(shopDomain);

      return NextResponse.json({
        ok: true,
        campaignId,
        async: false,
        queued: false,
        scheduled: true,
        completed: false,
        recipientCount,
        targetRecipientCount: recipientCount,
        successCount: 0,
        delivery_count: 0,
        remainingRecipients: recipientCount,
        message: 'Campaign scheduled successfully.',
      });
    }

    await sql`
      UPDATE campaigns
      SET
        status = 'queued',
        sent_at = NOW(),
        target_recipient_count = ${recipientCount}
      WHERE id = ${campaignId}
        AND shop_domain = ${shopDomain}
    `;

    const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
    void bumpCronWakeNow();
    void invalidateShopDashboardCaches(shopDomain);

    startBackgroundDelivery(shopDomain, campaignId, maxBatches);

    return NextResponse.json({
      ok: true,
      campaignId,
      async: true,
      queued: true,
      scheduled: false,
      completed: false,
      recipientCount,
      targetRecipientCount: recipientCount,
      successCount: 0,
      delivery_count: 0,
      remainingRecipients: recipientCount,
      message: delivery.smartDeliver
        ? 'Campaign queued. Smart delivery is sending in optimized batches.'
        : 'Campaign queued. Notifications are sending in the background.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to launch campaign.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
