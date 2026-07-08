import {
  RETIRED_SYSTEM_SEGMENT_CUSTOM_ATTRIBUTES,
  SYSTEM_SEGMENT_CUSTOM_ATTRIBUTES,
  type SegmentCustomAttribute,
  type SegmentCustomAttributeType,
} from '@/lib/types/segment-custom-attributes';
import { getNeonSql } from '@/lib/integrations/database/neon';

const ATTRIBUTE_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,49}$/;

let schemaReadyPromise: Promise<void> | null = null;

const ensureSegmentCustomAttributeSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const sql = getNeonSql();
      await sql`CREATE TABLE IF NOT EXISTS segment_custom_attributes (
        shop_domain TEXT NOT NULL REFERENCES merchants(shop_domain) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        options JSONB,
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (shop_domain, name)
      )`;

      await sql`CREATE TABLE IF NOT EXISTS subscriber_custom_attribute_values (
        shop_domain TEXT NOT NULL,
        subscriber_id BIGINT NOT NULL,
        attribute_name TEXT NOT NULL,
        value_text TEXT,
        value_number DOUBLE PRECISION,
        value_date TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (shop_domain, subscriber_id, attribute_name)
      )`;

      await sql`CREATE INDEX IF NOT EXISTS idx_subscriber_custom_attr_shop_name
        ON subscriber_custom_attribute_values(shop_domain, attribute_name)`;
    })();
  }

  await schemaReadyPromise;
};

const normalizeAttributeName = (name: string) =>
  name.trim().toUpperCase().replace(/\s+/g, '_');

const parseOptions = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const options = value.map((entry) => String(entry).trim()).filter(Boolean);
  return options.length > 0 ? options : undefined;
};

const mapAttributeRow = (row: Record<string, unknown>): SegmentCustomAttribute => ({
  name: String(row.name),
  type: String(row.type) as SegmentCustomAttributeType,
  options: parseOptions(row.options),
  isSystem: Boolean(row.is_system),
  createdAt: row.created_at ? String(row.created_at) : undefined,
});

export const seedSystemSegmentCustomAttributes = async (shopDomain: string) => {
  await ensureSegmentCustomAttributeSchema();
  const sql = getNeonSql();

  for (const attribute of SYSTEM_SEGMENT_CUSTOM_ATTRIBUTES) {
    await sql`
      INSERT INTO segment_custom_attributes (
        shop_domain,
        name,
        type,
        options,
        is_system,
        created_at
      )
      VALUES (
        ${shopDomain},
        ${attribute.name},
        ${attribute.type},
        NULL,
        TRUE,
        NOW()
      )
      ON CONFLICT (shop_domain, name) DO NOTHING
    `;
  }

  for (const retiredName of RETIRED_SYSTEM_SEGMENT_CUSTOM_ATTRIBUTES) {
    await sql`
      DELETE FROM subscriber_custom_attribute_values
      WHERE shop_domain = ${shopDomain}
        AND attribute_name = ${retiredName}
    `;
    await sql`
      DELETE FROM segment_custom_attributes
      WHERE shop_domain = ${shopDomain}
        AND name = ${retiredName}
        AND is_system = TRUE
    `;
  }
};

export const listSegmentCustomAttributes = async (shopDomain: string): Promise<SegmentCustomAttribute[]> => {
  await ensureSegmentCustomAttributeSchema();
  await seedSystemSegmentCustomAttributes(shopDomain);

  const sql = getNeonSql();
  const rows = await sql`
    SELECT name, type, options, is_system, created_at
    FROM segment_custom_attributes
    WHERE shop_domain = ${shopDomain}
    ORDER BY is_system DESC, created_at ASC, name ASC
  `;

  return (rows as Array<Record<string, unknown>>).map(mapAttributeRow);
};

