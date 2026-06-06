import { getNeonSql } from '@/lib/integrations/database/neon';

let tableReady = false;

export const ensureShopifyCredentialsTable = async () => {
  if (tableReady) {
    return;
  }

  const sql = getNeonSql();
  await sql`
    CREATE TABLE IF NOT EXISTS shopify_store_credentials (
      shop_domain TEXT PRIMARY KEY,
      offline_access_token TEXT NOT NULL,
      scopes TEXT,
      source TEXT,
      token_valid BOOLEAN NOT NULL DEFAULT true,
      verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  tableReady = true;
};

export const upsertShopifyStoreCredentials = async (input: {
  shopDomain: string;
  offlineAccessToken: string;
  scopes?: string | null;
  source: string;
  tokenValid?: boolean;
}) => {
  await ensureShopifyCredentialsTable();
  const sql = getNeonSql();
  const shop = input.shopDomain.trim().toLowerCase();

  await sql`
    INSERT INTO shopify_store_credentials (
      shop_domain,
      offline_access_token,
      scopes,
      source,
      token_valid,
      verified_at,
      updated_at
    )
    VALUES (
      ${shop},
      ${input.offlineAccessToken},
      ${input.scopes ?? null},
      ${input.source},
      ${input.tokenValid ?? true},
      CASE WHEN ${input.tokenValid ?? true} THEN NOW() ELSE NULL END,
      NOW()
    )
    ON CONFLICT (shop_domain) DO UPDATE SET
      offline_access_token = EXCLUDED.offline_access_token,
      scopes = COALESCE(EXCLUDED.scopes, shopify_store_credentials.scopes),
      source = EXCLUDED.source,
      token_valid = EXCLUDED.token_valid,
      verified_at = CASE WHEN EXCLUDED.token_valid THEN NOW() ELSE shopify_store_credentials.verified_at END,
      updated_at = NOW()
  `;
};

export const getShopifyStoreCredentials = async (shopDomain: string) => {
  await ensureShopifyCredentialsTable();
  const sql = getNeonSql();
  const shop = shopDomain.trim().toLowerCase();

  const rows = await sql`
    SELECT offline_access_token, scopes, source, token_valid, verified_at, updated_at
    FROM shopify_store_credentials
    WHERE shop_domain = ${shop}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row?.offline_access_token || row.token_valid === false) {
    return null;
  }

  return {
    offlineAccessToken: String(row.offline_access_token),
    scopes: row.scopes ? String(row.scopes) : null,
    source: row.source ? String(row.source) : null,
    verifiedAt: row.verified_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
};

export const markShopifyStoreCredentialsInvalid = async (shopDomain: string) => {
  await ensureShopifyCredentialsTable();
  const sql = getNeonSql();
  await sql`
    UPDATE shopify_store_credentials
    SET token_valid = false, updated_at = NOW()
    WHERE shop_domain = ${shopDomain.trim().toLowerCase()}
  `;
};
