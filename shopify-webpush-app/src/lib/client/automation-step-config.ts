export type AutomationStepConfig = {
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

export type AutomationEditorNotificationState = {
  title: string;
  message: string;
  targetUrl: string;
  iconUrl: string | null;
  heroUrl: string | null;
  windowsHeroUrl: string | null;
  macHeroUrl: string | null;
  androidHeroUrl: string | null;
  actionButtons: Array<{ title: string; link: string }>;
};

export const mapAutomationStepToNotification = (
  step: AutomationStepConfig,
  defaultTargetUrl = '',
): AutomationEditorNotificationState => ({
  title: step.title ?? '',
  message: step.body ?? '',
  iconUrl: step.iconUrl ?? null,
  heroUrl: step.imageUrl ?? null,
  windowsHeroUrl: step.windowsImageUrl ?? null,
  macHeroUrl: step.macosImageUrl ?? null,
  androidHeroUrl: step.androidImageUrl ?? null,
  actionButtons: step.actionButtons ?? [],
  targetUrl: step.targetUrl ?? defaultTargetUrl,
});
