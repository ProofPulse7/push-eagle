import { json, type LoaderFunctionArgs } from '@shopify/remix-oxygen';
import { getNeonSql } from '@/lib/integrations/database/neon';

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const shopDomain = (context as Record<string, unknown>).shopDomain as string;
  if (!shopDomain) {
    return json({ error: 'Shop domain required' }, { status: 400 });
  }

  if (request.method === 'GET') {
    // List scheduled campaigns
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

    return json({
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

  return json({ error: 'Method not allowed' }, { status: 405 });
}
