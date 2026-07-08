/**
 * Drop empty Neon tables that are fully migrated to D1 / KV.
 * Auth: requires the X-Cron-Secret header to match CRON_SECRET.
 *
 * GET  — inventory (exists, row counts, eligibility)
 * POST — { action?: 'drop' | 'dry-run' | 'force-drop', forcePurge?: boolean }
 *
 * force-drop / forcePurge=true: TRUNCATE + DROP migrated tables even with rows.
 * Only use after confirming D1/KV already holds the live data.
 */

import { NextResponse } from 'next/server';
import {
  dropNeonLegacyTablesAfterD1Cutover,
  getNeonLegacyTableInventory,
} from '@/lib/server/integrations/neon-legacy-tables';

export const runtime = 'nodejs';
export const maxDuration = 120;

const isAuthorized = (request: Request) =>
  Boolean(process.env.CRON_SECRET) && request.headers.get('X-Cron-Secret') === process.env.CRON_SECRET;

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const inventory = await getNeonLegacyTableInventory();
    const eligible = inventory.tables.filter((row) => row.eligibleToDrop).map((row) => row.table);
    const forceEligible = inventory.tables
      .filter((row) => row.exists && row.skipSchema)
      .map((row) => ({ table: row.table, rowCount: row.rowCount }));
    return NextResponse.json({
      ok: true,
      ...inventory,
      eligibleToDrop: eligible,
      forceEligibleToDrop: forceEligible,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

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

  const action = body.action == null ? 'drop' : String(body.action);
  const dryRun = action === 'dry-run';
  const forcePurge = action === 'force-drop' || body.forcePurge === true;

  if (action !== 'drop' && action !== 'dry-run' && action !== 'force-drop') {
    return NextResponse.json(
      { ok: false, error: 'action must be drop, dry-run, or force-drop' },
      { status: 400 },
    );
  }

  try {
    const inventory = await getNeonLegacyTableInventory();

    if (!forcePurge) {
      const notEligible = inventory.tables.filter(
        (row) => row.exists && row.skipSchema && row.rowCount != null && row.rowCount > 0,
      );
      if (notEligible.length > 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'Some legacy tables still have rows. Use action force-drop after confirming D1/KV migration, or purge first.',
            tables: notEligible,
          },
          { status: 409 },
        );
      }
    }

    const result = await dropNeonLegacyTablesAfterD1Cutover({ dryRun, forcePurge });
    return NextResponse.json({ ok: true, action, forcePurge, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