export const createSegmentCustomAttribute = async (
  shopDomain: string,
  input: { name: string; type: SegmentCustomAttributeType; options?: string[] },
): Promise<SegmentCustomAttribute> => {
  await ensureSegmentCustomAttributeSchema();
  await seedSystemSegmentCustomAttributes(shopDomain);

  const name = normalizeAttributeName(input.name);
  if (!ATTRIBUTE_NAME_PATTERN.test(name)) {
    throw new Error('Attribute name must use uppercase letters, numbers, and underscores only.');
  }

  const reserved = SYSTEM_SEGMENT_CUSTOM_ATTRIBUTES.some((attribute) => attribute.name === name);
  if (reserved) {
    throw new Error('This attribute name is reserved for a built-in property.');
  }

  const options =
    input.type === 'category' || input.type === 'multiple-choice'
      ? (input.options ?? []).map((entry) => entry.trim()).filter(Boolean)
      : undefined;

  if ((input.type === 'category' || input.type === 'multiple-choice') && (!options || options.length === 0)) {
    throw new Error('Category and multiple-choice attributes require at least one option.');
  }

  const sql = getNeonSql();
  const rows = await sql`
    INSERT INTO segment_custom_attributes (
      shop_domain,
      name,
      type,
      options,
      is_system,
      created_at
    )
    VALUES (
      ${shopDomain},
      ${name},
      ${input.type},
      ${options ? JSON.stringify(options) : null}::jsonb,
      FALSE,
      NOW()
    )
    ON CONFLICT (shop_domain, name) DO UPDATE SET
      type = EXCLUDED.type,
      options = EXCLUDED.options
    RETURNING name, type, options, is_system, created_at
  `;

  return mapAttributeRow(rows[0] as Record<string, unknown>);
};

export const deleteSegmentCustomAttribute = async (shopDomain: string, name: string) => {
  await ensureSegmentCustomAttributeSchema();
  const normalized = normalizeAttributeName(name);
  const sql = getNeonSql();

  const rows = await sql`
    SELECT is_system
    FROM segment_custom_attributes
    WHERE shop_domain = ${shopDomain}
      AND name = ${normalized}
    LIMIT 1
  `;

  if (!rows[0]) {
    throw new Error('Attribute not found.');
  }

  if (Boolean(rows[0].is_system)) {
    throw new Error('Built-in attributes cannot be removed.');
  }

  await sql`
    DELETE FROM subscriber_custom_attribute_values
    WHERE shop_domain = ${shopDomain}
      AND attribute_name = ${normalized}
  `;

  await sql`
    DELETE FROM segment_custom_attributes
    WHERE shop_domain = ${shopDomain}
      AND name = ${normalized}
      AND is_system = FALSE
  `;
};

export const upsertSubscriberCustomAttributeValue = async (input: {
  shopDomain: string;
  subscriberId: number;
  attributeName: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueDate?: string | Date | null;
}) => {
  if (!input.subscriberId) {
    return;
  }

  await ensureSegmentCustomAttributeSchema();
  const sql = getNeonSql();
  const attributeName = normalizeAttributeName(input.attributeName);

  await sql`
    INSERT INTO subscriber_custom_attribute_values (
      shop_domain,
      subscriber_id,
      attribute_name,
      value_text,
      value_number,
      value_date,
      updated_at
    )
    VALUES (
      ${input.shopDomain},
      ${input.subscriberId},
      ${attributeName},
      ${input.valueText ?? null},
      ${input.valueNumber ?? null},
      ${input.valueDate ? new Date(input.valueDate) : null},
      NOW()
    )
    ON CONFLICT (shop_domain, subscriber_id, attribute_name)
    DO UPDATE SET
      value_text = COALESCE(EXCLUDED.value_text, subscriber_custom_attribute_values.value_text),
      value_number = COALESCE(EXCLUDED.value_number, subscriber_custom_attribute_values.value_number),
      value_date = COALESCE(EXCLUDED.value_date, subscriber_custom_attribute_values.value_date),
      updated_at = NOW()
  `;
};

