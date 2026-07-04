/**
 * Stage-1 audience -> D1 backfill + verification.
 * Auth: requires the X-Cron-Secret header to match CRON_SECRET.
 *
 * POST /api/admin/audience/backfill-d1
 *   Body: { batchSize?, maxBatches?, afterSubscriberId?, afterTokenId? }
 *   Copies existing Neon subscribers/tokens into the D1 mirror. Safe to call
 *   repeatedly; pass back the returned cursors to resume for large datasets.
 *
 * GET /api/admin/audience/backfill-d1?shop=<optional>
 *   Returns Neon vs D1 row counts so you can confirm parity before Stage 2.
 */

import { NextResponse } from 'next/server';
import {
  backfillAudienceToD1,
  getAudienceOutboxStatus,
  reconcileAudienceOutbox,
  verifyAudienceD1Parity,
} from '@/lib/server/data/store';
import { d1AudienceSelfTest } from '@/lib/server/integrations/d1-audience';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

  // Isolated proof that the d1_only authoritative write path works end-to-end
  // (write -> read -> idempotent update -> cleanup) before flipping the mode.
  if (body.action === 'selftest') {
    try {
      const result = await d1AudienceSelfTest();
      return NextResponse.json({ ok: result.ok, action: 'selftest', ...result }, {
        status: result.ok ? 200 : 500,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      return NextResponse.json({ ok: false, action: 'selftest', error: message }, { status: 500 });
    }
  }

  // Manually drain the zero-loss outbox (also runs automatically every cron tick).
  if (body.action === 'reconcile-outbox') {
    try {
      const result = await reconcileAudienceOutbox(
        body.limit == null ? undefined : Number(body.limit),
      );
      return NextResponse.json({ ok: true, action: 'reconcile-outbox', ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      return NextResponse.json({ ok: false, action: 'reconcile-outbox', error: message }, { status: 500 });
    }
  }

  try {
    const result = await backfillAudienceToD1({
      batchSize: body.batchSize == null ? undefined : Number(body.batchSize),
      maxBatches: body.maxBatches == null ? undefined : Number(body.maxBatches),
      afterSubscriberId: body.afterSubscriberId == null ? undefined : Number(body.afterSubscriberId),
      afterTokenId: body.afterTokenId == null ? undefined : Number(body.afterTokenId),
    });
    return NextResponse.json({ ok: true, ...result });
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
    const [parity, outbox] = await Promise.all([
      verifyAudienceD1Parity(shop),
      getAudienceOutboxStatus(),
    ]);
    return NextResponse.json({ ok: true, ...parity, outbox });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
