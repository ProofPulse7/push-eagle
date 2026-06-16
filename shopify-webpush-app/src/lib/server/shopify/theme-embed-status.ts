import { requireShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';

const SHOPIFY_APP_CLIENT_ID = process.env.SHOPIFY_API_KEY?.trim() || 'c866e24e9ce383cebeee6edb01496449';
const THEME_EMBED_BLOCK_HANDLE = 'star_rating';
const THEME_EMBED_UID = 'c81adf32-0081-1f62-6abf-0339e039c8c204a8bb99';

const THEME_EMBED_STATUS_QUERY = `
  query PushEagleThemeEmbedStatus {
    themes(first: 1, roles: [MAIN]) {
      nodes {
        id
        name
        files(filenames: ["config/settings_data.json"]) {
          nodes {
            filename
            body {
              ... on OnlineStoreThemeFileBodyText {
                content
              }
            }
          }
        }
      }
    }
  }
`;

const adminApiVersion = () =>
  process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || '2025-04';

const stripJsonComments = (content: string) =>
  content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const parseSettingsData = (content: string) => {
  try {
    return JSON.parse(stripJsonComments(content)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const isPushEagleThemeEmbedBlock = (type: string) => {
  const normalized = type.toLowerCase();
  return (
    normalized.includes(SHOPIFY_APP_CLIENT_ID.toLowerCase())
    || normalized.includes(THEME_EMBED_BLOCK_HANDLE)
    || normalized.includes(THEME_EMBED_UID.toLowerCase())
  );
};

export const isPushEagleThemeEmbedEnabledInSettings = (settingsData: unknown): boolean => {
  if (!settingsData || typeof settingsData !== 'object') {
    return false;
  }

  const current = settingsData.current;
  if (!current || typeof current !== 'object') {
    return false;
  }

  const blocks = (current as Record<string, unknown>).blocks;
  if (!blocks || typeof blocks !== 'object') {
    return false;
  }

  for (const block of Object.values(blocks as Record<string, unknown>)) {
    if (!block || typeof block !== 'object') {
      continue;
    }

    const record = block as Record<string, unknown>;
    const type = String(record.type ?? '');
    const disabled = record.disabled === true;

    if (isPushEagleThemeEmbedBlock(type) && !disabled) {
      return true;
    }
  }

  return false;
};

export type ThemeEmbedStatusResult = {
  enabled: boolean;
  checkAvailable: boolean;
  themeName?: string | null;
  themeEditorUrl?: string | null;
  reason?: string | null;
};

const parseThemeNumericId = (themeGid: string) => themeGid.match(/(\d+)$/)?.[1] ?? null;

export const buildThemeAppEmbedEditorUrl = (
  shopDomain: string,
  themeGid?: string | null,
): string | null => {
  const shop = shopDomain.trim().toLowerCase();
  if (!shop.endsWith('.myshopify.com')) {
    return null;
  }

  const storeHandle = shop.slice(0, -'.myshopify.com'.length);
  const themeNumericId = themeGid ? parseThemeNumericId(themeGid) : null;
  const themePath = themeNumericId ?? 'current';
  const params = new URLSearchParams({
    context: 'apps',
    activateAppId: `${SHOPIFY_APP_CLIENT_ID}/${THEME_EMBED_BLOCK_HANDLE}`,
  });

  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/themes/${themePath}/editor?${params.toString()}`;
};

export const getThemeEmbedStatus = async (shopDomain: string): Promise<ThemeEmbedStatusResult> => {
  let accessToken: string;

  try {
    accessToken = await requireShopifyOfflineAccessToken(shopDomain);
  } catch {
    return {
      enabled: false,
      checkAvailable: false,
      themeEditorUrl: buildThemeAppEmbedEditorUrl(shopDomain),
      reason: 'missing_offline_token',
    };
  }

  const response = await fetch(
    `https://${shopDomain}/admin/api/${adminApiVersion()}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query: THEME_EMBED_STATUS_QUERY }),
      signal: AbortSignal.timeout(8_000),
    },
  );

  const payload = (await response.json()) as {
    data?: {
      themes?: {
        nodes?: Array<{
          id?: string | null;
          name?: string | null;
          files?: {
            nodes?: Array<{
              body?: {
                content?: string | null;
              } | null;
            }>;
          } | null;
        }>;
      } | null;
    };
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || payload.errors?.length) {
    return {
      enabled: false,
      checkAvailable: false,
      themeEditorUrl: buildThemeAppEmbedEditorUrl(shopDomain),
      reason: payload.errors?.[0]?.message || `shopify_error_${response.status}`,
    };
  }

  const theme = payload.data?.themes?.nodes?.[0];
  const themeEditorUrl = buildThemeAppEmbedEditorUrl(shopDomain, theme?.id ?? null);
  const content = theme?.files?.nodes?.[0]?.body?.content;

  if (!content) {
    return {
      enabled: false,
      checkAvailable: true,
      themeName: theme?.name ?? null,
      themeEditorUrl,
      reason: 'settings_data_missing',
    };
  }

  const settingsData = parseSettingsData(content);

  return {
    enabled: isPushEagleThemeEmbedEnabledInSettings(settingsData),
    checkAvailable: true,
    themeName: theme?.name ?? null,
    themeEditorUrl,
  };
};
