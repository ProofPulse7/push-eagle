/**
 * Commerce / customers / catalog -> D1 backfill + verification.
 * Auth: requires the X-Cron-Secret header to match CRON_SECRET.
 *
 * POST /api/admin/commerce/backfill-d1
 *   Body: {
 *     action?: 'selftest' | 'commerce' | 'customers' | 'catalog' | 'all' | 'purge-neon',
 *     batchSize?, maxBatches?, afterOrderId?, afterFulfillmentId?,
 *     afterId?, afterShopDomain?, afterVariantId?
 *   }
 *
 * GET /api/admin/commerce/backfill-d1?shop=<optional>
 *   Returns Neon vs D1 row counts for commerce, customers, and catalog.
 */

import { NextResponse } from 'next/server';
import {
  backfillCatalogToD1,
  backfillCommerceToD1,
  backfillCustomersToD1,
  reconcileCatalogD1WithNeon,
  purgeNeonCommerceCacheAfterD1Cutover,
  verifyCatalogD1Parity,
  verifyCommerceD1Parity,
  verifyCustomersD1Parity,
} from '@/lib/server/data/store';
import { d1CommerceSelfTest } from '@/lib/server/integrations/d1-commerce';

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

  const action = body.action == null ? 'commerce' : String(body.action);

  if (action === 'selftest') {
    try {
      const result = await d1CommerceSelfTest();
      return NextResponse.json({ ok: result.ok, action: 'selftest', ...result }, {
        status: result.ok ? 200 : 500,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      return NextResponse.json({ ok: false, action: 'selftest', error: message }, { status: 500 });
    }
  }

  if (action === 'purge-neon') {
    try {
      const result = await purgeNeonCommerceCacheAfterD1Cutover();
      return NextResponse.json({ ok: true, action: 'purge-neon', ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      return NextResponse.json({ ok: false, action: 'purge-neon', error: message }, { status: 500 });
    }
  }

  if (action === 'reconcile-catalog') {
    try {
      const result = await reconcileCatalogD1WithNeon();
      const parity = await verifyCatalogD1Parity();
      return NextResponse.json({ ok: true, action: 'reconcile-catalog', ...result, parity });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      return NextResponse.json({ ok: false, action: 'reconcile-catalog', error: message }, { status: 500 });
    }
  }

  try {
    if (action === 'commerce' || action === 'all') {
      const commerce = await backfillCommerceToD1({
        batchSize: body.batchSize == null ? undefined : Number(body.batchSize),
        maxBatches: body.maxBatches == null ? undefined : Number(body.maxBatches),
        afterOrderId: body.afterOrderId == null ? undefined : Number(body.afterOrderId),
        afterFulfillmentId: body.afterFulfillmentId == null ? undefined : Number(body.afterFulfillmentId),
      });

      if (action === 'commerce') {
        return NextResponse.json({ ok: true, action: 'commerce', commerce });
      }

      const customers = await backfillCustomersToD1({
        batchSize: body.batchSize == null ? undefined : Number(body.batchSize),
        maxBatches: body.maxBatches == null ? undefined : Number(body.maxBatches),
        afterId: body.afterId == null ? undefined : Number(body.afterId),
      });

      const catalog = await backfillCatalogToD1({
        batchSize: body.batchSize == null ? undefined : Number(body.batchSize),
        maxBatches: body.maxBatches == null ? undefined : Number(body.maxBatches),
        afterShopDomain: body.afterShopDomain == null ? undefined : String(body.afterShopDomain),
        afterVariantId: body.afterVariantId == null ? undefined : String(body.afterVariantId),
      });

      const parity = {
        commerce: await verifyCommerceD1Parity(),
        customers: await verifyCustomersD1Parity(),
        catalog: await verifyCatalogD1Parity(),
      };

      return NextResponse.json({
        ok: true,
        action: 'all',
        commerce,
        customers,
        catalog,
        parity,
        fullyInSync:
          parity.commerce.inSync && parity.customers.inSync && parity.catalog.inSync,
      });
    }

    if (action === 'customers') {
      const result = await backfillCustomersToD1({
        batchSize: body.batchSize == null ? undefined : Number(body.batchSize),
        maxBatches: body.maxBatches == null ? undefined : Number(body.maxBatches),
        afterId: body.afterId == null ? undefined : Number(body.afterId),
      });
      return NextResponse.json({ ok: true, action: 'customers', ...result });
    }

    if (action === 'catalog') {
      const result = await backfillCatalogToD1({
        batchSize: body.batchSize == null ? undefined : Number(body.batchSize),
        maxBatches: body.maxBatches == null ? undefined : Number(body.maxBatches),
        afterShopDomain: body.afterShopDomain == null ? undefined : String(body.afterShopDomain),
        afterVariantId: body.afterVariantId == null ? undefined : String(body.afterVariantId),
      });
      return NextResponse.json({ ok: true, action: 'catalog', ...result });
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
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
    const [commerce, customers, catalog] = await Promise.all([
      verifyCommerceD1Parity(shop),
      verifyCustomersD1Parity(shop),
      verifyCatalogD1Parity(shop),
    ]);

    return NextResponse.json({
      ok: true,
      commerce,
      customers,
      catalog,
      fullyInSync: commerce.inSync && customers.inSync && catalog.inSync,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
