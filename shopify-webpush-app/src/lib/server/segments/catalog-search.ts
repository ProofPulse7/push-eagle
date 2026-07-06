import { getNeonSql } from '@/lib/integrations/database/neon';
import { getShopifyOfflineAccessToken } from '@/lib/server/billing/shopify-session';
import {
  isProductSearchQueryReady,
  productTitleMatchesQuery,
  toSqlLikePattern,
  toSqlPrefixPattern,
  type SegmentCatalogOption,
} from '@/lib/server/segments/catalog-match';

const adminApiVersion = () => process.env.SHOPIFY_ADMIN_API_VERSION?.trim() || '2025-04';

const shopifyGraphql = async (shopDomain: string, accessToken: string, query: string, variables: Record<string, unknown>) => {
  const response = await fetch(`https://${shopDomain}/admin/api/${adminApiVersion()}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    data?: Record<string, unknown>;
    errors?: Array<{ message?: string }>;
  };

  if (payload.errors?.length) {
    return null;
  }

  return payload.data ?? null;
};

const mergeCatalogOptions = (options: SegmentCatalogOption[], limit: number) => {
  const seen = new Set<string>();
  const merged: SegmentCatalogOption[] = [];

  for (const option of options) {
    const key = `${option.kind}:${option.value}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(option);
    if (merged.length >= limit) {
      break;
    }
  }

  return merged;
};

export const searchSegmentProducts = async (
  shopDomain: string,
  query: string,
  limit = 20,
): Promise<SegmentCatalogOption[]> => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery || !isProductSearchQueryReady(trimmedQuery)) {
    return [];
  }

  const sql = getNeonSql();
  const prefixPattern = toSqlPrefixPattern(trimmedQuery.split(/\s+/)[0] ?? trimmedQuery);

  const { isD1CatalogEnabled, d1SearchSegmentProducts } = await import(
    '@/lib/server/integrations/d1-catalog'
  );

  const catalogRows = isD1CatalogEnabled()
    ? await d1SearchSegmentProducts(shopDomain, trimmedQuery, limit * 4)
    : await sql`
      SELECT DISTINCT ON (product_id)
        product_id,
        product_title,
        handle
      FROM shopify_product_variants
      WHERE shop_domain = ${shopDomain}
        AND (
          LOWER(product_title) LIKE ${prefixPattern}
          OR product_id = ${trimmedQuery}
        )
      ORDER BY product_id, last_seen_at DESC
      LIMIT ${limit * 4}
    `;

  const orderRows = await sql`
    SELECT DISTINCT product_id, product_title
    FROM shopify_order_items
    WHERE shop_domain = ${shopDomain}
      AND product_title IS NOT NULL
      AND TRIM(product_title) <> ''
      AND LOWER(product_title) LIKE ${prefixPattern}
    ORDER BY product_title ASC
    LIMIT ${limit * 4}
  `;

  const options: SegmentCatalogOption[] = [];

  for (const row of catalogRows as Array<Record<string, unknown>>) {
    const productId = String(row.product_id ?? '').trim();
    const productTitle = String(row.product_title ?? '').trim();
    if (!productId || !productTitle) {
      continue;
    }
    if (!productTitleMatchesQuery(productTitle, trimmedQuery)) {
      continue;
    }
    options.push({
      value: productId,
      label: productTitle,
      handle: row.handle == null ? null : String(row.handle),
      kind: 'product',
    });
  }

  for (const row of orderRows as Array<Record<string, unknown>>) {
    const productId = String(row.product_id ?? '').trim() || String(row.product_title ?? '').trim();
    const productTitle = String(row.product_title ?? '').trim();
    if (!productTitle || !productTitleMatchesQuery(productTitle, trimmedQuery)) {
      continue;
    }
    options.push({
      value: productId,
      label: productTitle,
      kind: 'product',
    });
  }

  return mergeCatalogOptions(options, limit).sort((left, right) => left.label.localeCompare(right.label));
};

