'use client';

import { useLayoutEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAutomationsOverview } from '@/hooks/queries/use-app-queries';
import { readAutomationRuleFromClientCache } from '@/lib/client/automation-flow-cache';
import {
  mapAutomationStepToNotification,
  type AutomationStepConfig,
} from '@/lib/client/automation-step-config';
import { useAutomationState } from '@/context/automation-context';

type UseAutomationEditorInitInput = {
  shopDomain: string;
  ruleKey: string;
  stepId: string;
  defaultTargetUrl?: string;
};

/**
 * Hydrates the automation composer from React Query / localStorage before network.
 * Falls back to /api/automations/rules only on a true cache miss.
 */
export function useAutomationEditorInit({
  shopDomain,
  ruleKey,
  stepId,
  defaultTargetUrl = '',
}: UseAutomationEditorInitInput) {
  const queryClient = useQueryClient();
  const { initializeState, isInitialized } = useAutomationState();
  const networkRequested = useRef(false);
  const initializedRef = useRef(isInitialized);
  const { data: overview } = useAutomationsOverview();

  initializedRef.current = isInitialized;

  useLayoutEffect(() => {
    if (!stepId || !shopDomain || initializedRef.current) {
      return;
    }

    const hydrateStep = (step: AutomationStepConfig | undefined | null) => {
      if (!step) {
        return false;
      }

      initializeState({
        notification: mapAutomationStepToNotification(step, defaultTargetUrl),
      });
      return true;
    };

    const cachedRule = readAutomationRuleFromClientCache(shopDomain, ruleKey, queryClient);
    if (hydrateStep(cachedRule?.config?.steps?.[stepId] as AutomationStepConfig | undefined)) {
      return;
    }

    const overviewRule = overview?.rules?.find(
      (rule) => String((rule as { ruleKey?: string }).ruleKey ?? '') === ruleKey,
    ) as { config?: { steps?: Record<string, AutomationStepConfig> } } | undefined;

    if (hydrateStep(overviewRule?.config?.steps?.[stepId])) {
      return;
    }

    if (networkRequested.current) {
      return;
    }

    networkRequested.current = true;

    void fetch(`/api/automations/rules?shop=${encodeURIComponent(shopDomain)}`)
      .then((response) => response.json())
      .then((payload: {
        ok?: boolean;
        rules?: Array<{ ruleKey: string; config?: { steps?: Record<string, AutomationStepConfig> } }>;
      }) => {
        if (!payload?.ok || initializedRef.current) {
          return;
        }

        const rule = (payload.rules ?? []).find((item) => item.ruleKey === ruleKey);
        hydrateStep(rule?.config?.steps?.[stepId]);
      })
      .catch(() => undefined);
  }, [defaultTargetUrl, initializeState, overview, queryClient, ruleKey, shopDomain, stepId]);

  return { isInitialized };
}
