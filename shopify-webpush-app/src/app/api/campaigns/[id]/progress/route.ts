import { NextResponse } from 'next/server';

import { getCampaignProgress } from '@/lib/server/data/store';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: { id: string } }) {
  try {
    const shopDomain = extractShopDomain(request);
    const progress = await getCampaignProgress(shopDomain, context.params.id);

    if (!progress) {
      return NextResponse.json({ ok: false, error: 'Campaign not found.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, progress });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch campaign progress.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
