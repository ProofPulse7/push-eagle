import { env } from '@/lib/config/env';

/**
 * Cloudflare D1 backing store for opt_in_prompt_stats.
 *
 * Uses the same deliveries/primary D1 database as d1-deliveries.ts.
 * When D1_OPT_IN_STATS_ENABLED=true, all opt-in stats reads/writes use D1.
 */

const getOptInStatsDatabaseId = () =>
  env.CLOUDFLARE_D1_DELIVERIES_DATABASE_ID.trim() || env.CLOUDFLARE_D1_DATABASE_ID.trim();

export const isD1OptInStatsEnabled = () =>
  env.D1_OPT_IN_STATS_ENABLED
  && Boolean(env.CLOUDFLARE_ACCOUNT_ID.trim())
  && Boolean(env.CLOUDFLARE_API_TOKEN.trim())
  && Boolean(getOptInStatsDatabaseId());

type D1QueryResult = {
  success: boolean;
  result?: Array<{ results?: unknown[]; meta?: Record<string, unknown> }>;
  errors?: Array<{ message?: string }>;
};

const runOptInD1Query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID.trim();
  const databaseId = getOptInStatsDatabaseId();

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    },
  );

  const payload = (await response.json()) as D1QueryResult;
  if (!response.ok || !payload.success) {
    const message = payload.errors?.[0]?.message ?? `D1 opt-in query failed (${response.status}).`;
    throw new Error(message);
  }

  return payload.result?.[0]?.results ?? [];
};

const asRows = (rows: unknown[]) => rows as Array<Record<string, unknown>>;

let schemaReady = false;

export const ensureD1OptInStatsSchema = async () => {
  if (schemaReady || !isD1OptInStatsEnabled()) return;

  await runOptInD1Query(`
    CREATE TABLE IF NOT EXISTS opt_in_prompt_stats (
      shop_domain TEXT NOT NULL,
      prompt_type TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      conversions INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (shop_domain, prompt_type)
    )
  `);

  schemaReady = true;
};

export const d1RecordOptInPromptEvent = async (input: {
  shopDomain: string;
  promptType: string;
  eventType: 'view' | 'click';
}): Promise<void> => {
  await ensureD1OptInStatsSchema();
  const now = new Date().toISOString();
  const viewDelta = input.eventType === 'view' ? 1 : 0;
  const clickDelta = input.eventType === 'click' ? 1 : 0;

  await runOptInD1Query(
    `INSERT INTO opt_in_prompt_stats (shop_domain, prompt_type, views, clicks, conversions, updated_at)
     VALUES (?, ?, ?, ?, 0, ?)
     ON CONFLICT (shop_domain, prompt_type) DO UPDATE SET
       views = opt_in_prompt_stats.views + ?,
       clicks = opt_in_prompt_stats.clicks + ?,
       updated_at = ?`,
    [
      input.shopDomain,
      input.promptType,
      viewDelta,
      clickDelta,
      now,
      viewDelta,
      clickDelta,
      now,
    ],
  );
};

export const d1RecordOptInPromptConversion = async (
  shopDomain: string,
  promptType: string,
): Promise<void> => {
  await ensureD1OptInStatsSchema();
  const now = new Date().toISOString();

  await runOptInD1Query(
    `INSERT INTO opt_in_prompt_stats (shop_domain, prompt_type, views, clicks, conversions, updated_at)
     VALUES (?, ?, 1, 1, 1, ?)
     ON CONFLICT (shop_domain, prompt_type) DO UPDATE SET
       conversions = opt_in_prompt_stats.conversions + 1,
       clicks = MAX(opt_in_prompt_stats.clicks, opt_in_prompt_stats.conversions + 1),
       views = MAX(opt_in_prompt_stats.views, MAX(opt_in_prompt_stats.clicks, opt_in_prompt_stats.conversions + 1)),
       updated_at = ?`,
    [shopDomain, promptType, now, now],
  );
};

export const d1GetOptInPromptStats = async (
  shopDomain: string,
): Promise<Array<{ prompt_type: string; views: number; clicks: number; conversions: number }>> => {
  await ensureD1OptInStatsSchema();
  const rows = asRows(await runOptInD1Query(
    `SELECT prompt_type, views, clicks, conversions FROM opt_in_prompt_stats WHERE shop_domain = ?`,
    [shopDomain],
  ));
  return rows.map((row) => ({
    prompt_type: String(row.prompt_type ?? ''),
    views: Number(row.views ?? 0),
    clicks: Number(row.clicks ?? 0),
    conversions: Number(row.conversions ?? 0),
  }));
};

export const d1RepairOptInPromptStats = async (
  shopDomain: string,
  promptType: string,
): Promise<void> => {
  const now = new Date().toISOString();
  await runOptInD1Query(
    `UPDATE opt_in_prompt_stats
     SET clicks = MAX(clicks, conversions),
         views = MAX(views, MAX(clicks, conversions)),
         updated_at = ?
     WHERE shop_domain = ? AND prompt_type = ?
       AND (clicks < conversions OR views < MAX(clicks, conversions))`,
    [now, shopDomain, promptType],
  );
};
