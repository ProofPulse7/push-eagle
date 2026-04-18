import { NextRequest, NextResponse } from 'next/server';
import { getCampaignDeliveryStats } from '@/lib/server/services/notification-batch';

/**
 * GET /api/campaigns/[id]/delivery-stats
 * Get real-time delivery statistics for a campaign.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const shopDomain = request.headers.get('x-shop-domain');
    if (!shopDomain) {
      return NextResponse.json({ error: 'Shop domain required' }, { status: 400 });
    }

    const campaignId = params.id;
    if (!campaignId) {
      return NextResponse.json({ error: 'Campaign ID required' }, { status: 400 });
    }

    const stats = await getCampaignDeliveryStats(campaignId);

    return NextResponse.json({
      ok: true,
      stats,
    });
  } catch (error) {
    console.error('Error fetching delivery stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch delivery stats' },
      { status: 500 }
    );
  }
}