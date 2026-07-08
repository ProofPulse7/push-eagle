'use client';

import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAutomationsOverview } from '@/hooks/queries/use-app-queries';
import {
  readAutomationRuleFromClientCache,
  type AutomationRuleRecord,
} from '@/lib/client/automation-flow-cache';
import { queryKeys } from '@/lib/client/query-keys';

/** Cache-first automation overview for flow pages — avoids duplicate rules/overview fetches. */
export function useAutomationFlowOverview(shopDomain: string, ruleKey: string) {
  const queryClient = useQueryClient();
  const query = useAutomationsOverview();

  const cachedOverview = shopDomain
    ? queryClient.getQueryData<{ ok?: boolean; rules?: AutomationRuleRecord[] }>(
        queryKeys.automationsOverview(shopDomain),
      )
    : undefined;

  const overview = (query.data ?? cachedOverview) as
    | { ok?: boolean; rules?: AutomationRuleRecord[] }
    | undefined;

  const rule = useMemo(() => {
    if (!shopDomain) {
      return undefined;
    }

    return (
      overview?.rules?.find((item) => item.ruleKey === ruleKey)
      ?? readAutomationRuleFromClientCache(shopDomain, ruleKey, queryClient)
    );
  }, [overview?.rules, queryClient, ruleKey, shopDomain]);

  const isOverviewReady = Boolean(rule?.config?.steps) || Boolean(overview?.rules?.length);

  return {
    rule,
    overview,
    isOverviewReady,
    isFetching: query.isFetching && !overview,
  };
}
