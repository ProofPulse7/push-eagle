/**
 * Delivery / click detail tables -> D1 backfill + verification.
 * Auth: requires the X-Cron-Secret header to match CRON_SECRET.
 *
 * POST /api/admin/deliveries/backfill-d1
 *   Body: { action?: 'selftest' | 'backfill' | 'purge-neon', batchSize?, maxBatches?, ...cursors }
 *
 * GET /api/admin/deliveries/backfill-d1?shop=<optional>
 *   Returns Neon vs D1 row counts for all four tables.
 */

import { NextResponse } from 'next/server';
import {
  backfillDeliveriesToD1,
  purgeNeonDeliveriesAfterD1Cutover,
  verifyDeliveriesD1Parity,
} from '@/lib/server/data/store';
import { d1DeliveriesSelfTest } from '@/lib/server/integrations/d1-deliveries';

export const runtime = 'nodejs';
export const maxDuration = 300;

const isAuthorized = (request: Request) =>
  Boolean(process.env.CRON_SECRET) && request.headers.get('X-Cron-Secret') === process.env.CRON_SECRET;

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const action = body.action == null ? 'backfill' : String(body.action);

  if (action === 'selftest') {
    try {
      const result = await d1DeliveriesSelfTest();
      return NextResponse.json({ action: 'selftest', ...result, ok: result.ok }, {
        status: result.ok ? 200 : 500,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      return NextResponse.json({ ok: false, action: 'selftest', error: message }, { status: 500 });
    }
  }

  if (action === 'purge-neon') {
    try {
      const result = await purgeNeonDeliveriesAfterD1Cutover();
      return NextResponse.json({ ok: true, action: 'purge-neon', ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      return NextResponse.json({ ok: false, action: 'purge-neon', error: message }, { status: 500 });
    }
  }

  try {
    const result = await backfillDeliveriesToD1({
      batchSize: body.batchSize == null ? undefined : Number(body.batchSize),
      maxBatches: body.maxBatches == null ? undefined : Number(body.maxBatches),
      afterCampaignDeliveryId:
        body.afterCampaignDeliveryId == null ? undefined : Number(body.afterCampaignDeliveryId),
      afterCampaignClickId:
        body.afterCampaignClickId == null ? undefined : Number(body.afterCampaignClickId),
      afterAutomationDeliveryId:
        body.afterAutomationDeliveryId == null ? undefined : Number(body.afterAutomationDeliveryId),
      afterAutomationClickId:
        body.afterAutomationClickId == null ? undefined : Number(body.afterAutomationClickId),
    });
    const parity = await verifyDeliveriesD1Parity();
    return NextResponse.json({ ok: true, action: 'backfill', ...result, parity });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const shop = new URL(request.url).searchParams.get('shop')?.trim() || undefined;

  try {
    const parity = await verifyDeliveriesD1Parity(shop);
    return NextResponse.json({ ok: true, parity, fullyInSync: parity.inSync });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
