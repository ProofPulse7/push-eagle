'use client';

import {
  normalizeAutomationRule,
  normalizeAutomationRules,
  type NormalizedAutomationRule,
} from '@/lib/client/normalize-automation-rule';
import { queryKeys } from '@/lib/client/query-keys';
import type { QueryClient } from '@tanstack/react-query';

export type AutomationOverviewPayload = {
  ok?: boolean;
  rules?: unknown[];
  totals?: {
    impressions?: number;
    clicks?: number;
    revenueCents?: number;
  };
};

const pendingStatesKey = (shop: string) => `pe:automation-pending:${shop}`;

type PendingAutomationState = {
  enabled: boolean;
  updatedAt: string;
};

const readPendingStates = (shop: string): Record<string, PendingAutomationState> => {
  if (typeof window === 'undefined' || !shop) {
    return {};
  }

  try {
    const raw = sessionStorage.getItem(pendingStatesKey(shop));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, PendingAutomationState>)
      : {};
  } catch {
    return {};
  }
};

const writePendingStates = (shop: string, states: Record<string, PendingAutomationState>) => {
  if (typeof window === 'undefined' || !shop) {
    return;
  }

  try {
    sessionStorage.setItem(pendingStatesKey(shop), JSON.stringify(states));
  } catch {
    // Ignore storage quota errors.
  }
};

export const setPendingAutomationEnabled = (shop: string, ruleKey: string, enabled: boolean) => {
  const states = readPendingStates(shop);
  states[ruleKey] = { enabled, updatedAt: new Date().toISOString() };
  writePendingStates(shop, states);
};

export const clearPendingAutomationEnabled = (shop: string, ruleKey: string) => {
  const states = readPendingStates(shop);
  if (!states[ruleKey]) {
    return;
  }

  delete states[ruleKey];
  writePendingStates(shop, states);
};

export const readPendingAutomationEnabled = (shop: string, ruleKey: string): boolean | undefined => {
  const pending = readPendingStates(shop)[ruleKey];
  return pending ? pending.enabled : undefined;
};

const computeTotals = (rules: NormalizedAutomationRule[]) =>
  rules.reduce(
    (acc, rule) => ({
      impressions: acc.impressions + Number(rule.impressions ?? 0),
      clicks: acc.clicks + Number(rule.clicks ?? 0),
      revenueCents: acc.revenueCents + Number(rule.revenueCents ?? 0),
    }),
    { impressions: 0, clicks: 0, revenueCents: 0 },
  );

const mergeRuleRecords = (
  ruleKey: string,
  previousRule: NormalizedAutomationRule | undefined,
  freshRule: NormalizedAutomationRule | undefined,
  pending: PendingAutomationState | undefined,
): NormalizedAutomationRule | undefined => {
  if (!previousRule && !freshRule && !pending) {
    return undefined;
  }

  return {
    id: String(freshRule?.id ?? previousRule?.id ?? ruleKey),
    ruleKey,
    config: (freshRule?.config ?? previousRule?.config ?? {}) as Record<string, unknown>,
    updatedAt: freshRule?.updatedAt ?? previousRule?.updatedAt ?? null,
    impressions: Number(freshRule?.impressions ?? previousRule?.impressions ?? 0),
    clicks: Number(freshRule?.clicks ?? previousRule?.clicks ?? 0),
    revenueCents: Number(freshRule?.revenueCents ?? previousRule?.revenueCents ?? 0),
    enabled: pending
      ? pending.enabled
      : typeof freshRule?.enabled === 'boolean'
        ? freshRule.enabled
        : (previousRule?.enabled ?? false),
  };
};