const toDate = (value?: string | Date | null) => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeCompareValue = (value: string) => value.trim().toLowerCase();

type SegmentAttributeCondition = {
  operator?: 'is' | 'is not';
  attributeName?: string;
  textValue?: string;
  selectedValues?: Array<{ value: string; label?: string }>;
};

const attributeMatchesCondition = (
  actual: string | number | Date | null | undefined,
  attributeType: SegmentCustomAttributeType,
  condition: SegmentAttributeCondition,
) => {
  const positive = condition.operator !== 'is not';
  const expectedValues =
    condition.selectedValues && condition.selectedValues.length > 0
      ? condition.selectedValues.map((entry) => String(entry.value ?? entry.label ?? '').trim()).filter(Boolean)
      : condition.textValue
        ? [condition.textValue.trim()]
        : [];

  if (expectedValues.length === 0) {
    return false;
  }

  if (attributeType === 'number') {
    const actualNumber = actual == null ? null : Number(actual);
    if (actualNumber == null || Number.isNaN(actualNumber)) {
      return !positive;
    }
    const matches = expectedValues.some((expected) => Number(expected) === actualNumber);
    return positive ? matches : !matches;
  }

  if (attributeType === 'date') {
    const actualDate = actual instanceof Date ? actual : toDate(String(actual ?? ''));
    if (!actualDate) {
      return !positive;
    }
    const matches = expectedValues.some((expected) => {
      const expectedDate = toDate(expected);
      if (!expectedDate) {
        return false;
      }
      return actualDate.toISOString().slice(0, 10) === expectedDate.toISOString().slice(0, 10);
    });
    return positive ? matches : !matches;
  }

  const actualText = actual == null ? '' : normalizeCompareValue(String(actual));
  const matches = expectedValues.some((expected) => actualText === normalizeCompareValue(expected));
  return positive ? matches : !matches;
};

const loadAttributeDefinitions = async (shopDomain: string) => {
  const attributes = await listSegmentCustomAttributes(shopDomain);
  return new Map(attributes.map((attribute) => [attribute.name, attribute]));
};

const loadStoredAttributeValues = async (shopDomain: string, attributeName: string) => {
  const sql = getNeonSql();
  const rows = await sql`
    SELECT subscriber_id, value_text, value_number, value_date
    FROM subscriber_custom_attribute_values
    WHERE shop_domain = ${shopDomain}
      AND attribute_name = ${attributeName}
  `;

  const map = new Map<number, string | number | Date>();
  for (const row of rows as Array<Record<string, unknown>>) {
    const subscriberId = Number(row.subscriber_id);
    if (row.value_number != null && row.value_number !== '') {
      map.set(subscriberId, Number(row.value_number));
    } else if (row.value_date) {
      map.set(subscriberId, new Date(String(row.value_date)));
    } else if (row.value_text != null) {
      map.set(subscriberId, String(row.value_text));
    }
  }
  return map;
};

