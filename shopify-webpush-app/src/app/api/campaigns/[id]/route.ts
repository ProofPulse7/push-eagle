import { NextResponse } from 'next/server';
import { z } from 'zod';

import { invalidateShopDashboardCaches } from '@/lib/server/cache/api-kv-cache';
import { upsertCampaignDeliveryOptions } from '@/lib/server/campaigns/delivery-options';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { deleteDraftCampaign, getCampaignWithDetails, updateCampaignDraft } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

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
  actionButtons: z
    .array(z.object({ title: z.string(), link: z.string() }))
    .max(2)
    .optional()
    .transform((buttons) =>
      (buttons ?? []).filter((button) => button.title.trim() && button.link.trim()),
    ),
  segmentId: z.string().optional().nullable(),
  scheduledAt: z.string().optional().nullable(),
  delivery: deliverySchema,
});

const transformCampaign = (campaign: Record<string, unknown>) => ({
  id: campaign.id,
  title: campaign.title,
  body: campaign.body,
  status: campaign.status,
  target_url: campaign.target_url,
  targetUrl: campaign.target_url,
  icon_url: campaign.icon_url,
  iconUrl: campaign.icon_url,
  image_url: campaign.image_url,
  imageUrl: campaign.image_url,
  windows_image_url: campaign.windows_image_url,
  windowsImageUrl: campaign.windows_image_url,
  macos_image_url: campaign.macos_image_url,
  macosImageUrl: campaign.macos_image_url,
  android_image_url: campaign.android_image_url,
  androidImageUrl: campaign.android_image_url,
  action_buttons: campaign.action_buttons,
  actionButtons: campaign.action_buttons,
  segment_id: campaign.segment_id,
  segmentId: campaign.segment_id,
  scheduled_at: campaign.scheduled_at,
  scheduledAt: campaign.scheduled_at,
  sent_at: campaign.sent_at,
  sentAt: campaign.sent_at,
  schedule_type: campaign.schedule_type,
  scheduleType: campaign.schedule_type,
  send_at: campaign.send_at,
  sendAt: campaign.send_at,
  smart_send_enabled: campaign.smart_send_enabled,
  smartSendEnabled: campaign.smart_send_enabled,
  flash_sale_enabled: campaign.flash_sale_enabled,
  flashSaleEnabled: campaign.flash_sale_enabled,
  flash_sale_ends_at: campaign.flash_sale_ends_at,
  flashSaleEndsAt: campaign.flash_sale_ends_at,
  flash_sale_config: campaign.flash_sale_config,
  flashSaleConfig: campaign.flash_sale_config,
  created_at: campaign.created_at,
  createdAt: campaign.created_at,
});

export async function GET(request: Request, context: { params: { id: string } }) {
  try {
    const shopDomain = extractShopDomain(request);
    const campaign = await getCampaignWithDetails(shopDomain, context.params.id);

    if (!campaign) {
      return NextResponse.json({ ok: false, error: 'Campaign not found.' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      campaign: transformCampaign(campaign as Record<string, unknown>),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaign.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  try {
    const body = updateCampaignSchema.parse(await request.json());
    const shopDomain = extractShopDomain(request, body.shopDomain);
    const campaign = await updateCampaignDraft({
      campaignId: context.params.id,
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
      scheduledAt: body.scheduledAt,
    });

    if (body.delivery) {
      try {
        const sql = getNeonSql();
        await upsertCampaignDeliveryOptions(sql, context.params.id, shopDomain, {
          sendingOption: body.delivery.sendingOption ?? 'now',
          scheduledAt: body.delivery.scheduledAt ?? null,
          smartDeliver: Boolean(body.delivery.smartDeliver),
          flashSaleEnabled: Boolean(body.delivery.flashSaleEnabled),
          flashSaleConfig: body.delivery.flashSaleConfig ?? null,
        });
      } catch (deliveryError) {
        console.error('[campaigns/PATCH] delivery options failed', {
          shopDomain,
          campaignId: context.params.id,
          error: deliveryError instanceof Error ? deliveryError.message : String(deliveryError),
        });
      }
    }

    void invalidateShopDashboardCaches(shopDomain);

    return NextResponse.json({ ok: true, campaign });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update draft campaign.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: { id: string } }) {
  try {
    const shopDomain = extractShopDomain(request);
    await deleteDraftCampaign(shopDomain, context.params.id);
    void invalidateShopDashboardCaches(shopDomain);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete draft campaign.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
