import dotenv from 'dotenv';

import { neon } from '@neondatabase/serverless';

dotenv.config({ path: '.env.local' });

const connectionString = process.env.NEON_DATABASE_URL;

if (!connectionString) {
  throw new Error('Missing NEON_DATABASE_URL in .env.local');
}

const sql = neon(connectionString);

const statements = [
  `CREATE TABLE IF NOT EXISTS merchants (
    shop_domain TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS subscribers (
    id BIGSERIAL PRIMARY KEY,
    shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    browser TEXT,
    platform TEXT,
    locale TEXT,
    country TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shop_domain, external_id)
  )`,
  `CREATE TABLE IF NOT EXISTS subscriber_tokens (
    id BIGSERIAL PRIMARY KEY,
    shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
    subscriber_id BIGINT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    user_agent TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shop_domain, fcm_token)
  )`,
  `CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    target_url TEXT,
    icon_url TEXT,
    image_url TEXT,
    segment_id TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    delivery_count INTEGER NOT NULL DEFAULT 0,
    click_count INTEGER NOT NULL DEFAULT 0,
    revenue_cents INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS merchant_settings (
    shop_domain TEXT PRIMARY KEY REFERENCES merchants(shop_domain) ON DELETE CASCADE,
    attribution_model TEXT NOT NULL DEFAULT 'impression',
    click_window_days INTEGER NOT NULL DEFAULT 2,
    impression_window_days INTEGER NOT NULL DEFAULT 3,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS campaign_deliveries (
    id BIGSERIAL PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
    subscriber_id BIGINT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
    token_id BIGINT NOT NULL REFERENCES subscriber_tokens(id) ON DELETE CASCADE,
    fcm_message_id TEXT,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    clicked_at TIMESTAMPTZ,
    converted_at TIMESTAMPTZ,
    order_id TEXT,
    revenue_cents INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS campaign_clicks (
    id BIGSERIAL PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
    subscriber_id BIGINT REFERENCES subscribers(id) ON DELETE SET NULL,
    target_url TEXT NOT NULL,
    clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent TEXT,
    ip_address TEXT,
    referrer TEXT,
    order_id TEXT,
    converted_at TIMESTAMPTZ,
    revenue_cents INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_subscriber_tokens_shop_status ON subscriber_tokens(shop_domain, status)`,
  `CREATE INDEX IF NOT EXISTS idx_campaigns_shop_created ON campaigns(shop_domain, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_campaign ON campaign_deliveries(campaign_id)`,
  `CREATE INDEX IF NOT EXISTS idx_campaign_clicks_campaign_time ON campaign_clicks(campaign_id, clicked_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_campaign_clicks_shop_subscriber ON campaign_clicks(shop_domain, subscriber_id, clicked_at DESC)`,
];

for (const statement of statements) {
  await sql.query(statement);
}

const [campaignCount] = await sql`SELECT COUNT(*)::int AS count FROM campaigns`;

console.log('Neon bootstrap complete.');
console.log(`Campaign rows currently present: ${campaignCount.count}`);
