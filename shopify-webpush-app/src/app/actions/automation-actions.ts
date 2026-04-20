'use server';

import { revalidatePath } from 'next/cache';

import { listAutomationRules, upsertAutomationRule } from '@/lib/server/data/store';

type SaveStepInput = {
  title: string;
  message: string;
  primaryLink?: string | null;
  logoUrl?: string | null;
  heroUrl?: string | null;
  windowsHeroUrl?: string | null;
  macHeroUrl?: string | null;
  androidHeroUrl?: string | null;
  actionButtons?: Array<{ title: string; link: string }>;
  delayLabel?: string | null;
};

type SupportedAutomationRuleKey = 'welcome_subscriber' | 'cart_abandonment_30m' | 'browse_abandonment_15m' | 'shipping_notifications' | 'back_in_stock' | 'price_drop';

const normalizeTrackedLink = (value: string | null | undefined) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return raw;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.pathname === '/api/track/automation-click' || parsed.pathname === '/api/track/click') {
      return parsed.searchParams.get('u') || raw;
    }
  } catch {
    return raw;
  }

  return raw;
};

const automationDefinitions: Record<SupportedAutomationRuleKey, {
  path: string;
  allowedStepIds: Set<string>;
}> = {
  welcome_subscriber: {
    path: '/automations/welcome-notifications',
    allowedStepIds: new Set(['reminder-1', 'reminder-2', 'reminder-3']),
  },
  cart_abandonment_30m: {
    path: '/automations/abandoned-cart-recovery',
    allowedStepIds: new Set(['cart-reminder-1', 'cart-reminder-2', 'cart-reminder-3']),
  },
  browse_abandonment_15m: {
    path: '/automations/browse-abandonment',
    allowedStepIds: new Set(['browse-reminder-1', 'browse-reminder-2', 'browse-reminder-3']),
  },
  shipping_notifications: {
    path: '/automations/shipping-notifications',
    allowedStepIds: new Set(['shipping-1']),
  },
  back_in_stock: {
    path: '/automations/back-in-stock',
    allowedStepIds: new Set(['stock-1']),
  },
  price_drop: {
    path: '/automations/price-drop',
    allowedStepIds: new Set(['price-1']),
  },
};

const delayLabelToMinutes = (delayLabel: string | null | undefined) => {
  if (!delayLabel) {
    return undefined;
  }

  const normalized = delayLabel.trim().toLowerCase();
  if (normalized.endsWith('minutes') || normalized.endsWith('minute')) {
    return Math.max(0, parseInt(normalized, 10));
  }
  if (normalized.endsWith('hours') || normalized.endsWith('hour')) {
    return Math.max(0, parseInt(normalized, 10) * 60);
  }
  if (normalized.endsWith('days') || normalized.endsWith('day')) {
    return Math.max(0, parseInt(normalized, 10) * 60 * 24);
  }

  return undefined;
};

const normalizeStepId = (ruleKey: SupportedAutomationRuleKey, stepId: string) => {
  const definition = automationDefinitions[ruleKey];
  if (!definition.allowedStepIds.has(stepId)) {
    throw new Error('Unsupported reminder step id.');
  }
  return stepId;
};

export async function saveAutomationStep(ruleKey: SupportedAutomationRuleKey, stepId: string, shopDomain: string, data: SaveStepInput) {
  const normalizedStepId = normalizeStepId(ruleKey, stepId);
  const normalizedShop = String(shopDomain || '').trim().toLowerCase();
  if (!normalizedShop) {
    throw new Error('Missing shop domain while saving automation step.');
  }

  const rules = await listAutomationRules(normalizedShop);
  const targetRule = rules.find((rule) => rule.ruleKey === ruleKey);

  const existingSteps = (targetRule?.config?.steps ?? {}) as Record<string, Record<string, unknown>>;
  const existingStep = (existingSteps[normalizedStepId] ?? {}) as Record<string, unknown>;

  const nextDelay = delayLabelToMinutes(data.delayLabel) ?? Number(existingStep.delayMinutes ?? 0);
  const nextActionButtons = Array.isArray(data.actionButtons)
    ? data.actionButtons
      .filter((item) => item?.title && item?.link)
      .map((item) => ({ ...item, link: normalizeTrackedLink(item.link) }))
    : ((existingStep.actionButtons as Array<{ title: string; link: string }> | undefined) ?? []);

  const stepPatch = {
    enabled: typeof existingStep.enabled === 'boolean' ? Boolean(existingStep.enabled) : true,
    delayMinutes: Number.isFinite(nextDelay) ? nextDelay : 0,
    title: String(data.title ?? existingStep.title ?? ''),
    body: String(data.message ?? existingStep.body ?? ''),
    targetUrl: data.primaryLink == null || String(data.primaryLink).trim() === ''
      ? (existingStep.targetUrl as string | null | undefined) ?? null
      : normalizeTrackedLink(data.primaryLink),
    iconUrl: data.logoUrl ?? (existingStep.iconUrl as string | null | undefined) ?? null,
    imageUrl: data.heroUrl ?? (existingStep.imageUrl as string | null | undefined) ?? null,
    windowsImageUrl: data.windowsHeroUrl ?? (existingStep.windowsImageUrl as string | null | undefined) ?? null,
    macosImageUrl: data.macHeroUrl ?? (existingStep.macosImageUrl as string | null | undefined) ?? null,
    androidImageUrl: data.androidHeroUrl ?? (existingStep.androidImageUrl as string | null | undefined) ?? null,
    actionButtons: nextActionButtons,
  };

  await upsertAutomationRule(
    normalizedShop,
    ruleKey,
    targetRule?.enabled,
    {
      steps: {
        [normalizedStepId]: stepPatch,
      },
    },
  );

  const definition = automationDefinitions[ruleKey];
  revalidatePath(definition.path);
  revalidatePath(`${definition.path}/${normalizedStepId}/edit`);

  return { success: true, message: 'Automation step saved successfully.' };
}
