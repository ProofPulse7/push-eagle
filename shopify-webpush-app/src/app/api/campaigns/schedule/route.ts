import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getNeonSql } from '@/lib/integrations/database/neon';
import {
  upsertCampaignSchedule,
  listDueCampaigns,
  markCampaignAsSent,
  ScheduleCampaignInput,
} from '@/lib/server/services/campaign-scheduler';
import { sendCampaignNotification } from '@/lib/server/services/notification-batch';

const ScheduleCampaignSchema = z.object({
  campaignId: z.string().min(1),
  scheduleType: z.enum(['immediate', 'scheduled', 'recurring']),
  sendAt: z.string().datetime().optional().nullable(),
  recurringPattern: z.string().optional().nullable(),
  smartSendEnabled: z.boolean().optional(),
  smartSendConfig: z.record(z.unknown()).optional(),
  flashSaleEnabled: z.boolean().optional(),
  flashSaleConfig: z
    .object({
      discountPercent: z.number().optional(),
      originalPrice: z.number().optional(),
      salePrice: z.number().optional(),
      expiresAt: z.string().optional(),
      urgencyText: z.string().optional(),
    })
    .optional()
    .nullable(),
});

/**
 * POST /api/campaigns/schedule
 * Schedule a campaign for sending (immediate, scheduled, or recurring).
 */
export async function POST(request: NextRequest) {
  try {
    const shopDomain = request.headers.get('x-shop-domain');
    if (!shopDomain) {
      return NextResponse.json({ error: 'Shop domain required' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = ScheduleCampaignSchema.parse(body);

    const scheduleInput: ScheduleCampaignInput = {
      campaignId: parsed.campaignId,
      shopDomain,
      scheduleType: parsed.scheduleType,
      sendAt: parsed.sendAt ? new Date(parsed.sendAt) : undefined,
      recurringPattern: parsed.recurringPattern ?? undefined,
      smartSendEnabled: parsed.smartSendEnabled,
      smartSendConfig: parsed.smartSendConfig,
      flashSaleEnabled: parsed.flashSaleEnabled,
      flashSaleConfig: parsed.flashSaleConfig,
    };

    const scheduleId = await upsertCampaignSchedule(scheduleInput);

    // If immediate, trigger sending now
    if (parsed.scheduleType === 'immediate') {
      const sql = getNeonSql();
      const campaignRows = await sql`
        SELECT 
          id, title, body, target_url, icon_url, image_url, segment_id
        FROM campaigns
        WHERE id = ${parsed.campaignId}
        LIMIT 1
      `;

      if (campaignRows[0]) {
        const campaign = campaignRows[0];
        try {
          await sendCampaignNotification({
            shopDomain,
            campaignId: String(campaign.id),
            title: String(campaign.title),
            body: String(campaign.body),
            targetUrl: campaign.target_url ? String(campaign.target_url) : null,
            iconUrl: campaign.icon_url ? String(campaign.icon_url) : null,
            imageUrl: campaign.image_url ? String(campaign.image_url) : null,
            segmentId: campaign.segment_id ? String(campaign.segment_id) : null,
            smartDeliver: parsed.smartSendEnabled,
          });

          await markCampaignAsSent(parsed.campaignId);
        } catch (error) {
          console.error('Failed to send immediate campaign:', error);
          return NextResponse.json(
            { error: 'Failed to send campaign', details: String(error) },
            { status: 500 },
          );
        }
      }
    }

    return NextResponse.json({
      scheduleId,
      status: parsed.scheduleType === 'immediate' ? 'sent' : 'scheduled',
    });
  } catch (error) {
    console.error('Campaign schedule error:', error);
    return NextResponse.json(
      { error: 'Invalid request', details: String(error) },
      { status: 400 },
    );
  }
}

/**
 * GET /api/campaigns/schedule
 * List upcoming scheduled campaigns.
 */
export async function GET(request: NextRequest) {
  try {
    const shopDomain = request.headers.get('x-shop-domain');
    if (!shopDomain) {
      return NextResponse.json({ error: 'Shop domain required' }, { status: 400 });
    }

    const sql = getNeonSql();
    const rows = await sql`
      SELECT
        c.id,
        c.title,
        c.body,
        c.status,
        c.delivery_count,
        cs.schedule_type,
        cs.send_at,
        cs.smart_send_enabled,
        cs.flash_sale_enabled,
        c.created_at
      FROM campaigns c
      LEFT JOIN campaign_schedules cs ON cs.campaign_id = c.id
      WHERE c.shop_domain = ${shopDomain}
      ORDER BY COALESCE(cs.send_at, c.created_at) DESC
      LIMIT 50
    `;

    return NextResponse.json({
      campaigns: rows.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        status: String(row.status),
        deliveryCount: Number(row.delivery_count ?? 0),
        scheduleType: row.schedule_type ? String(row.schedule_type) : null,
        sendAt: row.send_at ? new Date(row.send_at).toISOString() : null,
        smartSendEnabled: Boolean(row.smart_send_enabled),
        flashSaleEnabled: Boolean(row.flash_sale_enabled),
        createdAt: new Date(row.created_at).toISOString(),
      })),
    });
  } catch (error) {
    console.error('Campaign fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}