const loadSystemAttributeValues = async (shopDomain: string, attributeName: string) => {
  const sql = getNeonSql();
  const map = new Map<number, string | number | Date>();

  if (attributeName === 'PURCHASE_COUNT' || attributeName === 'LAST_PURCHASE_DATE') {
    const { isD1CommerceEnabled, d1GetPurchasedSubscriberStats } = await import(
      '@/lib/server/integrations/d1-commerce'
    );
    const stats = isD1CommerceEnabled()
      ? await d1GetPurchasedSubscriberStats(shopDomain)
      : ((await sql`
          SELECT subscriber_id, COUNT(*)::INT AS total, MAX(created_at) AS last_at
          FROM shopify_orders
          WHERE shop_domain = ${shopDomain}
            AND subscriber_id IS NOT NULL
          GROUP BY subscriber_id
        `) as Array<{ subscriber_id: number; total: number; last_at: string | null }>);

    for (const row of stats) {
      const subscriberId = Number(row.subscriber_id);
      if (attributeName === 'PURCHASE_COUNT') {
        map.set(subscriberId, Number(row.total ?? 0));
      } else if (row.last_at) {
        map.set(subscriberId, new Date(String(row.last_at)));
      }
    }
    return map;
  }

  if (attributeName === 'FIRSTNAME' || attributeName === 'LASTNAME') {
    const { isD1CustomersEnabled, d1GetCustomerProfileMap } = await import(
      '@/lib/server/integrations/d1-customers'
    );
    const { audienceRead, d1GetSubscriberIdExternalIdPairs } = await import(
      '@/lib/server/integrations/d1-audience'
    );

    const subscriberRows = await audienceRead<Array<{ id: number; external_id: string | null }>>({
      label: 'segment.customAttribute.namePairs',
      key: (arr) => arr.map((row) => `${Number(row.id)}:${row.external_id || ''}`).sort().join(','),
      neon: async () => {
        const rows = await sql`
          SELECT id, external_id
          FROM subscribers
          WHERE shop_domain = ${shopDomain}
            AND external_id IS NOT NULL
        `;
        return (rows as Array<Record<string, unknown>>).map((row) => ({
          id: Number(row.id),
          external_id: row.external_id == null ? null : String(row.external_id),
        }));
      },
      d1: async () => d1GetSubscriberIdExternalIdPairs(shopDomain),
    });

    const profileMap = isD1CustomersEnabled()
      ? await d1GetCustomerProfileMap(shopDomain)
      : new Map(
          (
            (await sql`
              SELECT external_id, first_name, last_name
              FROM shopify_customers
              WHERE shop_domain = ${shopDomain}
                AND external_id IS NOT NULL
            `) as Array<{ external_id: string; first_name: string | null; last_name: string | null }>
          ).map((row) => [
            String(row.external_id),
            {
              firstName: row.first_name == null ? null : String(row.first_name),
              lastName: row.last_name == null ? null : String(row.last_name),
            },
          ]),
        );

    for (const row of subscriberRows) {
      const profile = row.external_id ? profileMap.get(String(row.external_id)) : undefined;
      const value =
        attributeName === 'FIRSTNAME' ? profile?.firstName : profile?.lastName;
      if (value) {
        map.set(Number(row.id), value);
      }
    }
    return map;
  }

  const { audienceRead, d1GetLocationRows } = await import('@/lib/server/integrations/d1-audience');
  const rows = await audienceRead<
    Array<{
      id: number;
      country: string | null;
      city: string | null;
      region: string | null;
      locale: string | null;
      device_context: Record<string, unknown> | null;
    }>
  >({
    label: 'segment.customAttribute.locationRows',
    key: (arr) =>
      arr
        .map((row) => `${Number(row.id)}|${row.country || ''}|${row.city || ''}|${row.region || ''}`)
        .sort()
        .join(','),
    neon: async () => {
      const result = await sql`
        SELECT id, country, city, locale, device_context
        FROM subscribers
        WHERE shop_domain = ${shopDomain}
      `;
      return (result as Array<Record<string, unknown>>).map((row) => {
        const deviceContext =
          row.device_context == null
            ? null
            : typeof row.device_context === 'string'
              ? (JSON.parse(row.device_context) as Record<string, unknown>)
              : (row.device_context as Record<string, unknown>);
        return {
          id: Number(row.id),
          country: row.country == null ? null : String(row.country),
          city: row.city == null ? null : String(row.city),
          region: deviceContext?.region == null ? null : String(deviceContext.region),
          locale: row.locale == null ? null : String(row.locale),
          device_context: deviceContext,
        };
      });
    },
    d1: async () => {
      const locationRows = await d1GetLocationRows(shopDomain);
      return locationRows.map((row) => ({
        id: row.id,
        country: row.country,
        city: row.city,
        region: row.region,
        locale: null,
        device_context: row.region ? { region: row.region } : null,
      }));
    },
  });

  for (const row of rows) {
    const deviceContext = row.device_context ?? {};
    let value: string | null = null;

    switch (attributeName) {
      case 'COUNTRY':
        value = row.country;
        break;
      case 'CITY':
        value = row.city;
        break;
      case 'PROVINCE':
        value = row.region;
        break;
      case 'COUNTRY_CODE':
        value = deviceContext.countryCode == null ? row.country : String(deviceContext.countryCode);
        break;
      case 'PROVINCE_CODE':
        value = deviceContext.provinceCode == null ? row.region : String(deviceContext.provinceCode);
        break;
      case 'ZIP':
        value = deviceContext.zip == null ? null : String(deviceContext.zip);
        break;
      case 'CONTACT_TIMEZONE':
        value = deviceContext.timezone == null ? row.locale : String(deviceContext.timezone);
        break;
      default:
        value = null;
    }

    if (value && value.trim()) {
      map.set(Number(row.id), value);
    }
  }

  return map;
};

