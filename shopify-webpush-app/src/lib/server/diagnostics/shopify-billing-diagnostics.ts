import { env, isValidPostgresConnectionString } from '@/lib/config/env';
import { getNeonSql } from '@/lib/integrations/database/neon';
import { callPushEagleBilling } from '@/lib/server/billing/push-eagle-client';
import { getShopifyStoreCredentials } from '@/lib/server/billing/shopify-credentials-store';
import { getShopifyOfflineAccessToken, hasShopifySessionDatabase } from '@/lib/server/billing/shopify-session';
import { probeMerchantToken, probePrismaSessionSources } from '@/lib/server/billing/session-probe';
import { buildShopifyAppConnectUrl } from '@/lib/server/billing/shopify-connect-url';
import { buildShopifyReauthorizeUrl } from '@/lib/server/billing/shopify-offline-token-refresh';
import { validateShopifyAccessToken } from '@/lib/server/billing/shopify-token-validation';

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

const probeDashboardHealth = async () => {
  const root = (env.NEXT_PUBLIC_APP_URL || env.SHOPIFY_APP_URL).replace(/\/$/, '');
  const healthUrl = new URL('/api/health/system', root);

  try {
    const response = await fetch(healthUrl.toString(), { cache: 'no-store' });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const health = (payload?.health ?? null) as Record<string, unknown> | null;
    return {
      ok: response.ok,
      status: response.status,
      url: healthUrl.toString(),
      database: health?.database ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url: healthUrl.toString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const probeLocalSessionSync = async (shopDomain: string) => {
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

  const neonUrl = env.NEON_DATABASE_URL || env.DATABASE_URL;
  const sessionUrl = env.SHOPIFY_SESSION_DATABASE_URL;

  const environment = {
    neonDatabaseUrl: envFlag(neonUrl),
    neonDatabaseUrlValid: isValidPostgresConnectionString(neonUrl),
    shopifySessionDatabaseUrl: envFlag(sessionUrl),
    shopifySessionDatabaseUrlValid: isValidPostgresConnectionString(sessionUrl),
    shopifySessionDatabaseAutoResolved: hasShopifySessionDatabase(),
    shopifyApiKey: envFlag(env.SHOPIFY_API_KEY),
    shopifyApiSecret: envFlag(env.SHOPIFY_API_SECRET),
    shopifyDashboardSsoSecret: envFlag(env.SHOPIFY_DASHBOARD_SSO_SECRET),
    shopifyAppUrl: env.SHOPIFY_APP_URL || env.NEXT_PUBLIC_APP_URL,
    billingTestMode: process.env.SHOPIFY_BILLING_TEST === 'true',
    nextPublicAppUrl: env.NEXT_PUBLIC_APP_URL,
  };

  if (!environment.neonDatabaseUrl) {
    issues.push('NEON_DATABASE_URL is missing on the dashboard Vercel project.');
    recommendations.push('Set NEON_DATABASE_URL to your Neon Postgres connection string.');
  } else if (!environment.neonDatabaseUrlValid) {
    issues.push(
      'NEON_DATABASE_URL is present but not a valid Postgres URL (often caused by wrapping quotes in Vercel).',
    );
    recommendations.push(
      'In Vercel → Environment Variables, paste the Neon URL without surrounding double quotes.',
    );
  } else if (!environment.shopifySessionDatabaseUrlValid && environment.shopifySessionDatabaseUrl) {
    issues.push('SHOPIFY_SESSION_DATABASE_URL is present but not a valid Postgres URL.');
    recommendations.push(
      'Use the same Neon URL with &schema=shopify_sessions and no wrapping quotes.',
    );
  }
  if (!environment.shopifySessionDatabaseUrl && !environment.shopifySessionDatabaseAutoResolved) {
    issues.push('SHOPIFY_SESSION_DATABASE_URL is missing and could not be derived from NEON_DATABASE_URL.');
    recommendations.push(
      'Set SHOPIFY_SESSION_DATABASE_URL to the same Neon URL as NEON_DATABASE_URL.',
    );
  }
  if (!environment.shopifyDashboardSsoSecret) {
    issues.push('SHOPIFY_DASHBOARD_SSO_SECRET is missing on the dashboard.');
    recommendations.push('Set SHOPIFY_DASHBOARD_SSO_SECRET to the same value as SHOPIFY_API_SECRET on the dashboard Vercel project.');
  }
  if (!environment.shopifyApiKey) {
    issues.push('SHOPIFY_API_KEY is missing on the dashboard.');
  }

  const neon = await probeNeon();
  if (!neon.ok) {
    issues.push(`Neon database connection failed: ${neon.error}`);
  }

  const dashboardHealth = await probeDashboardHealth();
  if (!dashboardHealth.ok) {
    issues.push('Dashboard health check failed (push-eagle-dashboard.vercel.app).');
    recommendations.push('Confirm the dashboard Vercel project is deployed and NEON_DATABASE_URL is set.');
  } else if (dashboardHealth.database === 'unhealthy' || dashboardHealth.database === 'error') {
    issues.push('Dashboard cannot reach Neon Postgres.');
    recommendations.push('Set NEON_DATABASE_URL on the dashboard Vercel project, then redeploy.');
  }

  let merchantToken = null as Awaited<ReturnType<typeof probeMerchantToken>> | null;
  let credentialsTable = null as Awaited<ReturnType<typeof getShopifyStoreCredentials>> | null;
  let prismaSessions: Awaited<ReturnType<typeof probePrismaSessionSources>> = [];
  let resolvedToken: string | null = null;
  let localSessionSync: Awaited<ReturnType<typeof probeLocalSessionSync>> | null = null;
  let graphqlProbe: Awaited<ReturnType<typeof probeShopifyGraphql>> | null = null;
  let tokenValidation: { ok: boolean; error?: string | null } | null = null;

  if (shopDomain) {
    merchantToken = await probeMerchantToken(shopDomain);
    credentialsTable = await getShopifyStoreCredentials(shopDomain);
    prismaSessions = await probePrismaSessionSources(shopDomain);
    const { getValidatedShopifyOfflineAccessToken } = await import(
      '@/lib/server/billing/shopify-session'
    );
    resolvedToken = await getValidatedShopifyOfflineAccessToken(shopDomain);

    if (!merchantToken.found) {
      issues.push('No offline token stored on merchants.shopify_offline_access_token for this shop.');
    }
    if (!credentialsTable?.offlineAccessToken) {
      issues.push('No row in shopify_store_credentials table for this shop.');
      recommendations.push(
        'Open Apps → Push Eagle from Shopify admin once so OAuth can save a validated token to shopify_store_credentials.',
      );
    }
    if (!prismaSessions.some((row) => row.found)) {
      issues.push('No Prisma Session row found in Neon for this shop (public.Session).');
      recommendations.push(`Open Apps → Push Eagle from Shopify admin, or visit ${buildShopifyAppConnectUrl(shopDomain)}`);
    }
    if (!resolvedToken) {
      issues.push('getShopifyOfflineAccessToken() returned null — billing cannot call appSubscriptionCreate.');
    }

    localSessionSync = await probeLocalSessionSync(shopDomain);
    if (!localSessionSync.ok) {
      issues.push(`Local session sync failed: ${localSessionSync.error}`);
      if (String(localSessionSync.error).includes('401')) {
        recommendations.push('SHOPIFY_DASHBOARD_SSO_SECRET should match SHOPIFY_API_SECRET on the dashboard project.');
      }
    }

    if (resolvedToken) {
      const valid = await validateShopifyAccessToken(shopDomain, resolvedToken);
      tokenValidation = { ok: valid, error: valid ? null : 'Token failed Shopify GraphQL validation (likely expired).' };
      graphqlProbe = await probeShopifyGraphql(shopDomain, resolvedToken);
      if (!valid || !graphqlProbe.ok) {
        issues.push(`Shopify Admin GraphQL rejected the offline token: ${graphqlProbe.error || 'invalid or expired token'}`);
        recommendations.push(
          `Re-authorize Push Eagle via Shopify OAuth install: ${buildShopifyReauthorizeUrl(shopDomain)}`,
        );
        recommendations.push('Or open Apps → Push Eagle in Shopify admin so OAuth completes on the dashboard.');
        recommendations.push(
          'If this persists, uninstall and reinstall Push Eagle on the dev store, then open the app again.',
        );
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
      dashboardHealth,
      merchantToken,
      credentialsTable: credentialsTable
        ? {
            found: true,
            source: credentialsTable.source,
            verifiedAt: credentialsTable.verifiedAt,
            updatedAt: credentialsTable.updatedAt,
          }
        : { found: false },
      prismaSessions,
      resolvedTokenPresent: Boolean(resolvedToken),
      tokenValidation,
      localSessionSync,
      shopifyGraphql: graphqlProbe,
    },
    issues,
    recommendations,
  };

  return report;
};
