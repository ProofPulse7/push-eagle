'use client';

import { OptimisticSaveQueue } from '@/lib/client/optimistic-save-queue';
import { runWithBackgroundRetries } from '@/lib/client/background-save';
import {
  patchAutomationOverviewRule,
  setPendingAutomationEnabled,
} from '@/lib/client/optimistic-automations';
import type { QueryClient } from '@tanstack/react-query';

export type FlowStepStatus = 'Active' | 'Inactive';

export type FlowStepNotification = {
  id: string;
  status: FlowStepStatus;
};

const stepStatesKey = (shop: string, ruleKey: string) => `pe:automation-steps:${shop}:${ruleKey}`;

type PendingStepState = {
  enabled: boolean;
  updatedAt: string;
};

const readPendingStepStates = (shop: string, ruleKey: string): Record<string, PendingStepState> => {
  if (typeof window === 'undefined' || !shop) {
    return {};
  }

  try {
    const raw = sessionStorage.getItem(stepStatesKey(shop, ruleKey));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, PendingStepState>)
      : {};
  } catch {
    return {};
  }
};

const writePendingStepStates = (
  shop: string,
  ruleKey: string,
  states: Record<string, PendingStepState>,
) => {
  if (typeof window === 'undefined' || !shop) {
    return;
  }

  try {
    sessionStorage.setItem(stepStatesKey(shop, ruleKey), JSON.stringify(states));
  } catch {
    // Ignore storage quota errors.
  }
};

export const setPendingFlowStepEnabled = (
  shop: string,
  ruleKey: string,
  stepId: string,
  enabled: boolean,
) => {
  const states = readPendingStepStates(shop, ruleKey);
  states[stepId] = { enabled, updatedAt: new Date().toISOString() };
  writePendingStepStates(shop, ruleKey, states);
};

export const clearPendingFlowStepEnabled = (shop: string, ruleKey: string, stepId: string) => {
  const states = readPendingStepStates(shop, ruleKey);
  if (!states[stepId]) {
    return;
  }

  delete states[stepId];
  writePendingStepStates(shop, ruleKey, states);
};

export const syncPendingFlowStepStates = (
  shop: string,
  ruleKey: string,
  notifications: FlowStepNotification[],
) => {
  const states: Record<string, PendingStepState> = {};
  const updatedAt = new Date().toISOString();

  for (const notification of notifications) {
    states[notification.id] = {
      enabled: notification.status === 'Active',
      updatedAt,
    };
  }

  writePendingStepStates(shop, ruleKey, states);
};

export const hasPendingFlowSteps = (shop: string, ruleKey: string) =>
  Object.keys(readPendingStepStates(shop, ruleKey)).length > 0;

export const applyPendingFlowStepStates = <T extends FlowStepNotification>(
  shop: string,
  ruleKey: string,
  notifications: T[],
): T[] => {
  const pending = readPendingStepStates(shop, ruleKey);
  if (Object.keys(pending).length === 0) {
    return notifications;
  }

  return notifications.map((notification) => {
    const pendingState = pending[notification.id];
    if (!pendingState) {
      return notification;
    }

    return {
      ...notification,
      status: pendingState.enabled ? 'Active' : 'Inactive',
    };
  });
};

export const stepEnabledFromConfig = (enabled: unknown): FlowStepStatus =>
  enabled ? 'Active' : 'Inactive';

type SaveAutomationStepsInput<T extends FlowStepNotification> = {
  shopDomain: string;
  ruleKey: string;
  notifications: T[];
  buildStepsConfig: (notifications: T[]) => Record<string, unknown>;
  queryClient?: QueryClient;
  onError?: (error: Error) => void;
};

export const saveAutomationStepsOptimistically = <T extends FlowStepNotification>(
  input: SaveAutomationStepsInput<T>,
) => {
  const { shopDomain, ruleKey, notifications, buildStepsConfig, queryClient, onError } = input;
  if (!shopDomain) {
    return;
  }

  const ruleEnabled = notifications.some((item) => item.status === 'Active');
  syncPendingFlowStepStates(shopDomain, ruleKey, notifications);
  setPendingAutomationEnabled(shopDomain, ruleKey, ruleEnabled);

  if (queryClient) {
    patchAutomationOverviewRule(queryClient, shopDomain, ruleKey, { enabled: ruleEnabled });
  }

  void runWithBackgroundRetries(async () => {
    const response = await fetch('/api/automations/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopDomain,
        ruleKey,
        enabled: ruleEnabled,
        config: { steps: buildStepsConfig(notifications) },
      }),
    });

    const payload = (await response.json().catch(() => ({ ok: false }))) as {
      ok?: boolean;
      error?: string;
      rule?: { enabled?: boolean; config?: { steps?: Record<string, { enabled?: boolean }> } };
    };

    if (!response.ok || !payload.ok) {
      throw new Error(typeof payload.error === 'string' ? payload.error : 'Failed to save automation steps.');
    }

    const savedSteps = payload.rule?.config?.steps ?? {};
    for (const notification of notifications) {
      const savedStep = savedSteps[notification.id];
      if (savedStep && Boolean(savedStep.enabled) === (notification.status === 'Active')) {
        clearPendingFlowStepEnabled(shopDomain, ruleKey, notification.id);
      }
    }

    if (queryClient && typeof payload.rule?.enabled === 'boolean') {
      patchAutomationOverviewRule(queryClient, shopDomain, ruleKey, {
        enabled: payload.rule.enabled,
      });
    }
  }).catch((error) => {
    onError?.(error instanceof Error ? error : new Error('Failed to save automation steps.'));
  });
};

export const createDebouncedAutomationStepsSaver = <T extends FlowStepNotification>(
  shopDomain: string,
  ruleKey: string,
  buildStepsConfig: (notifications: T[]) => Record<string, unknown>,
  options?: { queryClient?: QueryClient; onError?: (error: Error) => void },
) => {
  const queue = new OptimisticSaveQueue<T[]>();

  return (notifications: T[]) => {
    if (!shopDomain) {
      return;
    }

    syncPendingFlowStepStates(shopDomain, ruleKey, notifications);
    const ruleEnabled = notifications.some((item) => item.status === 'Active');
    setPendingAutomationEnabled(shopDomain, ruleKey, ruleEnabled);

    if (options?.queryClient) {
      patchAutomationOverviewRule(options.queryClient, shopDomain, ruleKey, { enabled: ruleEnabled });
    }

    queue.enqueue({
      key: ruleKey,
      payload: notifications,
      onError: (error) => {
        options?.onError?.(error instanceof Error ? error : new Error('Failed to save automation steps.'));
      },
      save: async (payload) => {
        await runWithBackgroundRetries(async () => {
          const response = await fetch('/api/automations/rules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              shopDomain,
              ruleKey,
              enabled: payload.some((item) => item.status === 'Active'),
              config: { steps: buildStepsConfig(payload) },
            }),
          });

          const result = (await response.json().catch(() => ({ ok: false }))) as {
            ok?: boolean;
            error?: string;
            rule?: { enabled?: boolean; config?: { steps?: Record<string, { enabled?: boolean }> } };
          };

          if (!response.ok || !result.ok) {
            throw new Error(typeof result.error === 'string' ? result.error : 'Failed to save automation steps.');
          }

          const savedSteps = result.rule?.config?.steps ?? {};
          for (const notification of payload) {
            const savedStep = savedSteps[notification.id];
            if (savedStep && Boolean(savedStep.enabled) === (notification.status === 'Active')) {
              clearPendingFlowStepEnabled(shopDomain, ruleKey, notification.id);
            }
          }
        });
      },
    });
  };
};
