import { NextResponse } from 'next/server';

import { getCampaignWithDetails } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

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
