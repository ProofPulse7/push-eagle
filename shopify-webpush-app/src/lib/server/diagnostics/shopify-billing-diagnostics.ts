import { env } from '@/lib/config/env';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { callPushEagleBilling } from '@/lib/server/billing/push-eagle-client';
import { getShopifyOfflineAccessToken, hasShopifySessionDatabase } from '@/lib/server/billing/shopify-session';
import { probeMerchantToken, probePrismaSessionSources } from '@/lib/server/billing/session-probe';

export type ShopifyBillingDiagnosticReport = {
  generatedAt: string;
  shopDomain: string | null;
  overallStatus: 'healthy' | 'degraded' | 'broken';
  summary: string;
  checks: Record<string, unknown>;
  issues: string[];
  recommendations: string[];
};

const envFlag = (value: string) => Boolean(value?.trim());

const probeNeon = async () => {
  try {
    const sql = getNeonSql();
    await sql`SELECT 1 as ok`;
    return { ok: true, error: null as string | null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const probeRemixHealth = async () => {
  const root = (env.SHOPIFY_ROOT_APP_URL || 'https://push-eagle.vercel.app').replace(/\/$/, '');
  try {
    const response = await fetch(`${root}/health`, { cache: 'no-store' });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return {
      ok: response.ok,
      status: response.status,
      url: `${root}/health`,
      hasShopifyConfig: payload?.hasShopifyConfig ?? null,
      missingShopifyConfig: payload?.missingShopifyConfig ?? null,
      appUrl: payload?.appUrl ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url: `${root}/health`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const probeRemixSessionSync = async (shopDomain: string) => {
  try {
    const result = await callPushEagleBilling('/api/shopify/session/sync', shopDomain, {});
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const probeShopifyGraphql = async (shopDomain: string, accessToken: string) => {
  const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || '2025-04';
  try {
    const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: `query { shop { name myshopifyDomain } }`,
      }),
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null)) as {
      data?: { shop?: { name?: string } };
      errors?: Array<{ message?: string }>;
    } | null;
    const shopName = payload?.data?.shop?.name ?? null;
    const graphQLError = payload?.errors?.[0]?.message ?? null;
    return {
      ok: response.ok && Boolean(shopName) && !graphQLError,
      status: response.status,
      shopName,
      error: graphQLError || (!response.ok ? `HTTP ${response.status}` : null),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      shopName: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const runShopifyBillingDiagnostics = async (shopDomain: string | null) => {
  const issues: string[] = [];
  const recommendations: string[] = [];

  const environment = {
    neonDatabaseUrl: envFlag(env.NEON_DATABASE_URL || env.DATABASE_URL),
    shopifySessionDatabaseUrl: envFlag(env.SHOPIFY_SESSION_DATABASE_URL),
    shopifySessionDatabaseAutoResolved: hasShopifySessionDatabase(),
    shopifyApiKey: envFlag(env.SHOPIFY_API_KEY),
    shopifyApiSecret: envFlag(env.SHOPIFY_API_SECRET),
    shopifyDashboardSsoSecret: envFlag(env.SHOPIFY_DASHBOARD_SSO_SECRET),
    shopifyRootAppUrl: env.SHOPIFY_ROOT_APP_URL,
    billingTestMode: process.env.SHOPIFY_BILLING_TEST === 'true',
    nextPublicAppUrl: env.NEXT_PUBLIC_APP_URL,
  };

  if (!environment.neonDatabaseUrl) {
    issues.push('NEON_DATABASE_URL is missing on the dashboard Vercel project.');
    recommendations.push('Set NEON_DATABASE_URL to your Neon Postgres connection string.');
  }
  if (!environment.shopifySessionDatabaseUrl && !environment.shopifySessionDatabaseAutoResolved) {
    issues.push('SHOPIFY_SESSION_DATABASE_URL is missing and could not be derived from NEON_DATABASE_URL.');
    recommendations.push(
      'Set SHOPIFY_SESSION_DATABASE_URL to the same Neon URL as the Remix app DATABASE_URL with &schema=shopify_sessions.',
    );
  }
  if (!environment.shopifyDashboardSsoSecret) {
    issues.push('SHOPIFY_DASHBOARD_SSO_SECRET is missing on the dashboard.');
    recommendations.push('Set SHOPIFY_DASHBOARD_SSO_SECRET to the same value as SHOPIFY_API_SECRET on both Vercel projects.');
  }
  if (!environment.shopifyApiKey) {
    issues.push('SHOPIFY_API_KEY is missing on the dashboard.');
  }

  const neon = await probeNeon();
  if (!neon.ok) {
    issues.push(`Neon database connection failed: ${neon.error}`);
  }

  const remixHealth = await probeRemixHealth();
  if (!remixHealth.ok) {
    issues.push('Remix Shopify app health check failed (push-eagle.vercel.app).');
    recommendations.push('Verify the push-eagle Vercel project is deployed and DATABASE_URL points to Neon with schema=shopify_sessions.');
  } else if (remixHealth.hasShopifyConfig === false) {
    issues.push(`Remix app missing Shopify env: ${JSON.stringify(remixHealth.missingShopifyConfig)}`);
  }

  let merchantToken = null as Awaited<ReturnType<typeof probeMerchantToken>> | null;
  let prismaSessions: Awaited<ReturnType<typeof probePrismaSessionSources>> = [];
  let resolvedToken: string | null = null;
  let remixSync: Awaited<ReturnType<typeof probeRemixSessionSync>> | null = null;
  let graphqlProbe: Awaited<ReturnType<typeof probeShopifyGraphql>> | null = null;

  if (shopDomain) {
    merchantToken = await probeMerchantToken(shopDomain);
    prismaSessions = await probePrismaSessionSources(shopDomain);
    resolvedToken = await getShopifyOfflineAccessToken(shopDomain);

    if (!merchantToken.found) {
      issues.push('No offline token stored on merchants.shopify_offline_access_token for this shop.');
    }
    if (!prismaSessions.some((row) => row.found)) {
      issues.push('No Prisma Session row found in Neon for this shop (shopify_sessions schema).');
      recommendations.push('Open Apps → Push Eagle from Shopify admin once to complete OAuth on push-eagle.vercel.app/app.');
    }
    if (!resolvedToken) {
      issues.push('getShopifyOfflineAccessToken() returned null — billing cannot call appSubscriptionCreate.');
    }

    remixSync = await probeRemixSessionSync(shopDomain);
    if (!remixSync.ok) {
      issues.push(`Remix session sync API failed: ${remixSync.error}`);
      if (String(remixSync.error).includes('401')) {
        recommendations.push('SHOPIFY_DASHBOARD_SSO_SECRET must match on dashboard and Remix (usually same as SHOPIFY_API_SECRET).');
      }
      if (String(remixSync.error).includes('404')) {
        recommendations.push('Remix DATABASE_URL on push-eagle Vercel must be Neon Postgres (not SQLite) with schema=shopify_sessions.');
      }
    }

    if (resolvedToken) {
      graphqlProbe = await probeShopifyGraphql(shopDomain, resolvedToken);
      if (!graphqlProbe.ok) {
        issues.push(`Shopify Admin GraphQL rejected the offline token: ${graphqlProbe.error}`);
        recommendations.push('Re-open the app from Shopify admin to refresh the offline access token.');
      }
    }
  } else {
    issues.push('No shop domain in URL or pe_shop cookie — diagnostics cannot test this store.');
    recommendations.push('Open the dashboard from Shopify admin (Apps → Push Eagle) or add ?shop=your-store.myshopify.com');
  }

  const overallStatus: ShopifyBillingDiagnosticReport['overallStatus'] =
    !shopDomain || !resolvedToken || issues.length > 0
      ? issues.some((item) => item.includes('connection failed') || item.includes('returned null'))
        ? 'broken'
        : 'degraded'
      : 'healthy';

  const summary =
    overallStatus === 'healthy'
      ? 'Shopify billing prerequisites look good for this store.'
      : 'Shopify billing is blocked — see issues and recommendations below.';

  const report: ShopifyBillingDiagnosticReport = {
    generatedAt: new Date().toISOString(),
    shopDomain,
    overallStatus,
    summary,
    checks: {
      environment,
      neon,
      remixHealth,
      merchantToken,
      prismaSessions,
      resolvedTokenPresent: Boolean(resolvedToken),
      remixSessionSync: remixSync,
      shopifyGraphql: graphqlProbe,
    },
    issues,
    recommendations,
  };

  return report;
};
