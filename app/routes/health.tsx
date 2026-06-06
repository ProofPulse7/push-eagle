import type { LoaderFunctionArgs } from "react-router";

import db from "../db.server";
import { hasShopifyConfig, missingShopifyConfig } from "../shopify.server";

const maskDatabaseUrl = (value: string | undefined) => {
  if (!value?.trim()) {
    return null;
  }

  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "invalid_url";
  }
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop")?.trim().toLowerCase() ?? null;

  let database = {
    configured: Boolean(process.env.DATABASE_URL?.trim()),
    urlPreview: maskDatabaseUrl(process.env.DATABASE_URL),
    ok: false as boolean,
    sessionTableOk: false as boolean,
    error: null as string | null,
    shopSessionFound: false as boolean,
    totalSessions: 0,
  };

  if (database.configured) {
    try {
      await db.$queryRaw`SELECT 1 as ok`;
      database.ok = true;
      const total = await db.session.count();
      database.totalSessions = total;
      database.sessionTableOk = true;

      if (shop?.endsWith(".myshopify.com")) {
        const offlineId = `offline_${shop}`;
        const row =
          (await db.session.findFirst({ where: { id: offlineId } })) ||
          (await db.session.findFirst({ where: { shop, isOnline: false } }));
        database.shopSessionFound = Boolean(row?.accessToken);
      }
    } catch (error) {
      database.error = error instanceof Error ? error.message : String(error);
    }
  } else {
    database.error = "DATABASE_URL is not set on the push-eagle Vercel project.";
  }

  return Response.json({
    ok: database.ok,
    hasShopifyConfig,
    missingShopifyConfig,
    appUrl: process.env.SHOPIFY_APP_URL || process.env.VERCEL_URL || null,
    host: url.host,
    timestamp: new Date().toISOString(),
    database,
  });
};
