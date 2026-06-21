import { applyPendingFlowStepStates, stepEnabledFromConfig } from '@/lib/client/automation-flow-steps';

type FlowStepConfig = {
  enabled?: boolean;
  delayMinutes?: number;
  title?: string;
  body?: string;
  targetUrl?: string | null;
  iconUrl?: string | null;
  imageUrl?: string | null;
  windowsImageUrl?: string | null;
  macosImageUrl?: string | null;
  androidImageUrl?: string | null;
  actionButtons?: Array<{ title: string; link: string }>;
};

type MergeableNotification = {
  id: string;
  delay: string;
  status: 'Active' | 'Inactive';
  notification: {
    title: string;
    message: string;
    targetUrl?: string;
    iconUrl: string;
    heroUrl: string | null;
    windowsImageUrl?: string | null;
    macosImageUrl?: string | null;
    androidImageUrl?: string | null;
    siteName: string;
    actionButtons: Array<{ title: string; link: string }>;
  };
};

export const mergeFlowNotificationsFromSteps = <T extends MergeableNotification>(
  notifications: T[],
  steps: Record<string, FlowStepConfig> | undefined,
  shopDomain: string,
  ruleKey: string,
  delayMinutesToLabel: (minutes: number) => string,
  delayLabelToMinutes: (label: string) => number,
): T[] => {
  if (!steps || Object.keys(steps).length === 0) {
    return applyPendingFlowStepStates(shopDomain, ruleKey, notifications);
  }

  const merged = notifications.map((item) => {
    const step = steps[item.id] ?? {};
    return {
      ...item,
      delay: delayMinutesToLabel(Number(step.delayMinutes ?? delayLabelToMinutes(item.delay))),
      status: stepEnabledFromConfig(step.enabled),
      notification: {
        ...item.notification,
        title: step.title ?? item.notification.title,
        message: step.body ?? item.notification.message,
        targetUrl: step.targetUrl ?? item.notification.targetUrl,
        iconUrl: step.iconUrl ?? item.notification.iconUrl,
        heroUrl: step.imageUrl ?? item.notification.heroUrl,
        windowsImageUrl:
          step.windowsImageUrl ?? item.notification.windowsImageUrl ?? item.notification.heroUrl,
        macosImageUrl:
          step.macosImageUrl ?? item.notification.macosImageUrl ?? item.notification.heroUrl,
        androidImageUrl:
          step.androidImageUrl ?? item.notification.androidImageUrl ?? item.notification.heroUrl,
        actionButtons: step.actionButtons ?? item.notification.actionButtons,
      },
    };
  });

  return applyPendingFlowStepStates(shopDomain, ruleKey, merged);
};
