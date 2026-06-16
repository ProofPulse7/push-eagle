import { NextResponse } from 'next/server';

import { getCampaignById } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

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