export const queryCustomAttributeSubscriberIds = async (
  shopDomain: string,
  condition: SegmentAttributeCondition,
) => {
  const attributeName = normalizeAttributeName(String(condition.attributeName || condition.textValue || ''));
  if (!attributeName) {
    return new Set<number>();
  }

  const definitions = await loadAttributeDefinitions(shopDomain);
  const definition = definitions.get(attributeName);
  if (!definition) {
    return new Set<number>();
  }

  const storedValues = await loadStoredAttributeValues(shopDomain, attributeName);
  const systemValues = definition.isSystem
    ? await loadSystemAttributeValues(shopDomain, attributeName)
    : new Map<number, string | number | Date>();

  const merged = new Map<number, string | number | Date>(systemValues);
  for (const [subscriberId, value] of storedValues.entries()) {
    merged.set(subscriberId, value);
  }

  const matched = new Set<number>();
  for (const [subscriberId, value] of merged.entries()) {
    if (attributeMatchesCondition(value, definition.type, condition)) {
      matched.add(subscriberId);
    }
  }

  return matched;
};

export const syncSubscriberSystemAttributes = async (input: {
  shopDomain: string;
  subscriberId: number;
  externalId?: string | null;
  country?: string | null;
  city?: string | null;
  deviceContext?: Record<string, unknown> | null;
  firstName?: string | null;
  lastName?: string | null;
}) => {
  if (!input.subscriberId) {
    return;
  }

  const writes: Array<Promise<void>> = [];

  if (input.country) {
    writes.push(
      upsertSubscriberCustomAttributeValue({
        shopDomain: input.shopDomain,
        subscriberId: input.subscriberId,
        attributeName: 'COUNTRY',
        valueText: input.country,
      }),
    );
  }

  if (input.city) {
    writes.push(
      upsertSubscriberCustomAttributeValue({
        shopDomain: input.shopDomain,
        subscriberId: input.subscriberId,
        attributeName: 'CITY',
        valueText: input.city,
      }),
    );
  }

  const region = input.deviceContext?.region;
  if (region) {
    writes.push(
      upsertSubscriberCustomAttributeValue({
        shopDomain: input.shopDomain,
        subscriberId: input.subscriberId,
        attributeName: 'PROVINCE',
        valueText: String(region),
      }),
    );
  }

  if (input.firstName) {
    writes.push(
      upsertSubscriberCustomAttributeValue({
        shopDomain: input.shopDomain,
        subscriberId: input.subscriberId,
        attributeName: 'FIRSTNAME',
        valueText: input.firstName,
      }),
    );
  }

  if (input.lastName) {
    writes.push(
      upsertSubscriberCustomAttributeValue({
        shopDomain: input.shopDomain,
        subscriberId: input.subscriberId,
        attributeName: 'LASTNAME',
        valueText: input.lastName,
      }),
    );
  }

  await Promise.all(writes);
};
