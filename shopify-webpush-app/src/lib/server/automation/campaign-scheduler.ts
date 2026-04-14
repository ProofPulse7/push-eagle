/**
 * Campaign Scheduler & Scheduler Engine
 * Handles scheduled campaigns, recurring patterns, and flash sales
 */

import {randomUUID } from 'crypto';
import { getNeonSql } from '@/lib/integrations/database/neon';

export type ScheduleCampaignInput = {
  campaignId: string;
  shopDomain: string;
  scheduleType: 'once' | 'recurring' | 'flash_sale';
  sendAt?: Date | null;
  recurringPattern?: string | null; // cron expression: "0 10 * * 1" = Monday 10AM
  smartSendEnabled?: boolean;
  smartSendConfig?: Record<string, unknown> | null;
  flashSaleEnabled?: boolean;
  flashSaleConfig?: Record<string, unknown> | null;
  flashSaleEndsAt?: Date | null;
};

/**
 * Schedule a campaign for sending
 */
export const scheduleCampaign = async (input: ScheduleCampaignInput): Promise<string> => {
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
      ${input.smartSendConfig ? JSON.stringify(input.smartSendConfig) : null}::jsonb,
      ${input.flashSaleEnabled ?? false},
      ${input.flashSaleConfig ? JSON.stringify(input.flashSaleConfig) : null}::jsonb,
      NOW(),
      NOW()
    )
  `;

  // Update campaign status
  await sql`
    UPDATE campaigns
    SET
      status = ${input.scheduleType === 'flash_sale' ? 'scheduled' : 'scheduled'},
      scheduled_at = ${input.sendAt ?? null},
      flash_sale_enabled = ${input.flashSaleEnabled ?? false},
      flash_sale_ends_at = ${input.flashSaleEndsAt ?? null}
    WHERE id = ${input.campaignId}
  `;

  return scheduleId;
};

/**
 * Get campaigns due to send (respecting smart delivery optimization)
 */
export const getCampaignsDueToSend = async (limit = 100) => {
  const sql = getNeonSql();

  const campaigns = await sql`
    SELECT
      c.id,
      c.shop_domain,
      c.title,
      c.body,
      c.target_url,
      c.icon_url,
      c.image_url,
      c.segment_id,
      c.smart_send_enabled,
      cs.schedule_type,
      cs.smart_send_config
    FROM campaigns c
    LEFT JOIN campaign_schedules cs ON cs.campaign_id = c.id
    WHERE c.status = 'scheduled'
      AND (
        cs.schedule_type = 'once'
        OR cs.schedule_type = 'flash_sale'
      )
      AND cs.send_at <= NOW()
      AND c.flash_sale_ends_at > NOW()
    ORDER BY cs.send_at ASC NULLS LAST, c.created_at ASC
    LIMIT ${limit}
  `;

  return campaigns as Array<{
    id: string;
    shop_domain: string;
    title: string;
    body: string;
    target_url: string | null;
    icon_url: string | null;
    image_url: string | null;
    segment_id: string | null;
    smart_send_enabled: boolean;
    schedule_type: string;
    smart_send_config: Record<string, unknown> | null;
  }>;
};

/**
 * Start sending scheduled campaign to audience
 */
export const startCampaignDelivery = async (campaignId: string, shopDomain: string) => {
  const sql = getNeonSql();

  // Update campaign status to sending
  await sql`
    UPDATE campaigns
    SET status = 'sending', updated_at = NOW()
    WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
  `;

  return { campaignId, started: true };
};

/**
 * Mark campaign as sent
 */
export const markCampaignSent = async (campaignId: string, shopDomain: string) => {
  const sql = getNeonSql();

  const result = await sql`
    UPDATE campaigns
    SET status = 'sent', sent_at = NOW(), updated_at = NOW()
    WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
    RETURNING id
  `;

  return result.length > 0;
};

/**
 * Get recurring campaigns due
 */
export const getRecurringCampaignsDue = async (limit = 50) => {
  const sql = getNeonSql();

  const campaigns = await sql`
    SELECT
      c.id,
      c.shop_domain,
      cs.recurring_pattern,
      cs.id as schedule_id
    FROM campaigns c
    JOIN campaign_schedules cs ON cs.campaign_id = c.id
    WHERE cs.schedule_type = 'recurring'
      AND c.status IN ('scheduled', 'sent')
      AND cs.recurring_pattern IS NOT NULL
    LIMIT ${limit}
  `;

  return campaigns as Array<{
    id: string;
    shop_domain: string;
    recurring_pattern: string | null;
    schedule_id: string;
  }>;
};

/**
 * Get flash sale campaigns active
 */
export const getFlashSaleCampaignsActive = async (shopDomain: string) => {
  const sql = getNeonSql();

  const campaigns = await sql`
    SELECT
      c.id,
      c.title,
      c.body,
      c.flash_sale_ends_at,
      ROUND(100.0 * (EXTRACT(EPOCH FROM (c.flash_sale_ends_at - NOW())) / 
                      EXTRACT(EPOCH FROM (c.flash_sale_ends_at - c.created_at))))::INT as discount_percentage
    FROM campaigns c
    WHERE c.shop_domain = ${shopDomain}
      AND c.flash_sale_enabled = TRUE
      AND c.status IN ('sending', 'sent')
      AND c.flash_sale_ends_at > NOW()
    ORDER BY c.flash_sale_ends_at ASC
  `;

  return campaigns as Array<{
    id: string;
    title: string;
    body: string;
    flash_sale_ends_at: Date | string;
    discount_percentage: number;
  }>;
};

/**
 * Cancel scheduled campaign
 */
export const cancelScheduledCampaign = async (campaignId: string, shopDomain: string) => {
  const sql = getNeonSql();

  // Delete schedule
  await sql`
    DELETE FROM campaign_schedules
    WHERE campaign_id = ${campaignId}
  `;

  // Revert campaign status to draft
  await sql`
    UPDATE campaigns
    SET status = 'draft', updated_at = NOW()
    WHERE id = ${campaignId} AND shop_domain = ${shopDomain}
  `;

  return { cancelled: true };
};
