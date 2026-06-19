import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { invalidateShopDashboardCaches } from '@/lib/server/cache/api-kv-cache';
import {
  resolveCampaignNotificationBody,
  upsertCampaignDeliveryOptions,
  type CampaignDeliveryOptions,
} from '@/lib/server/campaigns/delivery-options';
import { deliverCampaignUntilComplete } from '@/lib/server/campaigns/deliver-campaign';
import { deferAfterResponse } from '@/lib/server/defer-after-response';
import { getNeonSql } from '@/lib/integrations/database/neon';
import {
  countCampaignAudienceTokens,
  createCampaign,
  ensureMerchantAccount,
  requeueCampaignForDelivery,
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

    const segmentId = body.segmentId && body.segmentId !== '' ? body.segmentId : 'all';
    const recipientCount = await countCampaignAudienceTokens(shopDomain, segmentId);
    const notificationBody = resolveCampaignNotificationBody(body.body || ' ', delivery);

    const campaignId = randomUUID();
    const sql = getNeonSql();

    if (delivery.sendingOption !== 'schedule') {
      await ensureMerchantAccount(shopDomain);

      await sql`
        INSERT INTO campaigns (
          id,
          shop_domain,
          title,
          body,
          target_url,
          segment_id,
          status,
          sent_at,
          target_recipient_count,
          created_at
        )
        VALUES (
          ${campaignId},
          ${shopDomain},
          ${body.title},
          ${notificationBody},
          ${body.targetUrl},
          ${segmentId},
          'queued',
          NOW(),
          ${recipientCount},
          NOW()
        )
      `;

      const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
      void bumpCronWakeNow();
      void invalidateShopDashboardCaches(shopDomain);

      deferAfterResponse(async () => {
        try {
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

          await sql`
            UPDATE campaigns
            SET
              icon_url = ${iconUrl},
              image_url = ${listImageUrl},
              windows_image_url = ${windowsImageUrl},
              macos_image_url = ${macosImageUrl},
              android_image_url = ${androidImageUrl},
              action_buttons = ${JSON.stringify(body.actionButtons ?? [])}::jsonb
            WHERE id = ${campaignId}
              AND shop_domain = ${shopDomain}
          `;

          await upsertCampaignDeliveryOptions(sql, campaignId, shopDomain, delivery);
          await deliverCampaignUntilComplete(shopDomain, campaignId, { maxBatches, maxRounds: 60 });
        } catch (error) {
          console.error('[campaigns/launch] deferred create/deliver failed', {
            shopDomain,
            campaignId,
            error: error instanceof Error ? error.message : String(error),
          });
          await requeueCampaignForDelivery(shopDomain, campaignId).catch(() => undefined);
        } finally {
          void invalidateShopDashboardCaches(shopDomain);
        }
      });

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
      status: 'scheduled',
      scheduledAt: delivery.scheduledAt ?? null,
    });

    const resolvedCampaignId = String(campaign.id);

    await upsertCampaignDeliveryOptions(sql, resolvedCampaignId, shopDomain, delivery);

    await sql`
      UPDATE campaigns
      SET
        status = 'scheduled',
        scheduled_at = ${delivery.scheduledAt ? new Date(delivery.scheduledAt) : null},
        sent_at = NULL,
        target_recipient_count = ${recipientCount}
      WHERE id = ${resolvedCampaignId}
        AND shop_domain = ${shopDomain}
    `;

    const { bumpCronWakeNow } = await import('@/lib/server/cron/cron-idle');
    void bumpCronWakeNow();
    void invalidateShopDashboardCaches(shopDomain);

    return NextResponse.json({
      ok: true,
      campaignId: resolvedCampaignId,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to launch campaign.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
