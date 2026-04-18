import { NextResponse } from 'next/server';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { extractShopDomain } from '@/lib/server/shop-context';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const shopDomain = extractShopDomain(request);
  if (!shopDomain) {
    return NextResponse.json({ error: 'Shop domain required' }, { status: 400 });
  }

  const sql = getNeonSql();
  const rows = await sql`
    SELECT
      c.id,
      c.title,
      c.status,
      c.delivery_count,
      c.click_count,
      c.revenue_cents,
      cs.schedule_type,
      cs.send_at,
      cs.smart_send_enabled,
      cs.flash_sale_enabled,
      c.created_at
    FROM campaigns c
    LEFT JOIN campaign_schedules cs ON cs.campaign_id = c.id
    WHERE c.shop_domain = ${shopDomain}
    ORDER BY c.created_at DESC
    LIMIT 100
  `;

  return NextResponse.json({
    campaigns: rows.map((row) => ({
      id: String(row.id),
      title: String(row.title),
      status: String(row.status),
      deliveryCount: Number(row.delivery_count ?? 0),
      clickCount: Number(row.click_count ?? 0),
      revenueCents: Number(row.revenue_cents ?? 0),
      scheduleType: row.schedule_type ? String(row.schedule_type) : null,
      sendAt: row.send_at ? String(row.send_at) : null,
      smartSendEnabled: Boolean(row.smart_send_enabled),
      flashSaleEnabled: Boolean(row.flash_sale_enabled),
      createdAt: String(row.created_at),
    })),
  });
}
