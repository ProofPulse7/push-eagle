import { neon } from '@neondatabase/serverless';

import { isValidPostgresConnectionString, sanitizePostgresConnectionString } from '@/lib/config/sanitize-connection-string';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { env } from '@/lib/config/env';

export type SessionProbeResult = {
  name: string;
  ok: boolean;
  found: boolean;
  error?: string;
};

const maskToken = (token: string | null | undefined) => {
  if (!token || token.length < 8) {
    return null;
  }
  return `${token.slice(0, 6)}…${token.slice(-4)} (len=${token.length})`;
};

export const probePrismaSessionSources = async (shop: string): Promise<SessionProbeResult[]> => {
  const url = sanitizePostgresConnectionString(env.SHOPIFY_SESSION_DATABASE_URL);
  if (!url || !isValidPostgresConnectionString(url)) {
    return [
      {
        name: 'shopify_session_database_url',
        ok: false,
        found: false,
        error: 'SHOPIFY_SESSION_DATABASE_URL is not configured on the dashboard.',
      },
    ];
  }

  const sql = neon(url);
  const offlineId = `offline_${shop}`;
  const probes: Array<{ name: string; run: () => Promise<{ accessToken?: string }[]> }> = [
    {
      name: 'shopify_sessions.Session.offline_id',
      run: () =>
        sql`
          SELECT "accessToken"
          FROM shopify_sessions."Session"
          WHERE id = ${offlineId}
          LIMIT 1
        `,
    },
    {
      name: 'shopify_sessions.Session.offline_shop',
      run: () =>
        sql`
          SELECT "accessToken"
          FROM shopify_sessions."Session"
          WHERE shop = ${shop}
            AND "isOnline" = false
          ORDER BY expires DESC NULLS LAST
          LIMIT 1
        `,
    },
    {
      name: 'public.Session.offline_id',
      run: () =>
        sql`
          SELECT "accessToken"
          FROM "Session"
          WHERE id = ${offlineId}
          LIMIT 1
        `,
    },
    {
      name: 'public.Session.any_shop',
      run: () =>
        sql`
          SELECT "accessToken"
          FROM "Session"
          WHERE shop = ${shop}
          ORDER BY "isOnline" ASC, expires DESC NULLS LAST
          LIMIT 1
        `,
    },
  ];

  const results: SessionProbeResult[] = [];
  for (const probe of probes) {
    try {
      const rows = await probe.run();
      const token = rows[0]?.accessToken;
      const found = typeof token === 'string' && token.length > 0;
      results.push({ name: probe.name, ok: true, found });
    } catch (error) {
      results.push({
        name: probe.name,
        ok: false,
        found: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
};

export const probeMerchantToken = async (shop: string) => {
  try {
    const sql = getNeonSql();
    const rows = await sql`
      SELECT shopify_offline_access_token, updated_at
      FROM merchants
      WHERE shop_domain = ${shop}
      LIMIT 1
    `;
    const token = rows[0]?.shopify_offline_access_token;
    const found = typeof token === 'string' && token.length > 0;
    return {
      ok: true,
      found,
      merchantExists: rows.length > 0,
      tokenPreview: maskToken(typeof token === 'string' ? token : null),
      updatedAt: rows[0]?.updated_at ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      found: false,
      merchantExists: false,
      tokenPreview: null,
      updatedAt: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
