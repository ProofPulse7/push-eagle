export type NormalizedAutomationRule = {
  id: string;
  ruleKey: string;
  enabled: boolean;
  config: Record<string, unknown>;
  updatedAt?: string | null;
  impressions?: number;
  clicks?: number;
  revenueCents?: number;
};

export const normalizeAutomationRule = (rule: Record<string, unknown>): NormalizedAutomationRule => {
  const ruleKey = String(rule.ruleKey ?? rule.rule_key ?? rule.id ?? '');
  return {
    id: String(rule.id ?? ruleKey),
    ruleKey,
    enabled: Boolean(rule.enabled),
    config: (rule.config ?? {}) as Record<string, unknown>,
    updatedAt: rule.updatedAt ? String(rule.updatedAt) : rule.updated_at ? String(rule.updated_at) : null,
    impressions: Number(rule.impressions ?? 0),
    clicks: Number(rule.clicks ?? 0),
    revenueCents: Number(rule.revenueCents ?? rule.revenue_cents ?? 0),
  };
};

export const normalizeAutomationRules = (rules: unknown): NormalizedAutomationRule[] => {
  if (!Array.isArray(rules)) {
    return [];
  }

  return rules
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => normalizeAutomationRule(item))
    .filter((item) => item.ruleKey.length > 0);
};
