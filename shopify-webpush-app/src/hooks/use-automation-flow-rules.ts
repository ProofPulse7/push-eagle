'use client';

import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { readCachedJsonSync } from '@/lib/client/cached-json-storage';
import { hasPendingFlowSteps } from '@/lib/client/automation-flow-steps';
import type { AutomationOverviewPayload } from '@/lib/client/optimistic-automations';
import { queryKeys } from '@/lib/client/query-keys';
import { useCachedJson } from '@/hooks/use-cached-json';

type AutomationRulesPayload = {
  ok?: boolean;
  rules?: Array<{
    ruleKey: string;
    enabled?: boolean;
    config?: { steps?: Record<string, Record<string, unknown>> };
    impressions?: number;
    clicks?: number;
    revenueCents?: number;
  }>;
};

const pickRulesPayload = (...candidates: Array<AutomationRulesPayload | null | undefined>) => {
  for (const candidate of candidates) {
    if (candidate?.ok && Array.isArray(candidate.rules)) {
      return candidate;
    }
  }

  return null;
};

export const useAutomationFlowRules = (input: {
  shopDomain: string;
  ruleKey: string;
  rulesCacheKey: string;
  overviewCacheKey: string;
}) => {
  const { shopDomain, ruleKey, rulesCacheKey, overviewCacheKey } = input;
  const queryClient = useQueryClient();

  const rulesUrl = shopDomain ? `/api/automations/rules?shop=${encodeURIComponent(shopDomain)}` : '';
  const overviewUrl = shopDomain ? `/api/automations/overview?shop=${encodeURIComponent(shopDomain)}` : '';

  const { data: rulesPayload, loading: rulesLoading } = useCachedJson<AutomationRulesPayload>({
    cacheKey: rulesCacheKey,
    url: rulesUrl,
    enabled: Boolean(shopDomain),
  });

  const { data: overviewPayload } = useCachedJson<AutomationRulesPayload>({
    cacheKey: overviewCacheKey,
    url: overviewUrl,
    enabled: Boolean(shopDomain),
  });

  const overviewFromQuery = shopDomain
    ? queryClient.getQueryData<AutomationOverviewPayload>(queryKeys.automationsOverview(shopDomain))
    : undefined;

  const overviewRulesPayload = useMemo(() => {
    if (overviewFromQuery?.rules) {
      return { ok: true as const, rules: overviewFromQuery.rules as AutomationRulesPayload['rules'] };
    }

    return overviewPayload ?? null;
  }, [overviewFromQuery, overviewPayload]);

  const cachedRulesPayload = useMemo(
    () => (shopDomain ? readCachedJsonSync<AutomationRulesPayload>(rulesCacheKey) : null),
    [shopDomain, rulesCacheKey, rulesPayload],
  );

  const effectiveRulesPayload = useMemo(
    () => pickRulesPayload(rulesPayload, cachedRulesPayload, overviewRulesPayload),
    [cachedRulesPayload, overviewRulesPayload, rulesPayload],
  );

  const rule = useMemo(
    () => (effectiveRulesPayload?.rules ?? []).find((item) => item.ruleKey === ruleKey),
    [effectiveRulesPayload, ruleKey],
  );

  const hasStepConfig = Boolean(
    rule?.config?.steps && Object.keys(rule.config.steps).length > 0,
  );

  const flowConfigReady =
    Boolean(shopDomain) &&
    (hasStepConfig ||
      hasPendingFlowSteps(shopDomain, ruleKey) ||
      Boolean(rulesPayload?.ok) ||
      Boolean(cachedRulesPayload?.ok) ||
      Boolean(overviewRulesPayload?.ok && rule));

  const flowConfigLoading = Boolean(shopDomain) && !flowConfigReady && rulesLoading;

  return {
    rule,
    rulesPayload,
    effectiveRulesPayload,
    overviewPayload: overviewRulesPayload,
    flowConfigReady,
    flowConfigLoading,
    rulesLoading,
  };
};