export const searchSegmentCollections = async (
  shopDomain: string,
  query: string,
  limit = 20,
): Promise<SegmentCatalogOption[]> => {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const sql = getNeonSql();
  const likePattern = toSqlLikePattern(trimmedQuery);
  const options: SegmentCatalogOption[] = [];

  const accessToken = await getShopifyOfflineAccessToken(shopDomain);
  if (accessToken) {
    const data = await shopifyGraphql(
      shopDomain,
      accessToken,
      `
        query SegmentCollectionSearch($query: String!) {
          collections(first: 20, query: $query) {
            edges {
              node {
                id
                title
                handle
              }
            }
          }
        }
      `,
      { query: `title:*${trimmedQuery.replace(/[*"]/g, '')}*` },
    );

    const edges = (data?.collections as { edges?: Array<{ node?: Record<string, unknown> }> } | undefined)?.edges ?? [];
    for (const edge of edges) {
      const node = edge.node;
      if (!node?.id || !node?.title) {
        continue;
      }
      options.push({
        value: String(node.id),
        label: String(node.title),
        handle: node.handle == null ? null : String(node.handle),
        kind: 'collection',
      });
    }
  }

  const hintRows = await sql`
    SELECT DISTINCT TRIM(collection_hint) AS value
    FROM shopify_order_items
    WHERE shop_domain = ${shopDomain}
      AND collection_hint IS NOT NULL
      AND TRIM(collection_hint) <> ''
      AND collection_hint ILIKE ${likePattern}
    ORDER BY value ASC
    LIMIT ${limit}
  `;

  for (const row of hintRows as Array<Record<string, unknown>>) {
    const label = String(row.value ?? '').trim();
    if (!label) {
      continue;
    }
    options.push({
      value: label,
      label,
      kind: 'collection',
    });
  }

  return mergeCatalogOptions(options, limit);
};

export const resolveCollectionProductIds = async (shopDomain: string, collectionValue: string) => {
  const trimmedValue = collectionValue.trim();
  if (!trimmedValue) {
    return [] as string[];
  }

  if (!trimmedValue.startsWith('gid://shopify/Collection/')) {
    return [];
  }

  const accessToken = await getShopifyOfflineAccessToken(shopDomain);
  if (!accessToken) {
    return [];
  }

  const productIds: string[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 5; page += 1) {
    const data = await shopifyGraphql(
      shopDomain,
      accessToken,
      `
        query SegmentCollectionProducts($id: ID!, $cursor: String) {
          collection(id: $id) {
            products(first: 100, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  legacyResourceId
                }
              }
            }
          }
        }
      `,
      { id: trimmedValue, cursor },
    );

    const products = (data?.collection as {
      products?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
        edges?: Array<{ node?: { legacyResourceId?: string | number } }>;
      };
    } | null)?.products;

    for (const edge of products?.edges ?? []) {
      const legacyResourceId = edge.node?.legacyResourceId;
      if (legacyResourceId != null && String(legacyResourceId).trim()) {
        productIds.push(String(legacyResourceId));
      }
    }

    if (!products?.pageInfo?.hasNextPage || !products.pageInfo.endCursor) {
      break;
    }
    cursor = products.pageInfo.endCursor;
  }

  return [...new Set(productIds)];
};

export const resolveProductHandlesByIds = async (shopDomain: string, productIds: string[]) => {
  const uniqueIds = [...new Set(productIds.map((value) => value.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    return new Map<string, string>();
  }

  const sql = getNeonSql();
  const rows = await sql`
    SELECT DISTINCT product_id, handle
    FROM shopify_product_variants
    WHERE shop_domain = ${shopDomain}
      AND product_id = ANY(${uniqueIds})
      AND handle IS NOT NULL
      AND TRIM(handle) <> ''
  `;

  const handles = new Map<string, string>();
  for (const row of rows as Array<Record<string, unknown>>) {
    const productId = String(row.product_id ?? '').trim();
    const handle = String(row.handle ?? '').trim();
    if (productId && handle) {
      handles.set(productId, handle);
    }
  }

  return handles;
};
