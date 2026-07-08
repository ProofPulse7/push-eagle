'use client';

import { useCallback, useLayoutEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  hydrateFlowNotifications,
  isAutomationFlowStepsReady,
} from '@/lib/client/automation-flow-cache';
import {
  applyPendingFlowStepStates,
  type FlowStepNotification,
} from '@/lib/client/automation-flow-steps';

export function useFlowStepsHydration<T extends FlowStepNotification>({
  shopDomain,
  ruleKey,
  template,
  mergeSteps,
}: {
  shopDomain: string;
  ruleKey: string;
  template: T[];
  mergeSteps: (current: T[], steps: Record<string, Record<string, unknown>>) => T[];
}) {
  const queryClient = useQueryClient();
  const [notifications, setNotifications] = useState<T[]>(template);
  const [flowStepsReady, setFlowStepsReady] = useState(() =>
    isAutomationFlowStepsReady(shopDomain, ruleKey, queryClient),
  );

  const hydrateFromCache = useCallback(() => {
    if (!shopDomain) {
      return null;
    }

    return hydrateFlowNotifications(shopDomain, ruleKey, template, mergeSteps, queryClient);
  }, [mergeSteps, queryClient, ruleKey, shopDomain, template]);

  useLayoutEffect(() => {
    const hydrated = hydrateFromCache();
    if (hydrated) {
      setNotifications(hydrated);
      setFlowStepsReady(true);
    }
  }, [hydrateFromCache]);

  const applyServerSteps = useCallback(
    (steps: Record<string, Record<string, unknown>>) => {
      if (!shopDomain) {
        return;
      }

      setNotifications(applyPendingFlowStepStates(shopDomain, ruleKey, mergeSteps(template, steps)));
      setFlowStepsReady(true);
    },
    [mergeSteps, ruleKey, shopDomain, template],
  );

  return {
    notifications,
    setNotifications,
    flowStepsReady,
    applyServerSteps,
  };
}
