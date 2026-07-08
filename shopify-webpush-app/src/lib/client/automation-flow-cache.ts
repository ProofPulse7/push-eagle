'use client';

import type { QueryClient } from '@tanstack/react-query';

import {
  applyPendingFlowStepStates,
  hasPendingFlowSteps,
  type FlowStepNotification,
} from '@/lib/client/automation-flow-steps';
import { queryKeys } from '@/lib/client/query-keys';

export type AutomationRuleRecord = {
  ruleKey: string;
  enabled?: boolean;
  config?: { steps?: Record<string, Record<string, unknown>> };
  impressions?: number;
  clicks?: number;
  revenueCents?: number;
};

export type AutomationRulesPayload = {
  ok?: boolean;
  rules?: AutomationRuleRecord[];
};

const cacheStorageKey = (cacheKey: string) => `pe-cache:${cacheKey}`;

/** Synchronous localStorage read used before paint (no network). */
export const readCachedJsonSync = <T>(cacheKey: string): T | null => {
  if (typeof window === 'undefined' || !cacheKey) {
    return null;
  }

  try {
    const raw = localStorage.getItem(cacheStorageKey(cacheKey));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as { data?: T };
    return parsed?.data ?? null;
  } catch {
    return null;
  }
};

const readRuleFromPayload = (
  payload: AutomationRulesPayload | null | undefined,
  ruleKey: string,
) => payload?.rules?.find((rule) => rule.ruleKey === ruleKey);

export const readAutomationRuleFromClientCache = (
  shop: string,
  ruleKey: string,
  queryClient?: QueryClient,
): AutomationRuleRecord | undefined => {
  if (!shop) {
    return undefined;
  }

  if (queryClient) {
    const overview = queryClient.getQueryData<AutomationRulesPayload>(
      queryKeys.automationsOverview(shop),
    );
    const fromOverview = readRuleFromPayload(overview, ruleKey);
    if (fromOverview) {
      return fromOverview;
    }
  }

  const cacheKeys = [
    `${ruleKey}-rules:${shop}`,
    `${ruleKey}-overview:${shop}`,
    `cart-rules:${shop}`,
    `cart-overview:${shop}`,
    `browse-rules:${shop}`,
    `browse-overview:${shop}`,
    `welcome-rules:${shop}`,
    `welcome-overview:${shop}`,
  ];

  for (const cacheKey of cacheKeys) {
    const payload = readCachedJsonSync<AutomationRulesPayload>(cacheKey);
    const rule = readRuleFromPayload(payload, ruleKey);
    if (rule) {
      return rule;
    }
  }

  return undefined;
};

export const isAutomationFlowStepsReady = (
  shop: string,
  ruleKey: string,
  queryClient?: QueryClient,
) => {
  if (!shop) {
    return false;
  }

  if (hasPendingFlowSteps(shop, ruleKey)) {
    return true;
  }

  const rule = readAutomationRuleFromClientCache(shop, ruleKey, queryClient);
  return Boolean(rule?.config?.steps);
};

export const hydrateFlowNotifications = <T extends FlowStepNotification>(
  shop: string,
  ruleKey: string,
  template: T[],
  mergeSteps: (notifications: T[], steps: Record<string, Record<string, unknown>>) => T[],
  queryClient?: QueryClient,
): T[] | null => {
  if (!shop) {
    return null;
  }

  if (hasPendingFlowSteps(shop, ruleKey)) {
    return applyPendingFlowStepStates(shop, ruleKey, template);
  }

  const rule = readAutomationRuleFromClientCache(shop, ruleKey, queryClient);
  const steps = rule?.config?.steps;
  if (!steps) {
    return null;
  }

  return applyPendingFlowStepStates(shop, ruleKey, mergeSteps(template, steps));
};