export const mergeAutomationOverviewPayload = (
  previous: AutomationOverviewPayload | undefined,
  fresh: AutomationOverviewPayload,
  shop: string,
) => {
  const pendingStates = readPendingStates(shop);
  const previousRules = normalizeAutomationRules(previous?.rules);
  const freshRules = normalizeAutomationRules(fresh.rules);

  const previousByKey = new Map(previousRules.map((rule) => [rule.ruleKey, rule]));
  const freshByKey = new Map(freshRules.map((rule) => [rule.ruleKey, rule]));
  const ruleKeys = new Set<string>([
    ...previousByKey.keys(),
    ...freshByKey.keys(),
    ...Object.keys(pendingStates),
  ]);

  for (const freshRule of freshRules) {
    const pending = pendingStates[freshRule.ruleKey];
    if (pending && pending.enabled === freshRule.enabled) {
      clearPendingAutomationEnabled(shop, freshRule.ruleKey);
    }
  }

  const activePending = readPendingStates(shop);
  const mergedRules = Array.from(ruleKeys)
    .map((ruleKey) =>
      mergeRuleRecords(
        ruleKey,
        previousByKey.get(ruleKey),
        freshByKey.get(ruleKey),
        activePending[ruleKey],
      ),
    )
    .filter((rule): rule is NormalizedAutomationRule => Boolean(rule))
    .sort((left, right) => left.ruleKey.localeCompare(right.ruleKey));

  const totals =
    fresh.totals &&
    (fresh.totals.impressions !== undefined ||
      fresh.totals.clicks !== undefined ||
      fresh.totals.revenueCents !== undefined)
      ? {
          impressions: Number(fresh.totals.impressions ?? 0),
          clicks: Number(fresh.totals.clicks ?? 0),
          revenueCents: Number(fresh.totals.revenueCents ?? 0),
        }
      : computeTotals(mergedRules);

  return {
    ok: true,
    ...(fresh.ok === false ? {} : { ok: true }),
    rules: mergedRules,
    totals,
  };
};

export const mergeAutomationsFromCache = (
  queryClient: QueryClient,
  shop: string,
  fresh: AutomationOverviewPayload,
) => {
  const previous = queryClient.getQueryData<AutomationOverviewPayload>(
    queryKeys.automationsOverview(shop),
  );
  return mergeAutomationOverviewPayload(previous, fresh, shop);
};

const preserveRuleMetrics = (
  rule: NormalizedAutomationRule,
  patch: Partial<NormalizedAutomationRule>,
): NormalizedAutomationRule => {
  const merged: NormalizedAutomationRule = { ...rule, ...patch };

  if (patch.impressions === undefined) {
    merged.impressions = rule.impressions ?? 0;
  } else if (patch.impressions === 0 && (rule.impressions ?? 0) > 0) {
    merged.impressions = rule.impressions ?? 0;
  }

  if (patch.clicks === undefined) {
    merged.clicks = rule.clicks ?? 0;
  } else if (patch.clicks === 0 && (rule.clicks ?? 0) > 0) {
    merged.clicks = rule.clicks ?? 0;
  }

  if (patch.revenueCents === undefined) {
    merged.revenueCents = rule.revenueCents ?? 0;
  } else if (patch.revenueCents === 0 && (rule.revenueCents ?? 0) > 0) {
    merged.revenueCents = rule.revenueCents ?? 0;
  }

  return merged;
};

export const patchAutomationOverviewRule = (
  queryClient: QueryClient,
  shop: string,
  ruleKey: string,
  patch: Partial<NormalizedAutomationRule>,
) => {
  queryClient.setQueryData<AutomationOverviewPayload>(
    queryKeys.automationsOverview(shop),
    (current) => {
      const currentRules = normalizeAutomationRules(current?.rules);
      const nextRules = currentRules.some((rule) => rule.ruleKey === ruleKey)
        ? currentRules.map((rule) =>
            rule.ruleKey === ruleKey ? preserveRuleMetrics(rule, patch) : rule,
          )
        : [
            ...currentRules,
            preserveRuleMetrics(
              {
                id: ruleKey,
                ruleKey,
                enabled: false,
                config: {},
                impressions: 0,
                clicks: 0,
                revenueCents: 0,
              },
              patch,
            ),
          ];

      return {
        ok: true,
        ...(current ?? {}),
        rules: nextRules,
        totals: current?.totals ?? computeTotals(nextRules),
      };
    },
  );
};
