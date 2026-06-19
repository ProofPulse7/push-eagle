import { randomUUID } from 'crypto';

import type { getNeonSql } from '@/lib/integrations/database/neon';

export type FlashSaleConfig = {
  discountPercent?: number;
  originalPrice?: number;
  salePrice?: number;
  expiresAt?: string | null;
  urgencyText?: string;
};

export type CampaignDeliveryOptions = {
  sendingOption: 'now' | 'schedule';
  scheduledAt?: string | null;
  smartDeliver?: boolean;
  flashSaleEnabled?: boolean;
  flashSaleConfig?: FlashSaleConfig | null;
};

export const buildFlashSaleNotificationBody = (body: string, config?: FlashSaleConfig | null) => {
  const urgency = config?.urgencyText?.trim() || '⏰ Limited time offer!';
  const trimmedBody = body.trim() || ' ';
  if (trimmedBody.includes(urgency)) {
    return trimmedBody;
  }
  return `${trimmedBody}\n\n${urgency}`.trim();
};

export const upsertCampaignDeliveryOptions = async (
  sql: ReturnType<typeof getNeonSql>,
  campaignId: string,
  shopDomain: string,
  options: CampaignDeliveryOptions,
) => {
  const scheduleType = options.sendingOption === 'schedule' ? 'scheduled' : 'immediate';
  const sendAt = options.scheduledAt ? new Date(options.scheduledAt) : null;
  const flashEndsAt =
    options.flashSaleEnabled && options.flashSaleConfig?.expiresAt
      ? new Date(options.flashSaleConfig.expiresAt)
      : null;

  await sql`
    INSERT INTO campaign_schedules (
      id,
      campaign_id,
      shop_domain,
      schedule_type,
      send_at,
      recurring_pattern,
      smart_send_enabled,
      smart_send_config,
      flash_sale_enabled,
      flash_sale_config,
      created_at,
      updated_at
    )
    VALUES (
      ${randomUUID()},
      ${campaignId},
      ${shopDomain},
      ${scheduleType},
      ${sendAt},
      NULL,
      ${Boolean(options.smartDeliver)},
      ${JSON.stringify({ optimizeByEngagement: true })}::jsonb,
      ${Boolean(options.flashSaleEnabled)},
      ${JSON.stringify(options.flashSaleConfig ?? {})}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (campaign_id) DO UPDATE SET
      schedule_type = EXCLUDED.schedule_type,
      send_at = EXCLUDED.send_at,
      smart_send_enabled = EXCLUDED.smart_send_enabled,
      smart_send_config = EXCLUDED.smart_send_config,
      flash_sale_enabled = EXCLUDED.flash_sale_enabled,
      flash_sale_config = EXCLUDED.flash_sale_config,
      updated_at = NOW()
  `;

  if (options.flashSaleEnabled) {
    await sql`
      UPDATE campaigns
      SET
        flash_sale_enabled = TRUE,
        flash_sale_ends_at = ${flashEndsAt}
      WHERE id = ${campaignId}
        AND shop_domain = ${shopDomain}
    `;
  }
};

export type CampaignScheduleMeta = {
  smart_send_enabled: boolean;
  flash_sale_enabled: boolean;
  flash_sale_config: FlashSaleConfig | null;
  flash_sale_ends_at: Date | string | null;
};

export const loadCampaignScheduleMeta = async (
  sql: ReturnType<typeof getNeonSql>,
  campaignId: string,
  shopDomain: string,
): Promise<CampaignScheduleMeta | null> => {
  const rows = await sql`
    SELECT
      cs.smart_send_enabled,
      cs.flash_sale_enabled,
      cs.flash_sale_config,
      c.flash_sale_ends_at
    FROM campaigns c
    LEFT JOIN campaign_schedules cs ON cs.campaign_id = c.id
    WHERE c.id = ${campaignId}
      AND c.shop_domain = ${shopDomain}
    LIMIT 1
  `;

  const row = rows[0] as
    | {
        smart_send_enabled?: boolean | null;
        flash_sale_enabled?: boolean | null;
        flash_sale_config?: FlashSaleConfig | null;
        flash_sale_ends_at?: Date | string | null;
      }
    | undefined;

  if (!row) {
    return null;
  }

  return {
    smart_send_enabled: Boolean(row.smart_send_enabled),
    flash_sale_enabled: Boolean(row.flash_sale_enabled),
    flash_sale_config: (row.flash_sale_config ?? null) as FlashSaleConfig | null,
    flash_sale_ends_at: row.flash_sale_ends_at ?? null,
  };
};

export const filterRecipientsForSmartDeliveryHour = async (
  sql: ReturnType<typeof getNeonSql>,
  shopDomain: string,
  recipients: Array<{ subscriber_id: unknown; external_id?: string | null }>,
  currentHour: number,
) => {
  const externalIds = recipients
    .map((recipient) => String(recipient.external_id ?? '').trim())
    .filter(Boolean);

  if (externalIds.length === 0) {
    return recipients;
  }

  const metricRows = await sql`
    SELECT external_id, optimal_send_hour
    FROM smart_delivery_metrics
    WHERE shop_domain = ${shopDomain}
      AND external_id = ANY(${externalIds}::text[])
  `;

  const hourByExternal = new Map<string, number>();
  for (const row of metricRows) {
    const externalId = String((row as { external_id?: string }).external_id ?? '').trim();
    const hour = Number((row as { optimal_send_hour?: number | null }).optimal_send_hour);
    if (externalId && Number.isFinite(hour)) {
      hourByExternal.set(externalId, hour);
    }
  }

  return recipients.filter((recipient) => {
    const externalId = String(recipient.external_id ?? '').trim();
    const optimalHour = externalId ? hourByExternal.get(externalId) ?? currentHour : currentHour;
    return optimalHour === currentHour;
  });
};
