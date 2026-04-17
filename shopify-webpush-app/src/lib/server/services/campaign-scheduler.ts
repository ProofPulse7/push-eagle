import { randomUUID } from 'crypto';
import { getNeonSql } from '@/lib/integrations/database/neon';

export type ScheduleCampaignInput = {
  campaignId: string;
  shopDomain: string;
  scheduleType: 'immediate' | 'scheduled' | 'recurring';
  sendAt?: Date | null;
  recurringPattern?: string | null; // cron expression: "0 9 * * MON,WED,FRI"
  smartSendEnabled?: boolean;
  smartSendConfig?: Record<string, unknown> | null;
  flashSaleEnabled?: boolean;
  flashSaleConfig?: {
    discountPercent?: number;
    originalPrice?: number;
    salePrice?: number;
    expiresAt?: string;
    urgencyText?: string;
  } | null;
};

export type SmartDeliveryConfig = {
  optimizeByTimeZone?: boolean;
  optimizeByEngagement?: boolean;
  testVariants?: number; // A/B test: split audience into N variants
  winnerPercentage?: number; // Deploy winner to remaining audience (80%)
};

/**
 * Create or update campaign schedule (immediate, scheduled, or recurring).
 */
export const upsertCampaignSchedule = async (input: ScheduleCampaignInput): Promise<string> => {
  const sql = getNeonSql();

  const scheduleId = randomUUID();

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
      ${scheduleId},
      ${input.campaignId},
      ${input.shopDomain},
      ${input.scheduleType},
      ${input.sendAt ?? null},
      ${input.recurringPattern ?? null},
      ${input.smartSendEnabled ?? false},
      ${JSON.stringify(input.smartSendConfig ?? {})}::jsonb,
      ${input.flashSaleEnabled ?? false},
      ${JSON.stringify(input.flashSaleConfig ?? {})}::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT (campaign_id) DO UPDATE SET
      schedule_type = EXCLUDED.schedule_type,
      send_at = EXCLUDED.send_at,
      recurring_pattern = EXCLUDED.recurring_pattern,
      smart_send_enabled = EXCLUDED.smart_send_enabled,
      smart_send_config = EXCLUDED.smart_send_config,
      flash_sale_enabled = EXCLUDED.flash_sale_enabled,
      flash_sale_config = EXCLUDED.flash_sale_config,
      updated_at = NOW()
  `;

  return scheduleId;
};

/**
 * List campaigns due for sending (scheduled or immediate).
 * Runs periodically (e.g., every 5 minutes).
 */
export const listDueCampaigns = async (): Promise<
  Array<{
    campaignId: string;
    shopDomain: string;
    title: string;
    body: string;
    targetUrl: string | null;
    iconUrl: string | null;
    imageUrl: string | null;
    segmentId: string | null;
    scheduleType: string;
    smartSendEnabled: boolean;
    smartSendConfig: Record<string, unknown>;
    flashSaleEnabled: boolean;
    flashSaleConfig: Record<string, unknown>;
  }>
> => {
  const sql = getNeonSql();

  const rows = await sql`
    SELECT
      c.id AS campaign_id,
      c.shop_domain,
      c.title,
      c.body,
      c.target_url,
      c.icon_url,
      c.image_url,
      c.segment_id,
      cs.schedule_type,
      cs.smart_send_enabled,
      cs.smart_send_config,
      cs.flash_sale_enabled,
      cs.flash_sale_config
    FROM campaigns c
    JOIN campaign_schedules cs ON cs.campaign_id = c.id
    WHERE (
      (cs.schedule_type = 'immediate' AND c.status = 'draft')
      OR (cs.schedule_type = 'scheduled' AND c.status = 'scheduled' AND cs.send_at <= NOW())
      OR (cs.schedule_type = 'recurring' AND c.status = 'sent')
    )
    AND c.sent_at IS NULL
    ORDER BY COALESCE(cs.send_at, NOW()) ASC
    LIMIT 100
  `;

  return rows.map((row) => ({
    campaignId: String(row.campaign_id),
    shopDomain: String(row.shop_domain),
    title: String(row.title),
    body: String(row.body),
    targetUrl: row.target_url ? String(row.target_url) : null,
    iconUrl: row.icon_url ? String(row.icon_url) : null,
    imageUrl: row.image_url ? String(row.image_url) : null,
    segmentId: row.segment_id ? String(row.segment_id) : null,
    scheduleType: String(row.schedule_type),
    smartSendEnabled: Boolean(row.smart_send_enabled),
    smartSendConfig: (row.smart_send_config ?? {}) as Record<string, unknown>,
    flashSaleEnabled: Boolean(row.flash_sale_enabled),
    flashSaleConfig: (row.flash_sale_config ?? {}) as Record<string, unknown>,
  }));
};

/**
 * Mark campaign as sent.
 */
export const markCampaignAsSent = async (campaignId: string) => {
  const sql = getNeonSql();

  await sql`
    UPDATE campaigns
    SET status = 'sent', sent_at = NOW(), updated_at = NOW()
    WHERE id = ${campaignId}
  `;
};

/**
 * Get next send time for recurring campaign (based on cron pattern).
 * Simple parser for common cron patterns.
 */
export const getNextSendTimeForRecurring = (cronPattern: string | null): Date | null => {
  if (!cronPattern) {
    return null;
  }

  const parts = cronPattern.split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  try {
    // Parse hour (simple: just take first hour value)
    const hourNum = parseInt(hour.split(',')[0], 10);
    if (isNaN(hourNum) || hourNum < 0 || hourNum > 23) {
      return null;
    }

    const now = new Date();
    let next = new Date(now);
    next.setHours(hourNum, 0, 0, 0);

    // If next time is in past today, move to tomorrow
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  } catch {
    return null;
  }
};
