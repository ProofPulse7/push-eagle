import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendCampaignNotification } from '@/lib/server/services/notification-batch';
import { optimizeCampaignDeliveryTiming } from '@/lib/server/services/smart-delivery';

const SendCampaignSchema = z.object({
  campaignId: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  targetUrl: z.string().url().optional().nullable(),
  iconUrl: z.string().url().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  segmentId: z.string().optional().nullable(),
  smartDeliver: z.boolean().optional(),
  testMode: z.boolean().optional(),
});

/**
 * POST /api/campaigns/send
 * Send a campaign to all or segmented subscribers.
 * Supports smart delivery optimization.
 */
export async function POST(request: NextRequest) {
  try {
    const shopDomain = request.headers.get('x-shop-domain');
    if (!shopDomain) {
      return NextResponse.json({ error: 'Shop domain required' }, { status: 400 });
    }

    const body = await request.json();
    const parsed = SendCampaignSchema.parse(body);

    // Send campaign notification
    const deliveryId = await sendCampaignNotification({
      shopDomain,
      campaignId: parsed.campaignId,
      title: parsed.title,
      body: parsed.body,
      targetUrl: parsed.targetUrl ?? null,
      iconUrl: parsed.iconUrl ?? null,
      imageUrl: parsed.imageUrl ?? null,
      segmentId: parsed.segmentId ?? null,
      smartDeliver: parsed.smartDeliver ?? false,
      testMode: parsed.testMode ?? false,
    });

    // If smart deliver enabled, optimize timing
    let optimizedTiming = null;
    if (parsed.smartDeliver) {
      optimizedTiming = await optimizeCampaignDeliveryTiming(parsed.campaignId, shopDomain);
    }

    return NextResponse.json({
      deliveryId,
      status: 'sending',
      totalSubscribers: 'calculating',
      optimizedTiming: optimizedTiming ? { hourBuckets: optimizedTiming } : null,
    });
  } catch (error) {
    console.error('Campaign send error:', error);
    return NextResponse.json(
      { error: 'Failed to send campaign', details: String(error) },
      { status: 400 },
    );
  }
}
