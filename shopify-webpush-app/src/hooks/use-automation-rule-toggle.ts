'use client';

import { useCallback, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useImpressionLimit } from '@/hooks/use-impression-limit';
import { useShopDomain } from '@/hooks/use-shop-domain';
import { normalizeAutomationRules } from '@/lib/client/normalize-automation-rule';
import {
  clearPendingAutomationEnabled,
  patchAutomationOverviewRule,
  readPendingAutomationEnabled,
  setPendingAutomationEnabled,
  type AutomationOverviewPayload,
} from '@/lib/client/optimistic-automations';
import { queryKeys } from '@/lib/client/query-keys';

type AutomationRuleRecord = {
  id: string;
  ruleKey: string;
  enabled: boolean;
  config: Record<string, unknown>;
  updatedAt?: string | null;
};

export const resolveAutomationRuleEnabled = (
  shop: string,
  ruleKey: string,
  queryClient: QueryClient,
  apiEnabled?: boolean,
): boolean => {
  const pending = readPendingAutomationEnabled(shop, ruleKey);
  if (pending !== undefined) {
    return pending;
  }

  if (typeof apiEnabled === 'boolean') {
    return apiEnabled;
  }

  const overview = queryClient.getQueryData<AutomationOverviewPayload>(queryKeys.automationsOverview(shop));
  const cachedRule = normalizeAutomationRules(overview?.rules).find((rule) => rule.ruleKey === ruleKey);
  return Boolean(cachedRule?.enabled);
};

export const toggleAutomationRuleEnabled = async (input: {
  shop: string;
  ruleKey: string;
  currentEnabled: boolean;
  queryClient: QueryClient;
  atLimit: boolean;
}): Promise<{ ok: true; enabled: boolean } | { ok: false; error: string }> => {
  const { shop, ruleKey, currentEnabled, queryClient, atLimit } = input;
  const nextEnabled = !currentEnabled;

  if (nextEnabled && atLimit) {
    return {
      ok: false,
      error: 'Monthly impression limit reached. Upgrade your plan on Plans to activate automations.',
    };
  }

  setPendingAutomationEnabled(shop, ruleKey, nextEnabled);
  patchAutomationOverviewRule(queryClient, shop, ruleKey, { enabled: nextEnabled });

  const cacheKey = queryKeys.automationsOverview(shop);
  const previous = queryClient.getQueryData<AutomationOverviewPayload>(cacheKey);

  try {
    const response = await fetch('/api/automations/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopDomain: shop,
        ruleKey,
        enabled: nextEnabled,
      }),
    });

    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      rule?: AutomationRuleRecord;
    };
    if (!response.ok || !payload.ok || !payload.rule) {
      throw new Error(payload.error || 'Failed to update automation rule.');
    }

    clearPendingAutomationEnabled(shop, ruleKey);
    patchAutomationOverviewRule(queryClient, shop, ruleKey, {
      enabled: Boolean(payload.rule.enabled),
      config: (payload.rule.config ?? {}) as Record<string, unknown>,
      updatedAt: payload.rule.updatedAt ?? null,
    });

    return { ok: true, enabled: Boolean(payload.rule.enabled) };
  } catch (saveError) {
    if (previous) {
      queryClient.setQueryData(cacheKey, previous);
    }
    clearPendingAutomationEnabled(shop, ruleKey);
    return {
      ok: false,
      error: saveError instanceof Error ? saveError.message : 'Failed to update automation rule.',
    };
  }
};

export const useAutomationRuleToggle = (ruleKey: string) => {
  const activeShopDomain = useShopDomain();
  const queryClient = useQueryClient();
  const { atLimit } = useImpressionLimit();
  const [error, setError] = useState<string | null>(null);

  const toggleRuleEnabled = useCallback(
    (currentEnabled: boolean) => {
      if (!activeShopDomain) {
        setError('Missing shop context. Refresh the app from Shopify and try again.');
        return currentEnabled;
      }

      const nextEnabled = !currentEnabled;
      if (nextEnabled && atLimit) {
        setError('Monthly impression limit reached. Upgrade your plan on Plans to activate automations.');
        return currentEnabled;
      }

      setError(null);

      void (async () => {
        const result = await toggleAutomationRuleEnabled({
          shop: activeShopDomain,
          ruleKey,
          currentEnabled,
          queryClient,
          atLimit,
        });
        if (!result.ok) {
          setError(result.error);
        }
      })();

      return nextEnabled;
    },
    [activeShopDomain, atLimit, queryClient, ruleKey],
  );

  return { toggleRuleEnabled, toggleError: error, clearToggleError: () => setError(null), atLimit };
};
